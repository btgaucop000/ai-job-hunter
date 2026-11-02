export interface SalaryEvidence {
  originalText: string;
  currency: string | null;
  minimum: number | null;
  maximum: number | null;
  basis: 'net' | 'gross' | null;
  payPeriod: string | null;
}
// Only explicitly stated amounts/currencies. No benefits, market estimates,
// lower bound, currency conversion or default monthly period is inferred.
function normalizedSalaryText(text: string): string {
  return text
    .trim()
    .replace(/^(?:mức lương|salary)\s*:\s*/iu, '')
    .replace(/,\s*(?:thỏa thuận|thoả thuận|negotiable)(?:\s+.*)?$/iu, '')
    .replace(/\b\d{1,3}(?:\.\d{3})+(?![\d.])/gu, (amount) =>
      amount.replace(/\./gu, ''),
    )
    .replace(/tháng/giu, 'month');
}
export function salaryEvidence(text: string): SalaryEvidence | null {
  const normalized = normalizedSalaryText(text);
  const number = '(\\d+(?:,\\d{3})*(?:\\.\\d+)?)';
  const suffix =
    '(?:\\s*(USD|US\\$|VND|EUR))?(?:\\s*(net|gross))?(?:\\s*(?:/\\s*|per\\s+)(months?|monthly|years?|yearly|hours?|hourly|days?|daily))?';
  const upper = new RegExp(
    `^(?:up to|maximum|max\\.?)\\s+${number}${suffix}$`,
    'iu',
  ).exec(normalized);
  const range = new RegExp(
    `^${number}\\s*[-–—]\\s*${number}${suffix}$`,
    'iu',
  ).exec(normalized);
  const exact = new RegExp(`^${number}${suffix}$`, 'iu').exec(normalized);
  const match = upper ?? range ?? exact;
  if (!match) return null;
  const parse = (value: string) => Number(value.replace(/,/g, ''));
  const minimum = range ? parse(range[1]!) : null;
  const maximum = upper ? parse(upper[1]!) : range ? parse(range[2]!) : null;
  if (
    parse(match[1]!) <= 0 ||
    (maximum !== null && (!Number.isFinite(maximum) || maximum <= 0)) ||
    (minimum !== null && minimum > maximum!)
  )
    return null;
  const offset = range ? 3 : 2;
  return {
    originalText: text.trim(),
    currency: match[offset]?.toUpperCase().replace('US$', 'USD') ?? null,
    minimum,
    maximum,
    basis:
      (match[offset + 1]?.toLowerCase() as 'net' | 'gross' | undefined) ?? null,
    payPeriod: match[offset + 2]
      ? /month/iu.test(match[offset + 2]!)
        ? 'month'
        : /year/iu.test(match[offset + 2]!)
          ? 'year'
          : /hour/iu.test(match[offset + 2]!)
            ? 'hour'
            : 'day'
      : null,
  };
}
// The existing Vietnamese range format remains valid. Non-numeric placeholders
// cannot become salary candidates even if an AI quotes them verbatim.
export function hasCompensationAmount(text: string): boolean {
  return Boolean(
    salaryEvidence(text) ||
    /\d+(?:[.,]\d+)?\s*M?\s*[-–—]\s*\d+(?:[.,]\d+)?\s*(?:M|triệu)\b/iu.test(
      text,
    ),
  );
}

export function structuredSalaryEvidence(
  value: unknown,
): SalaryEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const money = value as Record<string, unknown>;
  const amount = money.value;
  if (!amount || typeof amount !== 'object' || Array.isArray(amount))
    return null;
  const quantity = amount as Record<string, unknown>;
  if (
    typeof quantity.maxValue !== 'number' ||
    !Number.isFinite(quantity.maxValue) ||
    quantity.maxValue <= 0 ||
    typeof money.currency !== 'string' ||
    !/^[A-Z]{3}$/i.test(money.currency)
  )
    return null;
  const minimum =
    typeof quantity.minValue === 'number' &&
    Number.isFinite(quantity.minValue) &&
    quantity.minValue >= 0
      ? quantity.minValue
      : null;
  if (minimum !== null && minimum > quantity.maxValue) return null;
  return {
    originalText: '',
    currency: money.currency.toUpperCase(),
    minimum,
    maximum: quantity.maxValue,
    basis: null,
    payPeriod: typeof quantity.unitText === 'string' ? quantity.unitText : null,
  };
}

// A disclosure is source evidence, but carries no numeric compensation facts.
export function isNegotiableSalary(text: string): boolean {
  return /^(?:negotiable(?: based on capability)?|thương lượng|thỏa thuận|thoả thuận)$/iu.test(
    text.trim(),
  );
}

// Compare numeric facts, not punctuation; retain original source strings as evidence.
export function mergeEquivalentSalaries(
  values: string[],
): { value: string; conflict: boolean } | undefined {
  const numeric = values.filter((value) => !isNegotiableSalary(value));
  if (!numeric.length) return undefined;
  const facts = numeric.map((value) => {
    const parsed = salaryEvidence(value);
    if (!parsed) return null;
    const exact =
      parsed.minimum === null && parsed.maximum === null
        ? Number(
            normalizedSalaryText(parsed.originalText)
              .match(/^[\d,.]+/u)?.[0]
              ?.replace(/,/gu, ''),
          )
        : null;
    return { ...parsed, exact };
  });
  if (!facts.every((fact): fact is NonNullable<typeof fact> => Boolean(fact)))
    return undefined;
  const currencies = [
    ...new Set(facts.flatMap((fact) => (fact.currency ? [fact.currency] : []))),
  ];
  const periods = [
    ...new Set(
      facts.flatMap((fact) => (fact.payPeriod ? [fact.payPeriod] : [])),
    ),
  ];
  const bases = [
    ...new Set(facts.flatMap((fact) => (fact.basis ? [fact.basis] : []))),
  ];
  if (currencies.length > 1 || periods.length > 1 || bases.length > 1)
    return { value: '', conflict: true };
  const numbers = new Set(
    facts.map((fact) =>
      JSON.stringify([fact.minimum, fact.maximum, fact.exact]),
    ),
  );
  if (numbers.size !== 1) {
    // Preserve the existing upper-bound/header metadata case only when its
    // stated amount agrees. Different exact amounts or range bounds conflict.
    if (
      facts.every((fact) => fact.minimum === null) &&
      new Set(facts.map((fact) => fact.maximum ?? fact.exact)).size === 1
    )
      return undefined;
    return { value: '', conflict: true };
  }
  const full = facts.find(
    (fact) =>
      (!currencies.length || fact.currency === currencies[0]) &&
      (!periods.length || fact.payPeriod === periods[0]) &&
      (!bases.length || fact.basis === bases[0]),
  );
  if (full) return { value: full.originalText, conflict: false };
  const first = facts[0]!;
  const amount =
    first.minimum !== null
      ? `${first.minimum}-${first.maximum}`
      : first.maximum !== null
        ? `Up to ${first.maximum}`
        : String(first.exact);
  return {
    value: [
      amount,
      currencies[0],
      bases[0],
      periods[0] ? `per ${periods[0]}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    conflict: false,
  };
}
