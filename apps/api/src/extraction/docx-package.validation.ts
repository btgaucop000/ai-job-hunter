import { DOMParser } from '@xmldom/xmldom';
import type { Document, Element } from '@xmldom/xmldom';
import { posix } from 'node:path';
import { ExtractionError } from './extraction.errors.js';
import type { DocxPackage } from './docx-zip.js';

const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
const MAIN =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const consumed = new Set([
  'styles',
  'numbering',
  'comments',
  'footnotes',
  'endnotes',
]);
const ordinary = new Set([
  'officeDocument',
  'styles',
  'numbering',
  'comments',
  'footnotes',
  'endnotes',
  'header',
  'footer',
  'image',
  'hyperlink',
  'settings',
  'webSettings',
  'fontTable',
  'theme',
  'extended-properties',
  'custom-properties',
]);
const invalid = () => new ExtractionError('PARSING_FAILED');
const denied = () => new ExtractionError('RESOURCE_ACCESS_DENIED');
const children = (element: Element): Element[] =>
  Array.from(element.childNodes).filter(
    (node): node is Element => node.nodeType === 1,
  );
const attr = (element: Element, name: string) => {
  const value = element.getAttribute(name);
  if (!value) throw invalid();
  return value;
};

function parseXml(bytes: Buffer): Document {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  // Mammoth decodes parts as UTF-8; refuse other encodings rather than disagree.
  if (
    text.includes('\0') ||
    /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text) ||
    /<\?xml[^?]*encoding\s*=\s*['"](?!utf-8['"])[^'"]+['"]/i.test(text)
  )
    throw invalid();
  const document = new DOMParser({
    onError: () => {
      throw invalid();
    },
  }).parseFromString(text, 'application/xml');
  if (!document.documentElement || document.doctype) throw invalid();
  const stack: [Element, number][] = [[document.documentElement, 0]];
  let nodes = 0;
  while (stack.length) {
    const [element, depth] = stack.pop()!;
    if (++nodes > 100_000 || depth > 128)
      throw new ExtractionError('DOCUMENT_TOO_LARGE');
    if (
      element.namespaceURI === WORD &&
      ['altChunk', 'object', 'control'].includes(element.localName!)
    )
      throw denied();
    stack.push(
      ...children(element).map(
        (child) => [child, depth + 1] as [Element, number],
      ),
    );
  }
  return document;
}

function resolvePart(owner: string, target: string): string {
  // Fragment-only hyperlinks are handled separately. Encoded path spellings are unsupported.
  if (!target || /[\\%?#:\s]/.test(target) || target.startsWith('//'))
    throw invalid();
  const parts = target.startsWith('/') ? [] : owner.split('/').slice(0, -1);
  for (const part of target.replace(/^\//, '').split('/')) {
    if (part === '..') {
      if (!parts.length) throw denied();
      parts.pop();
    } else if (part !== '.') {
      if (!part) throw invalid();
      parts.push(part);
    }
  }
  return parts.join('/');
}

export function validateDocxPackage(pkg: DocxPackage): string {
  const documents = new Map<string, Document>();
  for (const [name, bytes] of pkg.xml) documents.set(name, parseXml(bytes));
  const types = documents.get('[Content_Types].xml')?.documentElement;
  if (!types || types.localName !== 'Types' || types.namespaceURI !== TYPES)
    throw invalid();
  const overrides = new Map<string, string>();
  const defaults = new Map<string, string>();
  for (const item of children(types)) {
    if (item.namespaceURI !== TYPES) throw invalid();
    const type = attr(item, 'ContentType');
    if (
      /macro|vba|oleObject|activeX|executable|msdownload|javascript|java-archive|spreadsheetml|presentationml/i.test(
        type,
      )
    )
      throw denied();
    if (item.localName === 'Override') {
      const name = attr(item, 'PartName');
      if (
        !name.startsWith('/') ||
        resolvePart('', name) !== name.slice(1) ||
        overrides.has(name.slice(1))
      )
        throw invalid();
      overrides.set(name.slice(1), type);
    } else if (item.localName === 'Default') {
      const extension = attr(item, 'Extension');
      if (
        !/^[A-Za-z0-9]+$/.test(extension) ||
        defaults.has(extension.toLowerCase())
      )
        throw invalid();
      defaults.set(extension.toLowerCase(), type);
    } else throw invalid();
  }
  for (const name of pkg.names) {
    if (
      /\/(?:embeddings|activeX)\//i.test('/' + name) ||
      /(?:vbaProject|\.(?:exe|dll|bin|com|js|vbs|ps1|bat|cmd|sh|scr|msi|jar)$)/i.test(
        name,
      )
    )
      throw denied();
    if (
      !name.endsWith('/') &&
      name !== '[Content_Types].xml' &&
      !overrides.has(name) &&
      !defaults.has(name.split('.').at(-1)!.toLowerCase())
    )
      throw invalid();
  }
  let main: string | undefined;
  for (const [name, document] of documents) {
    if (!name.endsWith('.rels')) continue;
    const root = document.documentElement!;
    if (root.namespaceURI !== REL || root.localName !== 'Relationships')
      throw invalid();
    const match = /^(.*\/)?_rels\/([^/]+)\.rels$/.exec(name);
    const owner =
      name === '_rels/.rels'
        ? ''
        : match
          ? `${match[1] ?? ''}${match[2]}`
          : undefined;
    if (owner === undefined || (owner && !pkg.names.has(owner)))
      throw invalid();
    const ids = new Set<string>();
    const selectedTypes = new Set<string>();
    for (const item of children(root)) {
      if (item.namespaceURI !== REL || item.localName !== 'Relationship')
        throw invalid();
      const id = attr(item, 'Id');
      const type = attr(item, 'Type');
      const target = attr(item, 'Target');
      if (ids.has(id)) throw invalid();
      ids.add(id);
      const kind = type.startsWith(OFFICE)
        ? type.slice(OFFICE.length)
        : type ===
            'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties'
          ? 'core-properties'
          : '';
      const mode = item.getAttribute('TargetMode');
      if (mode && mode !== 'Internal' && mode !== 'External') throw invalid();
      if (mode === 'External') {
        if (kind !== 'hyperlink') throw denied();
        let url: URL;
        try {
          url = new URL(target);
        } catch {
          throw denied();
        }
        if (
          !['http:', 'https:', 'mailto:'].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw denied();
        continue; // A hyperlink is data only, never fetched or dereferenced.
      }
      if (!ordinary.has(kind) && kind !== 'core-properties') throw denied();
      if (kind === 'hyperlink' && target.startsWith('#')) continue;
      const path = resolvePart(owner, target);
      if (!pkg.names.has(path) || path.endsWith('/')) throw invalid();
      if (kind === 'officeDocument') {
        if (
          owner ||
          main ||
          target.split('/').some((part) => part === '.' || part === '..')
        )
          throw invalid();
        // Exact canonical key must exist in both ZIP views; no missing-main fallback.
        if (target.replace(/^\//, '') !== path || overrides.get(path) !== MAIN)
          throw invalid();
        main = path;
      }
      if (consumed.has(kind)) {
        if (!documents.has(path)) throw invalid();
        if (selectedTypes.has(kind)) throw invalid();
        selectedTypes.add(kind);
        // Mammoth does not normalize these targets. Reject only these ambiguous
        // consumed-part spellings; safe ../ references for images/headers remain valid.
        const mammothPath = target.startsWith('/')
          ? target.slice(1)
          : [posix.dirname(owner) === '.' ? '' : posix.dirname(owner), target]
              .filter(Boolean)
              .join('/');
        if (mammothPath !== path) throw invalid();
      }
    }
  }
  if (!main || !documents.has('_rels/.rels')) throw invalid();
  const root = documents.get(main)?.documentElement;
  if (
    !root ||
    root.namespaceURI !== WORD ||
    root.localName !== 'document' ||
    children(root).filter(
      (node) => node.namespaceURI === WORD && node.localName === 'body',
    ).length !== 1
  )
    throw invalid();
  return main;
}
