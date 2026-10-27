import { TextDecoder } from 'node:util';
import { AnalysisError } from './analysis.errors.js';

// Deliberately supported MIME subset. Parse parameter boundaries before looking
// at names; quoted values are data, never headers or parameter declarations.
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
function parameters(value: string): {
  kind: string;
  params: Map<string, string>;
} {
  const split = value.indexOf(';');
  const kind = (split < 0 ? value : value.slice(0, split)).trim().toLowerCase();
  const params = new Map<string, string>();
  let i = split < 0 ? value.length : split;
  while (i < value.length) {
    if (value[i++] !== ';') throw new AnalysisError('INVALID_REQUEST');
    while (value[i] === ' ' || value[i] === '\t') i++;
    const start = i;
    while (i < value.length && token.test(value[i]!)) i++;
    const name = value.slice(start, i).toLowerCase();
    if (!name || value[i++] !== '=' || params.has(name))
      throw new AnalysisError('INVALID_REQUEST');
    let entry = '';
    if (value[i] === '"') {
      i++;
      while (i < value.length && value[i] !== '"') {
        // Escaped/folded/extended parameter syntax is explicitly unsupported.
        if (
          value[i] === '\\' ||
          value.charCodeAt(i) < 32 ||
          value.charCodeAt(i) === 127
        )
          throw new AnalysisError('INVALID_REQUEST');
        entry += value[i++];
      }
      if (value[i++] !== '"') throw new AnalysisError('INVALID_REQUEST');
    } else {
      const start = i;
      while (i < value.length && token.test(value[i]!)) i++;
      entry = value.slice(start, i);
      if (!entry) throw new AnalysisError('INVALID_REQUEST');
    }
    while (value[i] === ' ' || value[i] === '\t') i++;
    params.set(name, entry);
  }
  return { kind, params };
}
function isTextPart(bytes: Buffer): boolean {
  const headers = new Map<string, string>();
  for (const line of bytes.toString('latin1').split('\r\n')) {
    const at = line.indexOf(':');
    const name = line.slice(0, at).toLowerCase();
    if (
      at < 1 ||
      !token.test(name) ||
      headers.has(name) ||
      ![
        'content-disposition',
        'content-type',
        'content-transfer-encoding',
      ].includes(name)
    )
      throw new AnalysisError('INVALID_REQUEST');
    headers.set(name, line.slice(at + 1).trim());
  }
  const disposition = parameters(headers.get('content-disposition') ?? '');
  const name = disposition.params.get('name');
  if (
    disposition.kind !== 'form-data' ||
    !['cv', 'jdText'].includes(name ?? '') ||
    [...disposition.params.keys()].some(
      (key) => key !== 'name' && key !== 'filename',
    )
  )
    throw new AnalysisError('INVALID_REQUEST');
  const text = name === 'jdText';
  if (
    text
      ? disposition.params.has('filename')
      : !disposition.params.get('filename')
  )
    throw new AnalysisError('INVALID_REQUEST');
  const type = parameters(headers.get('content-type') ?? 'text/plain');
  if (
    text &&
    (type.kind !== 'text/plain' ||
      [...type.params].some(
        ([key, value]) => key !== 'charset' || value.toLowerCase() !== 'utf-8',
      ))
  )
    throw new AnalysisError('INVALID_REQUEST');
  if (!text && type.params.size) throw new AnalysisError('INVALID_REQUEST');
  return text;
}

// Busboy decodes fields permissively (replacement characters and alternate
// charsets). This bounded wire audit rejects invalid UTF-8 instead of silently
// changing JD text. Busboy remains responsible for multipart parsing/parts.
export class MultipartTextEncoding {
  private pending = Buffer.alloc(0);
  private state: 'first' | 'headers' | 'body' | 'done' = 'first';
  private decoder: TextDecoder | undefined;
  private readonly marker: Buffer;
  private readonly first: Buffer;
  constructor(boundary: string) {
    this.marker = Buffer.from(`\r\n--${boundary}`);
    this.first = Buffer.from(`--${boundary}`);
  }
  write(chunk: Buffer): void {
    if (this.state === 'done') return;
    this.pending = Buffer.concat([this.pending, chunk]);
    while (true) {
      if (this.state === 'first') {
        // No preamble support: the first delimiter must begin at byte zero.
        // Otherwise an apparent closing delimiter in preamble data could disable
        // this audit while Busboy continues to parse the actual body.
        const opening = Buffer.concat([this.first, Buffer.from('\r\n')]);
        const count = Math.min(opening.length, this.pending.length);
        if (!this.pending.subarray(0, count).equals(opening.subarray(0, count)))
          throw new AnalysisError('INVALID_REQUEST');
        if (this.pending.length < opening.length) return;
        this.pending = this.pending.subarray(opening.length);
        this.state = 'headers';
      } else if (this.state === 'headers') {
        const at = this.pending.indexOf('\r\n\r\n');
        if (at < 0) {
          if (this.pending.length > 16384)
            throw new AnalysisError('INVALID_REQUEST');
          return;
        }
        if (at + 4 > 16384) throw new AnalysisError('INVALID_REQUEST');
        this.decoder = isTextPart(this.pending.subarray(0, at))
          ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
          : undefined;
        this.pending = this.pending.subarray(at + 4);
        this.state = 'body';
      } else {
        const at = this.pending.indexOf(this.marker);
        if (at < 0) {
          const count = Math.max(
            0,
            this.pending.length - this.marker.length - 2,
          );
          this.decode(this.pending.subarray(0, count), false);
          this.pending = this.pending.subarray(count);
          return;
        }
        if (this.pending.length < at + this.marker.length + 2) return;
        this.decode(this.pending.subarray(0, at), true);
        const suffix = this.pending
          .subarray(at + this.marker.length, at + this.marker.length + 2)
          .toString('latin1');
        this.pending = this.pending.subarray(at + this.marker.length + 2);
        if (suffix === '--') {
          this.state = 'done';
          this.pending = Buffer.alloc(0);
          return;
        }
        if (suffix !== '\r\n') throw new AnalysisError('INVALID_REQUEST');
        this.state = 'headers';
      }
    }
  }
  clear(): void {
    this.pending = Buffer.alloc(0);
    this.decoder = undefined;
  }
  private decode(bytes: Buffer, final: boolean): void {
    try {
      this.decoder?.decode(bytes, { stream: !final });
    } catch {
      throw new AnalysisError('INVALID_REQUEST');
    }
  }
}
