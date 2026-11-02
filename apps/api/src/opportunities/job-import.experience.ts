export interface ExperienceEvidence {
  months: number;
  minimum: boolean;
  qualifier?: 'exact' | 'maximum' | 'range';
  maximumMonths?: number;
}
function experienceText(value: string): string {
  const numbers: Record<string, number> = {
    một: 1,
    hai: 2,
    ba: 3,
    bốn: 4,
    năm: 5,
    sáu: 6,
    bảy: 7,
    tám: 8,
    chín: 9,
    mười: 10,
  };
  return value.replace(
    /(?:một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)(?=\s+(?:năm|tháng)(?:\s|$|[.,]))/giu,
    (word) => String(numbers[word.toLocaleLowerCase()]),
  );
}
export function experienceEvidence(value: string): ExperienceEvidence | null {
  const text = experienceText(value);
  const metadata =
    /^(?:Experience metadata:\s*)?\{?\s*"?monthsOfExperience"?\s*:\s*(\d+)\s*\}?$/iu.exec(
      text.trim(),
    );
  if (metadata) return { months: Number(metadata[1]), minimum: false };
  const range =
    /(?<!\d)(\d+)\s*[-–]\s*(\d+)\s*(năm|years?|tháng|months?)\b/iu.exec(text);
  if (range) {
    const unit = /năm|years?/iu.test(range[3]!) ? 12 : 1;
    const months = Number(range[1]) * unit,
      maximumMonths = Number(range[2]) * unit;
    return months <= maximumMonths
      ? { months, maximumMonths, qualifier: 'range', minimum: false }
      : null;
  }
  const matches = [
    ...text.matchAll(
      /(?<!\d)(\d+)\s*(?:\+\s*)?(năm|years?|tháng|months?)\b/giu,
    ),
  ];
  if (!matches.length) return null;
  const amounts = [
    ...new Set(
      matches.map(
        (match) => Number(match[1]) * (/năm|years?/iu.test(match[2]!) ? 12 : 1),
      ),
    ),
  ];
  if (amounts.length !== 1) return null;
  const qualifier = /chính xác|exactly/iu.test(text)
    ? 'exact'
    : /tối đa|at most|maximum|up to/iu.test(text)
      ? 'maximum'
      : undefined;
  return {
    months: amounts[0]!,
    minimum:
      !qualifier &&
      /ít nhất|tối thiểu|(?:^|\s)từ\s|at least|minimum|\d\s*\+/iu.test(text),
    ...(qualifier ? { qualifier } : {}),
  };
}
export function experienceQuote(
  source: string,
  value: string,
  quote: string,
): string {
  if (experienceEvidence(value) || candidateExperience(value, quote))
    return quote;
  const quotedExperience = experienceEvidence(quote);
  // An explicit qualifier must not be replaced by a different source context.
  if (quotedExperience?.minimum || quotedExperience?.qualifier) return quote;
  if (!/^\d+$/u.test(value.trim())) return quote;
  const contexts = source
    .split(/\r?\n/u)
    .filter((line) =>
      [
        ...experienceText(line).matchAll(
          /(?<!\d)(\d+)\s*(?:năm|years?|tháng|months?)\b/giu,
        ),
      ].some((match) => Number(match[1]) === Number(value)),
    );
  const parsed = contexts.map(experienceEvidence);
  if (
    parsed.length &&
    parsed.every(
      (item) =>
        item &&
        (!quotedExperience || item.months === quotedExperience.months) &&
        item.months === parsed[0]?.months &&
        item.qualifier === parsed[0]?.qualifier &&
        item.maximumMonths === parsed[0]?.maximumMonths,
    )
  )
    return (
      contexts.find((line) => experienceEvidence(line)?.minimum) ?? contexts[0]!
    );
  return quote;
}
export function displayExperience(value: ExperienceEvidence): string {
  const years =
    value.months % 12 === 0 &&
    (value.maximumMonths === undefined || value.maximumMonths % 12 === 0);
  const count = years ? value.months / 12 : value.months;
  const upper =
    value.maximumMonths === undefined
      ? ''
      : `–${years ? value.maximumMonths / 12 : value.maximumMonths}`;
  const prefix = value.minimum
    ? 'Minimum '
    : value.qualifier === 'exact'
      ? 'Exactly '
      : value.qualifier === 'maximum'
        ? 'Maximum '
        : '';
  return `${prefix}${count}${upper} ${years ? (count === 1 && !upper ? 'year' : 'years') : count === 1 && !upper ? 'month' : 'months'}`;
}
export function candidateExperience(
  value: string,
  quote: string,
): ExperienceEvidence | null {
  const direct = experienceEvidence(value),
    context = experienceEvidence(quote);
  if (direct) {
    if (
      context &&
      context.months === direct.months &&
      !direct.minimum &&
      !direct.qualifier
    )
      return context;
    return direct;
  }
  if (!/^\d+$/u.test(value.trim())) return null;
  if (
    context &&
    /monthsOfExperience/iu.test(quote) &&
    context.months === Number(value)
  )
    return context;
  const matches = [
    ...experienceText(quote).matchAll(
      /(?<!\d)(\d+)\s*(?:năm|years?|tháng|months?)\b/giu,
    ),
  ];
  return matches.some((match) => Number(match[1]) === Number(value))
    ? context
    : null;
}
