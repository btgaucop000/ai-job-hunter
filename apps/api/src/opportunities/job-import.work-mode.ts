// Match employment arrangements, not remote device/security functionality.
export function workModeEvidence(
  text: string,
): { value: string; mode: string }[] {
  const phrases = [
    /(?:work mode|working arrangement|hình thức làm việc)\s*[:：]\s*(?:remote|hybrid|on[- ]?site|từ xa|kết hợp|tại văn phòng|làm việc tại văn phòng)\b/giu,
    /\b(?:work(?:ing)?\s+(?:fully\s+)?remote(?:ly)?|(?:fully\s+)?remote\s+(?:position|role|job|work(?:ing)?(?: arrangement)?)|(?:position|role|job)\s+(?:is\s+)?(?:fully\s+)?remote)\b/giu,
    /\b(?:hybrid\s+(?:work(?:ing)?(?: arrangement)?|position|role|job|arrangement)|work(?:ing)?\s+hybrid)\b/giu,
    /\b(?:on[- ]?site\s+(?:at\s+(?:our\s+)?[^.\n]{0,60}\boffice|work(?:ing)?|position|role)|work(?:ing)?\s+on[- ]?site)\b/giu,
    /làm việc\s+(?:remote|hybrid|on[- ]?site|từ xa|tại văn phòng)/giu,
  ];
  const result: { value: string; mode: string }[] = [];
  for (const pattern of phrases)
    for (const match of text.matchAll(pattern)) {
      const phrase = match[0];
      if (
        /\b(?:not|no)(?:\s+an?)?\s*$|không\s*$/iu.test(
          text.slice(Math.max(0, match.index! - 15), match.index),
        )
      )
        continue;
      const term =
        /\b(?:remote(?:ly)?|hybrid|on[- ]?site)\b|từ xa|kết hợp|(?:làm việc )?tại văn phòng/iu.exec(
          phrase,
        )?.[0];
      if (term)
        result.push({
          value: term,
          mode: /remote|từ xa/iu.test(term)
            ? 'Remote'
            : /hybrid|kết hợp/iu.test(term)
              ? 'Hybrid'
              : 'Onsite',
        });
    }
  return result;
}
