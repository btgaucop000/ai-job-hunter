// Source-backed qualification lines shared by discovery and matching. No inference.
export function jdRequirementLines(description: string) {
  const required: string[] = [];
  const preferred: string[] = [];
  let section: 'required' | 'preferred' | null = null;
  for (const raw of description.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    if (
      /^(?:what you bring|qualifications|requirements|required skills)\s*:?$/iu.test(
        line,
      )
    ) {
      section = 'required';
      continue;
    }
    if (
      /^(?:preferred qualifications|preferred skills|nice to have)\s*:?$/iu.test(
        line,
      )
    ) {
      section = 'preferred';
      continue;
    }
    if (
      /^(?:what you(?:'|’)ll do|responsibilities|benefits(?: that benefit you)?|additional information|about us|company description|important notes)\s*:?$/iu.test(
        line,
      )
    ) {
      section = null;
      continue;
    }
    if (
      line.length > 1000 ||
      /\b(?:not required|no .{0,50} required)\b/iu.test(line)
    )
      continue;
    if (
      /preferred|nice[- ]to[- ]have|\bplus\b|bonus|advantage/iu.test(line) ||
      section === 'preferred'
    )
      preferred.push(line);
    else if (
      section === 'required' ||
      /\brequir|\bmust\b|proficien|\bexperience (?:with|in|using)|\bknowledge of/iu.test(
        line,
      )
    )
      required.push(line);
  }
  return { required, preferred };
}
export function alternativeRequirement(value: string): boolean {
  return (
    (/\b(?:at least one|one of|either|such as)\b/iu.test(value) ||
      /\bor\b/iu.test(value) ||
      /\([^)]*\bor\b[^)]*\)/iu.test(value) ||
      /ít nhất\s+(?:một|0?1)\s+(?:trong|công nghệ)|(?:một|0?1)\s+trong/iu.test(
        value,
      )) &&
    /,|\bor\b|hoặc/iu.test(value)
  );
}
