import { DOMParser } from '@xmldom/xmldom';
import type { Element } from '@xmldom/xmldom';

export interface ItviecMetadata {
  skills: string[];
  jobExpertise: string[];
  jobDomains: string[];
}
const children = (element: Element): Element[] =>
  Array.from(element.childNodes).filter(
    (node): node is Element => node.nodeType === 1,
  );
const hasClass = (element: Element, value: string) =>
  (element.getAttribute('class') ?? '').split(/\s+/u).includes(value);
const hidden = (element: Element): boolean => {
  for (
    let node: Element | null = element;
    node;
    node = node.parentNode?.nodeType === 1 ? (node.parentNode as Element) : null
  ) {
    if (
      node.hasAttribute('hidden') ||
      node.getAttribute('aria-hidden') === 'true' ||
      /display\s*:\s*none|visibility\s*:\s*hidden/iu.test(
        node.getAttribute('style') ?? '',
      )
    )
      return true;
  }
  return false;
};
const text = (element: Element) =>
  (element.textContent ?? '').replace(/\s+/gu, ' ').trim();

// Only the observed job header structure is eligible. Unknown/malformed layouts
// remain absent; no navigation, tooltip or analytics data is used as a fallback.
export function itviecMetadata(html: string): ItviecMetadata | undefined {
  try {
    const publicHtml = html
      .replace(
        /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        '',
      )
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<\?[\s\S]*?\?>/g, '');
    // Isolate balanced header divs before DOM parsing: unrelated page SVG/XML
    // namespaces and document markup must not affect the verified fragment.
    const fragments: string[] = [];
    let depth = 0;
    let start = 0;
    for (const tag of publicHtml.matchAll(
      /<\/?div\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,
    )) {
      const closing = /^<\//u.test(tag[0]);
      if (!depth && !closing) {
        const classes =
          /\bclass\s*=\s*["']([^"']*)["']/iu.exec(tag[0])?.[1] ?? '';
        if (!classes.split(/\s+/u).includes('job-show-info')) continue;
        start = tag.index;
        depth = 1;
      } else if (depth) {
        depth += closing ? -1 : 1;
        if (!depth)
          fragments.push(publicHtml.slice(start, tag.index + tag[0].length));
      }
    }
    if (depth || fragments.length !== 1) return undefined;
    const document = new DOMParser({
      onError: () => undefined,
    }).parseFromString(`<html>${fragments[0]}</html>`, 'text/html');
    const headers = Array.from(document.getElementsByTagName('div')).filter(
      (element) => hasClass(element, 'job-show-info') && !hidden(element),
    );
    if (headers.length !== 1) return undefined;
    const result: ItviecMetadata = {
      skills: [],
      jobExpertise: [],
      jobDomains: [],
    };
    for (const container of children(headers[0]!)) {
      if (!hasClass(container, 'imb-3')) continue;
      for (const row of children(container)) {
        const [label, values, ...extra] = children(row);
        if (!label || !values || extra.length || hidden(row)) continue;
        const key = new Map<string, keyof ItviecMetadata>([
          ['Skills:', 'skills'],
          ['Job Expertise:', 'jobExpertise'],
          ['Job Domain:', 'jobDomains'],
        ]).get(text(label));
        if (!key) continue;
        for (const chip of children(values)) {
          if (!hasClass(chip, 'itag') || hidden(chip)) continue;
          if (
            chip.tagName.toLowerCase() !== (key === 'jobDomains' ? 'div' : 'a')
          )
            continue;
          // A chip's own text is its label; descendants are tooltip/icon UI.
          const value = Array.from(chip.childNodes)
            .filter((node) => node.nodeType === 3)
            .map((node) => node.nodeValue ?? '')
            .join(' ')
            .replace(/\s+/gu, ' ')
            .trim();
          if (value && !result[key].includes(value)) result[key].push(value);
        }
      }
    }
    return Object.values(result).some((values) => values.length)
      ? result
      : undefined;
  } catch {
    return undefined;
  }
}

export function itviecDomainCandidates(
  text: string,
): { value: string; quote: string }[] {
  const result: { value: string; quote: string }[] = [];
  for (const match of text.matchAll(
    /^ITviec Job Domain:\n([^]*?)\nEnd ITviec Job Domain$/gm,
  )) {
    for (const value of match[1]!.split('\n').filter(Boolean))
      if (
        !result.some((item) => item.value === value && item.quote === match[0])
      )
        result.push({ value, quote: match[0] });
  }
  return result;
}
