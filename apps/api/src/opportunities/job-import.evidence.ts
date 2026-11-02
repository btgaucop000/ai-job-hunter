import { workModeEvidence } from './job-import.work-mode.js';
import {
  experienceEvidence,
  displayExperience,
  candidateExperience,
} from './job-import.experience.js';
import {
  businessDomainCandidates,
  mergeBusinessDomains,
} from './job-import.domain.js';
import { sectionCandidates } from './job-import.sections.js';
import {
  salaryEvidence,
  isNegotiableSalary,
  mergeEquivalentSalaries,
} from './job-import.salary.js';
import type {
  ImportCandidate,
  ImportFieldName,
} from './job-import.contract.js';
const preferred =
  /ưu tiên|preferred|nice[- ]to[- ]have|desirable|điểm cộng|là (?:một )?lợi thế/iu;
const unknown =
  /^(?:unknown|not (?:stated|provided|specified)|n\/?a|chưa rõ|không rõ|confidential|tbd)$/iu;
const fold = (text: string) =>
  text.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi');
export const isPreferred = (quote: string, value?: string) => {
  const line = value
    ? quote.split(/\r?\n/u).find((part) => quotedText(part, value))
    : undefined;
  return preferred.test(line ?? quote);
};
export function quotedText(source: string, text: string): string | undefined {
  if (!text.trim()) return undefined;
  const escaped = text
    .trim()
    .split(/\s+/u)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(escaped, 'iu').exec(source)?.[0];
}
// Classify new JD suggestions only. Saved/manual values never pass this filter.
export function recruiterContactCandidates(
  candidates: readonly ImportCandidate[],
  jd: string,
): ImportCandidate[] {
  const application =
    /(?:\b(?:HR|recruiter)(?:\s+(?:contact|phone|email|department|team))?\s*[:：-]|\bHR\s+(?:contact|phone|email|department|team)\b|^(?:HR|recruiter|human resources)\s*$|contact\s+(?:HR|recruiter)|human resources\s+(?:contact|phone|email|department|team))|recruitment contact|for\s+(?:applications?|recruitment)|application(?:s)? (?:contact|instructions|phone|email)|how to apply|apply (?:via|by|to)|(?:send|submit).{0,40}\bCV\b|(?:phòng|bộ phận) nhân sự|liên hệ.{0,30}(?:ứng tuyển|tuyển dụng)|gửi.{0,30}\bCV\b|nộp.{0,30}hồ sơ|^(?:thông tin|hướng dẫn|cách thức)?\s*ứng tuyển/iu;
  const office =
    /\bfax\b|\boffice\b|letterhead|switchboard|company (?:phone|email|contact)|văn phòng|trụ sở|tổng đài/iu;
  const contact = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\d[\d .()+-]{6,}\d/iu;
  const eligible: { text: string; quote: string }[] = [];
  let headingStart = -1,
    remaining = 0;
  for (const match of jd.matchAll(/[^\r\n;|,\t]+/gu)) {
    const text = match[0].trim();
    if (!text) continue;
    const start = match.index + match[0].indexOf(text),
      end = start + text.length;
    const explicit = application.test(text),
      general = office.test(text),
      hasContact = contact.test(text);
    // Mixed office/HR clauses with several methods are ambiguous; never
    // authorize every number merely because HR appears somewhere in the clause.
    const attributed =
      explicit &&
      (!general ||
        [...text.matchAll(new RegExp(contact.source, 'giu'))].length <= 1);
    if (attributed) {
      eligible.push({ text, quote: text });
      headingStart = start;
      remaining = 4;
    } else if (!general && hasContact && remaining > 0) {
      eligible.push({ text, quote: jd.slice(headingStart, end) });
      remaining--;
    } else {
      headingStart = -1;
      remaining = 0;
    }
  }
  return candidates.flatMap((candidate) => {
    if (candidate.field !== 'contactNotes' || candidate.source !== 'jd')
      return [candidate];
    // Inspect the actual JD context, not a model-supplied role/shortened quote.
    const direct = eligible.find((part) =>
      quotedText(part.text, candidate.value),
    );
    if (direct) return [{ ...candidate, quote: direct.quote }];
    // A model may put letterhead and HR contacts in one value. Keep only its
    // explicitly attributed application-contact portions, never the whole blob.
    return eligible
      .filter(
        (part) =>
          contact.test(part.text) && quotedText(candidate.value, part.text),
      )
      .map((part) => ({ ...candidate, value: part.text, quote: part.quote }));
  });
}

export function canonicalValue(field: ImportFieldName, value: string): string {
  const v = value.trim().replace(/\s+/gu, ' ');
  if (field === 'contactNotes')
    return v.replace(/(?<![\p{L}\p{N}])zl\s*[:：]?\s*(?=\+?\d)/giu, 'Zalo: ');
  if (field === 'title')
    return v
      .replace(/^(?:\d+\.\s*)?(?:tuyển dụng|tuyển)\s+/iu, '')
      .replace(/\s*[:：].*$/u, '')
      .trim();
  if (field === 'workMode')
    return /^(?:on[- ]?site|tại văn phòng|làm việc tại văn phòng)$/iu.test(v)
      ? 'Onsite'
      : /^(?:remote(?:ly)?|từ xa|TELECOMMUTE)$/iu.test(v)
        ? 'Remote'
        : /^(?:hybrid|kết hợp)$/iu.test(v)
          ? 'Hybrid'
          : v;
  if (field === 'experience') {
    const parsed = experienceEvidence(v);
    if (parsed) return displayExperience(parsed);
  }
  if (field === 'company') {
    const name = v.replace(
      /^công ty\s+(?:(?:cổ phần|tnhh(?: một thành viên)?)\s+)?(?:công nghệ phần mềm\s+)?/iu,
      '',
    );
    return /[À-ỹ]/u.test(name) && name === name.toLocaleUpperCase('vi')
      ? name
          .toLocaleLowerCase('vi')
          .replace(/(^|\s)\p{L}/gu, (c) => c.toLocaleUpperCase('vi'))
      : name;
  }
  if (
    field === 'salary' &&
    /^(?:thương lượng|thỏa thuận|thoả thuận)$/iu.test(v)
  )
    return 'Negotiable';
  if (field === 'skills' || field === 'preferredSkills') {
    if (/^BE\s+Java$/iu.test(v)) return 'Backend Java';
    if (/^voicebot$/iu.test(v)) return 'Voicebot';
    if (/^phát triển (?:ứng dụng )?AI$/iu.test(v))
      return 'AI application development';
  }
  return field === 'skills' || field === 'preferredSkills'
    ? v.replace(/\bhoặc\b/giu, 'OR')
    : v;
}
function locationCities(value: string): string[] {
  const text = value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return [
    ...new Set(
      [
        ...text.matchAll(
          /\b(?:ha noi|hanoi|ho chi minh(?: city)?|hcmc|hcm|sai gon)\b/gu,
        ),
      ].map((match) => (/ha noi|hanoi/u.test(match[0]) ? 'hanoi' : 'hcm')),
    ),
  ];
}
function locationParts(value: string) {
  const district = /(?:quận|district|q\.)\s*(\d+)/iu.exec(value)?.[1];
  const city = /\b(?:HCM|TP\.?\s*HCM|Ho Chi Minh)|Hồ Chí Minh/iu.test(value)
    ? 'TP.HCM'
    : /Hà Nội|Ha Noi|Hanoi/iu.test(value)
      ? 'Hà Nội'
      : undefined;
  const remainder = value
    .replace(/(?:quận|district|q\.)\s*\d+/giu, '')
    .replace(
      /(?:TP\.?\s*)?HCM|Ho Chi Minh|Hồ Chí Minh|Hà Nội|Ha Noi|Hanoi/giu,
      '',
    )
    .replace(/[\s,()[\].-]/gu, '');
  return remainder ? {} : { district, city };
}
// Only a role-bearing prefix with descriptive suffixes is compatible; a second
// role/seniority label is a real difference, not a shortened rendering.
function completeTitle(values: string[]): string | undefined {
  const words = (value: string) =>
    fold(value).match(/[\p{L}\p{N}+#.]+/gu) ?? [];
  return values.find((full) =>
    values.every((short) => {
      if (fold(short) === fold(full)) return true;
      const a = words(short),
        b = words(full);
      return (
        a.length >= 2 &&
        /\b(?:developer|engineer|architect|analyst)\b/iu.test(short) &&
        a.length < b.length &&
        a.every((word, index) => word === b[index]) &&
        !b
          .slice(a.length)
          .some((word) =>
            /^(?:developer|engineer|architect|analyst|manager|lead|junior|senior|intern)$/iu.test(
              word,
            ),
          )
      );
    }),
  );
}
function detailedLocation(values: string[]): string | undefined {
  const parts = values.map((value) => {
    const text = value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/đ/giu, 'd')
      .toLowerCase()
      .replace(
        /\b(?:tp\.?\s*|thanh pho\s+)?(?:ho chi minh(?: city)?|hcmc|hcm(?: city)?|sai ?gon)\b/gu,
        ' city_hcm ',
      )
      .replace(
        /\b(?:tp\.?\s*|thanh pho\s+)?(?:ha noi|hanoi)\b/gu,
        ' city_hanoi ',
      )
      .replace(
        /\b(?:quan|district|q)\.?\s*0*(\d+)\b/gu,
        (_, number: string) => ` district_${Number(number)} `,
      )
      .replace(/\b(?:viet nam|vietnam|vn)\b/gu, ' country_vn ');
    const tokens: string[] = text.match(/[a-z0-9_]+/gu) ?? [];
    const cities = [
      ...new Set(tokens.filter((token) => token.startsWith('city_'))),
    ];
    const districts = [
      ...new Set(tokens.filter((token) => token.startsWith('district_'))),
    ];
    return {
      value,
      tokens,
      city: cities[0],
      district: districts[0],
      country: tokens.includes('country_vn'),
      valid: cities.length <= 1 && districts.length <= 1,
      address: tokens.filter(
        (token) => !/^(?:city_|district_|country_)/u.test(token),
      ),
    };
  });
  // Keep the existing canonical city/district-only display rules. This branch
  // handles source addresses and country-qualified geographic descriptions.
  if (!parts.some((part) => part.city && (part.address.length || part.country)))
    return undefined;
  const containsTokens = (full: string[], short: string[]) =>
    short.length <= full.length &&
    full.some((_, start) =>
      short.every((token, offset) => full[start + offset] === token),
    );
  const full = [...parts]
    .sort(
      (a, b) =>
        b.tokens.length - a.tokens.length || b.value.length - a.value.length,
    )
    .find(
      (a) =>
        a.valid &&
        a.city &&
        parts.every((b) => {
          if (
            !b.valid ||
            (b.city && b.city !== a.city) ||
            (b.district && b.district !== a.district)
          )
            return false;
          if (!b.city && !b.district) return false;
          // Unknown address/city words must also occur as complete, contiguous
          // tokens; equal district numbers alone cannot authorize another address.
          return !b.address.length || containsTokens(a.address, b.address);
        }),
    );
  return full?.value;
}
function salaryParts(value: string) {
  const range =
    /(\d+(?:[.,]\d+)?)\s*M?\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(?:M|triệu)/iu.exec(
      value,
    );
  if (!range) return undefined;
  return {
    range: `${range[1]}M-${range[2]}M`,
    currency: /\b(?:USD|VND|EUR)\b/iu.exec(value)?.[0]?.toUpperCase(),
    basis: /gross/iu.test(value)
      ? 'gross'
      : /\bnet\b/iu.test(value)
        ? 'net'
        : undefined,
    period: /(?:\/|mỗi\s*|per\s+)(?:tháng|month)/iu.test(value)
      ? 'month'
      : /(?:\/|mỗi\s*|per\s+)(?:năm|year)/iu.test(value)
        ? 'year'
        : undefined,
  };
}
// Combine compatible detail only when each component has its own source evidence.
export function mergedValues(
  field: ImportFieldName,
  candidates: ImportCandidate[],
): { value: string; conflict: boolean } {
  const values = [
    ...new Map(
      candidates.map((c) => {
        const v = canonicalValue(field, c.value);
        return [fold(v), v];
      }),
    ).values(),
  ];
  if (field === 'skills' || field === 'preferredSkills') {
    const labels = values.filter(
      (value) =>
        !/^[\p{L}+#.]+$/u.test(value) ||
        !values.some(
          (other) =>
            other !== value &&
            new RegExp(
              `(?<![\\p{L}\\p{N}])${value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s+Core(?![\\p{L}\\p{N}])`,
              'iu',
            ).test(other),
        ),
    );
    const value = labels.join('\n');
    return {
      value: value.length > 10000 ? '' : value,
      conflict: value.length > 10000,
    };
  }
  if (field === 'experience' && candidates.length) {
    const parts = candidates.map((candidate) =>
      candidateExperience(candidate.value, candidate.quote),
    );
    if (
      parts.every((part): part is NonNullable<typeof part> => Boolean(part)) &&
      new Set(
        parts.map((part) =>
          JSON.stringify([
            part.months,
            part.qualifier ?? null,
            part.maximumMonths ?? null,
          ]),
        ),
      ).size === 1
    )
      return {
        value: displayExperience({
          ...parts[0]!,
          minimum: parts.some((part) => part.minimum),
        }),
        conflict: false,
      };
  }
  if (field === 'domain') return mergeBusinessDomains(candidates);
  if (field === 'contactNotes' && values.length) {
    const full = values.find((value) =>
      values.every((part) => fold(value).includes(fold(part))),
    );
    if (full) return { value: full, conflict: false };
    // Separate source-backed contact methods are complementary, not alternatives.
    const value = values
      .filter(
        (part) =>
          !values.some(
            (other) => other !== part && fold(other).includes(fold(part)),
          ),
      )
      .join('\n');
    return {
      value: value.length > 10000 ? '' : value,
      conflict: value.length > 10000,
    };
  }
  if (field === 'title' && values.length > 1) {
    const full = completeTitle(values);
    if (full) return { value: full, conflict: false };
  }
  if (field === 'location' && values.length) {
    // A structured location list uses semicolons. Two cities inside one address
    // are ambiguous metadata, not proof that either city can be discarded.
    if (
      values.some((value) =>
        value.split(';').some((part) => locationCities(part).length > 1),
      )
    )
      return { value: '', conflict: true };
    const locations = values.find(
      (full) =>
        full.includes(';') &&
        values.every((short) =>
          short
            .split(';')
            .every((part) =>
              full
                .split(';')
                .some(
                  (address) =>
                    fold(address.trim()) === fold(part.trim()) ||
                    Boolean(detailedLocation([address.trim(), part.trim()])),
                ),
            ),
        ),
    );
    if (locations) return { value: locations, conflict: false };
    const full = detailedLocation(values);
    if (full) return { value: full, conflict: false };
    const parts = values.map(locationParts);
    if (parts.every((p) => p.city || p.district)) {
      const cities = [
        ...new Set(parts.flatMap((p) => (p.city ? [p.city] : []))),
      ];
      const districts = [
        ...new Set(parts.flatMap((p) => (p.district ? [p.district] : []))),
      ];
      if (cities.length <= 1 && districts.length <= 1)
        return {
          value: [districts[0] ? `Quận ${districts[0]}` : '', cities[0]]
            .filter(Boolean)
            .join(', '),
          conflict: false,
        };
    }
  }
  if (field === 'salary' && values.length) {
    const equivalent = mergeEquivalentSalaries(values);
    if (equivalent) return equivalent;
    const full = values.find(
      (value) =>
        salaryEvidence(value) &&
        values.every((part) => fold(value).includes(fold(part))),
    );
    if (full) return { value: full, conflict: false };
    const parts = values.map(salaryParts);
    if (parts.every((p): p is NonNullable<typeof p> => Boolean(p))) {
      const ranges = [...new Set(parts.map((p) => p.range))],
        bases = [...new Set(parts.flatMap((p) => (p.basis ? [p.basis] : [])))],
        currencies = [
          ...new Set(parts.flatMap((p) => (p.currency ? [p.currency] : []))),
        ],
        periods = [
          ...new Set(parts.flatMap((p) => (p.period ? [p.period] : []))),
        ];
      if (
        ranges.length === 1 &&
        bases.length <= 1 &&
        periods.length <= 1 &&
        currencies.length <= 1
      )
        return {
          value: `${ranges[0]}${currencies[0] ? ` ${currencies[0]}` : ''}${bases[0] ? ` ${bases[0]}` : ''}${periods[0] ? `/${periods[0]}` : ''}`,
          conflict: false,
        };
    }
  }
  return {
    value: values.length > 1 ? '' : (values[0] ?? ''),
    conflict: values.length > 1,
  };
}
// Narrow, explicit recruitment wording only; no inference from title to skills,
// location to work mode, issuer to client, or unspecified salary periods.
export function sourceCandidates(post: string, jd: string): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  const add = (
    field: ImportFieldName,
    value: string,
    source: 'post' | 'jd',
    quote: string,
  ) => {
    if (value.trim() && !unknown.test(value.trim()))
      candidates.push({ field, value: value.trim(), source, quote });
  };
  for (const [source, text] of Object.entries({ post, jd }) as [
    'post' | 'jd',
    string,
  ][]) {
    candidates.push(
      ...sectionCandidates(text, source),
      ...businessDomainCandidates(text, source),
    );
    for (const line of text
      .split(/\r?\n/u)
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (
        /không (?:yêu cầu|bắt buộc|cần)|not required|ignore.*instructions/iu.test(
          line,
        )
      )
        continue;
      // English labels also cover common manual/producer-supplied structured posts.
      const label =
        /^(?:[-•]\s*)?(job title|vị trí|company|hiring company|recruitment agency|recruiter\/contact|contact|liên hệ|location|work mode|experience|preferred skills|domain|lĩnh vực)\s*[:：]\s*(.+)$/iu.exec(
          line,
        );
      if (label) {
        const field = (
          {
            'job title': 'title',
            'vị trí': 'title',
            company: 'company',
            'hiring company': 'company',
            'recruitment agency': 'agency',
            'recruiter/contact': 'contactNotes',
            contact: 'contactNotes',
            'liên hệ': 'contactNotes',
            location: 'location',
            'work mode': 'workMode',
            experience: 'experience',
            'preferred skills': 'preferredSkills',
            domain: 'domain',
            'lĩnh vực': 'domain',
          } as Record<string, ImportFieldName>
        )[fold(label[1]!)];
        if (field && field !== 'domain') add(field, label[2]!, source, line);
      }
      const title =
        /(?:^|\d+\.\s*)tuyển\s+([^:\n]+?)\s*(?=[:：]|\s+số lượng)/iu.exec(line);
      if (title) add('title', title[1]!, source, line);
      if (
        /^[\p{L}+#.]+(?:\s+[\p{L}+#.]+){0,4}$/u.test(line) &&
        /(?:\b(?:Developer|Engineer|Architect|Analyst)\b|Lập trình viên|Kỹ sư)/iu.test(
          line,
        )
      )
        add('title', line, source, line);
      if (/^công ty\s+(?:cổ phần|tnhh)\s+/iu.test(line))
        add('company', line, source, line);
      const district =
        /(?:quận|district|q\.)\s*\d+(?:\s*,\s*(?:TP\.?\s*)?HCM)?/iu.exec(line);
      if (
        district &&
        /làm việc|địa điểm|location|work|onsite|hybrid|remote/iu.test(line)
      )
        add('location', district[0], source, line);
      const headerCity = /^\[(HCM|HN)\]/iu.exec(line);
      if (headerCity)
        add(
          'location',
          headerCity[1]!.toUpperCase() === 'HN'
            ? headerCity[0]!
            : headerCity[1]!,
          source,
          line,
        );
      for (const mode of workModeEvidence(line))
        add('workMode', mode.value, source, line);
      const experience =
        /(?:từ|tối thiểu|ít nhất|minimum|at least)\s*\d+\s*(?:năm|years?)/iu.exec(
          line,
        );
      if (experience && /\bKN\b|kinh nghiệm|experience|years?/iu.test(line))
        add('experience', experience[0], source, line);
      if (/^salary\s*[:：]/iu.test(line)) {
        const original = line.replace(/^salary\s*[:：]\s*/iu, '');
        if (salaryEvidence(original)) add('salary', original, source, line);
      }
      if (isNegotiableSalary(line)) add('salary', line, source, line);
      const disclosure =
        /^Salary disclosure:\s*((?:Thương lượng|Thỏa thuận|Thoả thuận|Negotiable))\b/iu.exec(
          line,
        );
      const negotiation =
        /(?:mức\s+)?lương.{0,120}?(thỏa thuận|thoả thuận|thương lượng)/iu.exec(
          line,
        );
      if (disclosure || negotiation)
        add('salary', disclosure?.[1] ?? negotiation![1]!, source, line);
      const rangeExperience =
        /(?<!\d)(?:\d+\s*[-–]\s*)?\d+\s*years? of experience/iu.exec(line);
      if (rangeExperience)
        add(
          'experience',
          rangeExperience[0].replace(/ of experience$/iu, ''),
          source,
          line,
        );
      const level = /^Level:\s*(.+)$/iu.exec(line);
      if (level) add('seniority', level[1]!, source, line);
      const priority = isPreferred(line);
      const skillField = priority ? 'preferredSkills' : 'skills';
      if (priority || /bắt buộc|thành thạo|required|must have/iu.test(line)) {
        for (const match of line.matchAll(
          /\b(?:BE\s+Java|Python|AI\/ML|Voicebot)\b/giu,
        ))
          add(skillField, match[0], source, line);
        const aiDevelopment = /phát triển (?:ứng dụng )?AI\b/iu.exec(line);
        if (aiDevelopment) add(skillField, aiDevelopment[0], source, line);
      }
      const salary =
        /(\d+(?:[.,]\d+)?\s*M?\s*[-–—]\s*\d+(?:[.,]\d+)?\s*(?:M|triệu)(?:\s*(?:gross|net))?(?:\s*(?:\/|mỗi\s*|per\s+)(?:tháng|month|năm|year))?)/iu.exec(
          line,
        );
      if (salary && /lương|salary|compensation/iu.test(line))
        add('salary', salary[1]!, source, line);
      if (/gửi CV|mail|email|contact|liên hệ|recruiter/iu.test(line))
        for (const email of line.matchAll(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu,
        ))
          add('contactNotes', email[0], source, line);
      for (const phone of line.matchAll(
        /(?<![\p{L}\p{N}])(?:zalo|zl|phone|hotline|tel(?:ephone)?|điện thoại|sđt)\s*(?:(?:for\s+(?:applications?|recruitment)|ứng tuyển|tuyển dụng)\s*)?[:：]?\s*\+?\d[\d .()-]{6,}\d/giu,
      )) {
        const digits = phone[0].replace(/\D/gu, '');
        if (digits.length >= 8 && digits.length <= 15)
          add('contactNotes', phone[0], source, line);
      }
    }
  }
  if (candidates.length > 60) throw new Error('Source candidate limit');
  return recruiterContactCandidates(candidates, jd);
}
