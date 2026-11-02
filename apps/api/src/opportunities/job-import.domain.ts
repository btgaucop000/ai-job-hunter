import { requirementLines } from './job-import.sections.js';
import type { ImportCandidate } from './job-import.contract.js';
const normalized = (value: string) =>
  value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
function useful(value: string): boolean {
  return (
    Boolean(value.trim()) &&
    !/^(?:information technology(?: and services)?|hệ thống cntt(?: & thiết bị)?|thiết bị|công nghệ thông tin|it phần mềm|it|computer software|software(?: development| engineering)?|enterprise software|technology|unknown|n\/a)$/iu.test(
      value.trim(),
    ) &&
    !/architecture|programming|\b(?:TDD|DDD|ARC42|CI\/CD|Java|Python|Spring Boot|TypeScript)\b|engineering method|development tools/iu.test(
      value,
    )
  );
}
// Recover only explicitly attributed business/application areas, not skills,
// employer names, benefit insurance, generic IT categories or CV experience.
export function businessDomainCandidates(
  text: string,
  source: 'post' | 'jd',
): ImportCandidate[] {
  const result: ImportCandidate[] = [];
  const qualifications = requirementLines(text);
  const employers = new Set(
    text
      .split(/\r?\n/u)
      .flatMap(
        (line) =>
          /^\s*(?:company|hiring company):\s*(.+)$/iu.exec(line)?.[1] ?? [],
      )
      .map(normalized),
  );
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    const qualification = qualifications.filter(
      (item) => item.kind && line.includes(item.line),
    );
    if (
      qualification.some((item) => item.kind === 'preferredSkills') ||
      /^(?:company|job title):|đại học|học viện|university/iu.test(line)
    )
      continue;
    const project =
      /\bindustries\s+(?:such as|including|like)\s+([^.!?]+)/iu.exec(line) ??
      /\bprojects?\s+in\s+([^.!?]+)/iu.exec(line);
    const label =
      /^(?:project domains?|business domains?|domain|lĩnh vực|source industry)\s*[:：]\s*(.+)/iu.exec(
        line,
      );
    const informal =
      /\bdomain\s+([A-Za-z][A-Za-z /&-]*?)(?=\s+công ty|\s+company|[:\n]|$)/iu.exec(
        line,
      );
    const mvno = /(?:dự án|project)\s*[:：]?\s*(MVNO)\b/iu.exec(line);
    const digitalBusiness =
      /(?:financial services|insurance).{0,50}digital channels|digital channels.{0,50}(?:financial services|insurance)/iu.test(
        line,
      )
        ? [...line.matchAll(/\b(?:financial services|insurance)\b/giu)]
            .map((match) => match[0])
            .join(', ')
        : undefined;
    const rawProduct =
      /\bfor\s+([\p{L}][\p{L}\p{N} &/-]*(?:\s*\([A-Z0-9-]+\))?)\s+products?\b/u.exec(
        line,
      );
    const product =
      rawProduct && !employers.has(normalized(rawProduct[1]!))
        ? rawProduct
        : null;
    const business =
      !qualification.length &&
      /phát triển|xây dựng|dự án|develop|build|platform|project|digital channels/iu.test(
        line,
      )
        ? [
            ...line.matchAll(
              /(?<![\p{L}\p{N}])(?:tài chính(?: số| điện tử)?|thanh toán(?: số| điện tử)?|ngân hàng|bất động sản|digital payments?|financial(?: services)?|finance|banking|real[- ]estate(?: technology)?|PropTech|FinTech)(?![\p{L}\p{N}])/giu,
            ),
          ].map((match) => match[0])
        : [];
    if (
      business.length &&
      !(mvno || project || label || informal || digitalBusiness)
    ) {
      for (const value of business)
        result.push({ field: 'domain', value, source, quote: line });
      continue;
    }
    const list =
      product?.[1] ??
      mvno?.[1] ??
      project?.[1] ??
      label?.[1] ??
      informal?.[1] ??
      digitalBusiness;
    if (!list) continue;
    for (const part of list
      .replace(/[.;]+$/u, '')
      .split(/,\s*(?:and\s+)?|\s+(?:and|&)\s+|\//iu)) {
      const value = part.trim();
      if (useful(value))
        result.push({ field: 'domain', value, source, quote: line });
    }
  }
  return result.some(
    (candidate) => !/^Source industry:/iu.test(candidate.quote),
  )
    ? result.filter((candidate) => !/^Source industry:/iu.test(candidate.quote))
    : result;
}
export function supportedBusinessDomain(text: string, value: string): boolean {
  return (
    useful(value) &&
    businessDomainCandidates(text, 'post').some(
      (candidate) => normalized(candidate.value) === normalized(value),
    )
  );
}
export function mergeBusinessDomains(candidates: ImportCandidate[]): {
  value: string;
  conflict: boolean;
} {
  // Items explicitly enumerated together form one multi-domain value. Separate
  // incompatible declarations retain the existing human conflict-review flow.
  const groups = new Map<string, Map<string, string>>();
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.quote}`;
    const group = groups.get(key) ?? new Map<string, string>();
    group.set(normalized(candidate.value), candidate.value);
    groups.set(key, group);
  }
  const domainFamily = (value: string) =>
    /tài chính|thanh toán|financial|finance|banking|ngân hàng|fintech|digital payment/iu.test(
      value,
    )
      ? 'finance'
      : /proptech|real[- ]estate|bất động sản/iu.test(value)
        ? 'property'
        : null;
  const families = candidates.map((candidate) => domainFamily(candidate.value));
  if (
    families.length &&
    families.every(Boolean) &&
    new Set(families).size === 1
  ) {
    const value = [
      ...new Map(
        candidates.map((candidate) => [
          normalized(candidate.value),
          candidate.value,
        ]),
      ).values(),
    ].join(', ');
    return {
      value: value.length <= 2000 ? value : '',
      conflict: value.length > 2000,
    };
  }
  const lists = [...groups.values()];
  const full = lists.find((list) =>
    lists.every((other) => [...other.keys()].every((key) => list.has(key))),
  );
  const quote =
    [...groups.entries()].find(([, group]) => group === full)?.[0] ?? '';
  const value = full
    ? [...full.values()]
        .sort(
          (a, b) =>
            normalized(quote).indexOf(normalized(a)) -
            normalized(quote).indexOf(normalized(b)),
        )
        .join(', ')
    : '';
  return {
    value: value.length <= 2000 ? value : '',
    conflict: value.length > 2000 || (!full && lists.length > 1),
  };
}
