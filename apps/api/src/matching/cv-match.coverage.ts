import { normalize } from './matching.policy.js';

export type CoverageStatus =
  'EVIDENCED' | 'PARTIAL' | 'NOT_EVIDENCED' | 'CONFLICT';
export interface RequirementComponent {
  id: string;
  label: string;
  jdQuote: string;
}
export interface RequirementGroup {
  mode: 'SINGLE' | 'AND' | 'OR' | 'UNKNOWN';
  components: RequirementComponent[];
  context: 'skill' | 'design' | 'knowledge' | 'experience' | 'education';
  personalDelivery?: true;
  minimumYears?: number;
}
export interface ComponentEvidence {
  componentId: string;
  jdQuote: string;
  cvQuote: string;
}
export interface ComponentCoverage extends RequirementComponent {
  status: Exclude<CoverageStatus, 'PARTIAL'>;
  cvQuote: string;
  conflictingQuotes: string[];
}

// Keep prose clauses whole; only bare comma/semicolon skill lists are independent
// parents. Unknown prose is deliberately not reduced to disconnected keywords.
export function simpleSkillList(line: string): boolean {
  return (
    !/\b(?:and|or|experience|knowledge|understanding|design\w*|ability|skills|degree|built|delivered|working|strong|proficien\w*|including|such as|at least)\b/iu.test(
      line,
    ) &&
    line.split(/[,;]+/u).every((part) => part.trim().split(/\s+/u).length <= 3)
  );
}

// A single named language is an atomic qualification, not an ambiguous list.
const singleManagedLanguage =
  /^Backend service experience in managed languages including ([\w+#.-]+)$/iu;

export function requirementGroup(
  requirement: string,
  category: string,
): RequirementGroup {
  const text = requirement.trim().replace(/\.$/u, '');
  const group = (
    mode: RequirementGroup['mode'],
    labels: string[],
    context: RequirementGroup['context'] = 'skill',
    personalDelivery?: true,
  ): RequirementGroup => ({
    mode,
    context,
    ...(personalDelivery ? { personalDelivery } : {}),
    components: labels.map((label, index) => ({
      id: `c${index + 1}`,
      label,
      jdQuote: label,
    })),
  });
  if (category !== 'skill') return group('SINGLE', [text]);
  const duration =
    /^(?:(?:minimum|at least)\s+)?(\d+)\+? years? (?:of )?experience (?:with|in) (.+)$/iu.exec(
      text,
    );
  if (duration) {
    const parsed = requirementGroup(`Experience with ${duration[2]}`, category);
    // Component JD spans are literal substrings of the original parent.
    return { ...parsed, minimumYears: Number(duration[1]) };
  }
  if (
    /\b(?:personally|beyond (?:the )?prototype)\b/iu.test(text) &&
    !/^Personally (?:built|developed) and (?:delivered|deployed) at least one .+ application (?:beyond the prototype stage|to production)$/iu.test(
      text,
    )
  )
    return group('UNKNOWN', [text]);
  const reverseEducation =
    /^(equivalent practical experience)\s+or\s+(.+degree.+)$/iu.exec(text);
  if (reverseEducation)
    return group(
      'OR',
      [reverseEducation[1]!, reverseEducation[2]!],
      'education',
    );
  const education = /^(.*)\s+or\s+(equivalent practical experience)$/iu.exec(
    text,
  );
  if (education && /\bdegree\b/iu.test(education[1]!))
    return group(
      'OR',
      [education[1]!.replace(/,\s*$/u, ''), education[2]!],
      'education',
    );
  const delivery =
    /^Personally (?:built|developed) and (?:delivered|deployed) at least one (.+) application (?:beyond the prototype stage|to production)$/iu.exec(
      text,
    );
  if (delivery)
    return group(
      'OR',
      delivery[1]!.split(/,\s*(?:or\s+)?|\s+or\s+/iu),
      'experience',
      true,
    );
  if (singleManagedLanguage.test(text)) return group('SINGLE', [text]);
  const languages = /\bat least one managed language such as (.+)$/iu.exec(
    text,
  );
  if (languages)
    return group(
      'OR',
      languages[1]!.replace(/,?\s+or similar$/iu, '').split(/,\s*|\s+or\s+/iu),
      'experience',
    );
  if (
    /\b(?:multiple|at least (?:[0-9]+|two|three|four|five)|such as|including|either.*and)\b|ít nhất|một trong/iu.test(
      text,
    )
  )
    return group('UNKNOWN', [text]);
  let context: RequirementGroup['context'] = 'skill';
  let body = text;
  const prefix =
    /^(?:Experience designing|Working knowledge of|Understanding of|Experience (?:with|in|using)|Knowledge of)\s+/iu.exec(
      text,
    );
  if (prefix) {
    context = /designing/iu.test(prefix[0])
      ? 'design'
      : /knowledge|understanding/iu.test(prefix[0])
        ? 'knowledge'
        : 'experience';
    body = text.slice(prefix[0].length);
  }
  body = body.replace(/^(?:(?:at least )?one of|either)\s+/iu, '');
  const hasAnd = /\band\b/iu.test(body);
  const hasOr = /\bor\b/iu.test(body);
  if (hasAnd && hasOr) return group('UNKNOWN', [text], context);
  if (hasAnd || hasOr || (prefix && /[,;]/u.test(body))) {
    const labels = body
      .split(/[,;]\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/iu)
      .map((part) => part.trim())
      .filter(Boolean);
    // Coordinated verbs/nested qualifications cannot safely become a flat list.
    if (
      labels.length < 2 ||
      labels.length > 20 ||
      labels.some((label) =>
        /\b(?:designing|delivering|ability|including)\b/iu.test(label),
      )
    )
      return group('UNKNOWN', [text], context);
    return group(hasOr ? 'OR' : 'AND', labels, context);
  }
  return group('SINGLE', [text], context);
}

const aliases: readonly [RegExp, RegExp][] = [
  [
    /^(?:mcp|model context protocol)$/iu,
    /\b(?:mcp|model context protocol)\b/iu,
  ],
  [
    /^(?:rag|retrieval[- ]augmented generation)$/iu,
    /\b(?:rag|retrieval[- ]augmented generation)\b/iu,
  ],
  [/^llm$/iu, /\b(?:llms?|large language models?)\b/iu],
  [/^agent-based$/iu, /\bagent[- ]based\b/iu],
  [
    /^cloud[- ]based architectures?$/iu,
    /\bcloud[- ](?:based )?architectures?\b/iu,
  ],
  [/^apis?$/iu, /\b(?:apis?|application programming interfaces?)\b/iu],
  [
    /^ci\/cd practices$/iu,
    /\b(?:ci\s*\/\s*cd|continuous integration and (?:continuous )?delivery)\b/iu,
  ],
  [/^vector search$/iu, /\bvector (?:search|retrieval)\b/iu],
  [/^tool calling$/iu, /\b(?:tool|function) calling\b/iu],
  [/^sql$/iu, /\b(?:sql|postgresql|sql server)\b/iu],
  [/^nosql data stores$/iu, /\b(?:nosql|mongodb|dynamodb)\b/iu],
];
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
function mentions(label: string, text: string): boolean {
  // Explicit integration action, not mere LLM API usage or a tool declaration.
  if (/^LLM API integration$/iu.test(label))
    return /\b(?:integrat(?:ed|ing) LLM APIs?|LLM API integration)\b/iu.test(
      text,
    );
  const alias = aliases.find(([pattern]) => pattern.test(label));
  if (alias) return alias[1].test(text);
  // A small spelling normalization, not fuzzy entailment or a skill ontology.
  const words = normalize(label)
    .replace(/[-–]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
  return (
    words.length > 0 &&
    words.every((word) =>
      new RegExp(
        `(?<![\\p{L}\\p{N}])${escape(word.replace(/s$/u, ''))}s?(?![\\p{L}\\p{N}])`,
        'iu',
      ).test(text),
    )
  );
}
// Match PDF spacing around contraction apostrophes without rewriting source quotes.
// Callers retain their existing passage-level scope and contradiction checks.
const negative = (text: string) =>
  /\b(?:no|not|never|without|lack|lacking|unable|cannot)\b|\b(?:can|couldn|don|doesn|didn|won|wouldn|isn|aren|wasn|weren|hasn|haven|hadn)\s*['’]\s*t\b|\b(?:không|chưa)\b/iu.test(
    text,
  );
const uncertain = (text: string) =>
  /\b(?:seeking|aspiring|interested|hope|plan to|learning|uncertain|maybe|familiarity only)\b/iu.test(
    text,
  );
const active = (text: string) =>
  /\b(?:built|build|designed|design|architected|developed|delivered|implemented|used|using|worked|experience|skills|knowledge|understand|proficient|integrated|deployed|led|created)\b/iu.test(
    text,
  );
const passages = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|[\r\n;]+/u)
    .map((line) => line.trim())
    .filter(Boolean);

const ciCdPractices = /^ci\/cd practices$/iu;
const ciCdAutomation = String.raw`(?:(?:ci\s*\/\s*cd|continuous integration and (?:continuous )?(?:delivery|deployment))\s+(?:pipelines?|workflows?|automation)|automated\s+build(?:,\s*test)?\s+and\s+(?:test|deployment)\s+(?:pipelines?|workflows?))`;
const ciCdPracticeDeclaration = /\bci\s*\/\s*cd\s+practices\b/iu;
const ciCdPipelineContext = new RegExp(String.raw`\b${ciCdAutomation}\b`, 'iu');
const ciCdDesignExperience = new RegExp(
  String.raw`\b${ciCdAutomation}\s+design experience\b`,
  'iu',
);
const ciCdModifiers = String.raw`(?:(?:the|our|existing|automated|gitlab|jenkins|github(?: actions)?)\s+){0,4}`;
const ciCdAppliedWork = new RegExp(
  String.raw`\b(?:designed|architected|implemented|configured|optimi[sz]ed|experience (?:in |with )?(?:designing|implementing|configuring|optimi[sz]ing))\s+(?:(?:REST(?:ful)?\s+)?APIs?\s+and\s+)?${ciCdModifiers}${ciCdAutomation}\b`,
  'iu',
);
const andCiCdPractices = (label: string, group: RequirementGroup) =>
  group.mode === 'AND' &&
  group.context === 'design' &&
  ciCdPractices.test(label);
function supportsCiCdPractices(text: string): boolean {
  if (
    /\b(?:will|would|want|wish|intend|aim|planning|hoping|goal|if|incomplete|pending|planned|draft|abandoned|documentation|manual|tutorial|courses?)\b/iu.test(
      text,
    )
  )
    return false;
  // Preserve explicit design declarations, including coordinated design lists.
  if (
    /\b(?:designed|designing|architected|design experience)\b/iu.test(text) &&
    ciCdPracticeDeclaration.test(text)
  )
    return true;
  // Implementation/optimization must act on the pipeline/automation itself,
  // not an unrelated object that merely uses a CI/CD tool.
  return ciCdAppliedWork.test(text) || ciCdDesignExperience.test(text);
}

const educationFieldsIn = (text: string) =>
  ['computer science', 'software engineering', 'information technology'].filter(
    (field) => normalize(text).includes(field),
  );

function componentMention(
  label: string,
  text: string,
  group: RequirementGroup,
): boolean {
  if (group.context === 'education') {
    if (/equivalent practical experience/iu.test(label))
      return /\b(?:equivalent practical experience|equivalent professional experience)\b/iu.test(
        text,
      );
    const fields = educationFieldsIn(label);
    return (
      /\b(?:bachelor'?s?|bsc|b\.sc\.?|bs)\b/iu.test(text) &&
      fields.some((field) => normalize(text).includes(field))
    );
  }
  return (
    mentions(label, text) ||
    (andCiCdPractices(label, group) && ciCdPipelineContext.test(text))
  );
}
function supports(
  label: string,
  text: string,
  group: RequirementGroup,
): boolean {
  if (
    !componentMention(label, text, group) ||
    negative(text) ||
    uncertain(text)
  )
    return false;
  if (group.minimumYears !== undefined) {
    const years = /\b(\d+)\+?\s+years?\b/iu.exec(text);
    if (!years || Number(years[1]) < group.minimumYears) return false;
  }
  if (group.context === 'education') {
    if (/equivalent practical experience/iu.test(label))
      return (
        /\b\d+\+?\s+years?\b|\b(?:eight|six|ten) years\b/iu.test(text) &&
        /\b(?:built|building|delivered|developed|developing)\b/iu.test(text)
      );
    return !/\b(?:incomplete|pursuing|candidate|expected|course)\b/iu.test(
      text,
    );
  }
  if (group.personalDelivery)
    return (
      /\b(?:personally|independently|i|sole developer)\b/iu.test(text) &&
      /\b(?:built|developed|implemented)\b/iu.test(text) &&
      /\b(?:delivered|deployed|launched)\b/iu.test(text) &&
      /\b(?:production|beyond (?:the )?prototype|real users)\b/iu.test(text) &&
      !/\b(?:prototype only|only a prototype|team built)\b/iu.test(text)
    );
  if (andCiCdPractices(label, group)) return supportsCiCdPractices(text);
  if (group.context === 'design')
    return /\b(?:designed|designing|architected|design experience)\b/iu.test(
      text,
    );
  return (
    active(text) ||
    /^\s*(?:technical skills[:\s]*|(?:backend|databases)\s*[:—–-])/iu.test(text)
  );
}

// Recovery is deliberately restricted to these named design competencies. Each
// component needs its own literal/validated equivalent and design-context check;
// infrastructure or broker keywords alone are never architecture evidence.
const andDesignTerms: readonly [RegExp, RegExp][] = [
  [/^apis?$/iu, /\b(?:apis?|application programming interfaces?)\b/iu],
  [
    /^ci\/cd practices$/iu,
    /\b(?:ci\s*\/\s*cd|continuous integration and (?:continuous )?delivery)\s+(?:pipelines?|practices?)\b/iu,
  ],
  [/^integrations?$/iu, /\bintegrations?\b/iu],
  [/^data flows?$/iu, /\bdata[- ]flows?\b/iu],
  [
    /^cloud[- ]based architectures?$/iu,
    /\bcloud[- ](?:based )?architectures?\b/iu,
  ],
];
function recoverAndDesign(
  component: RequirementComponent,
  group: RequirementGroup,
  source: string[],
): string | undefined {
  if (group.mode !== 'AND' || group.context !== 'design') return undefined;
  const term = andDesignTerms.find(([label]) => label.test(component.label));
  if (!term) return undefined;
  return source.find(
    (quote) =>
      quote.length <= 2000 &&
      (andCiCdPractices(component.label, group)
        ? ciCdPipelineContext.test(quote) || ciCdPracticeDeclaration.test(quote)
        : term[1].test(quote)) &&
      !/\b(?:will|would|want|wish|intend|aim|planning|hoping|goal|if|incomplete|pending|planned|draft|abandoned|documentation|manual|tutorial|courses?)\b/iu.test(
        quote,
      ) &&
      !/copilot|cursor|claude code|codeium|tabnine|chatgpt|ai[- ]assisted|coding (?:tools?|assistants?)/iu.test(
        quote,
      ) &&
      (andCiCdPractices(component.label, group) ||
        /\b(?:designed|architected|design experience|experience designing)\b/iu.test(
          quote,
        )) &&
      supports(component.label, quote, group),
  );
}

const degreeLevel =
  /\b(?:bachelor(?:['’]s)?(?:\s+degree|\s+of\s+(?:science|engineering))|bsc|b\.sc\.?|bs)\b/iu;
const degreeIncomplete =
  /\b(?:incomplete|pending|pursuing|candidate|expected|course|program|in[- ]progress|ongoing|enrolled|attending|attended|studying|awaiting|will|would|want|intend|if|wish|aim|planning|hoping|plans?)\b/iu;
const degreeContext =
  /\b(?:graduat\w*|complet\w*|awarded|earned|received|status|incomplete|pending|pursuing|candidate|expected|in[- ]progress|enrolled|studying|awaiting)\b/iu;

// A degree assertion is qualification evidence; attendance or dates alone are
// not. Join only a missing field on the immediately adjacent field-only line,
// retaining original offsets and nearby status qualifiers from the same entry.
function educationPassages(cv: string): string[] {
  const lines = [...cv.matchAll(/[^\r\n]+/gu)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
  const adjacent = (left: number, right: number) =>
    lines[right] !== undefined &&
    !!lines[right]!.text.trim() &&
    !/\r?\n[ \t]*\r?\n/u.test(cv.slice(lines[left]!.end, lines[right]!.start));
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const level = degreeLevel.exec(line.text);
    if (!level) {
      if (
        negative(line.text) &&
        /\b(?:bachelor(?:['’]s)?|degree)\b/iu.test(line.text)
      )
        result.push(line.text);
      continue;
    }
    let start = i,
      end = i;
    const remainder = line.text.slice(level.index + level[0].length);
    if (
      /^\s*(?:in|:|[-–—])?\s*$/iu.test(remainder) &&
      adjacent(i, i + 1) &&
      /^\s*(?:in\s+|(?:major|field)\s*:\s*)?(?:computer science|software engineering|information technology)\.?\s*$/iu.test(
        lines[i + 1]!.text,
      )
    )
      end++;
    if (
      adjacent(end, end + 1) &&
      !degreeLevel.test(lines[end + 1]!.text) &&
      degreeContext.test(lines[end + 1]!.text)
    )
      end++;
    if (
      i > 0 &&
      adjacent(i - 1, i) &&
      !degreeLevel.test(lines[i - 1]!.text) &&
      degreeContext.test(lines[i - 1]!.text)
    )
      start--;
    const quote = cv.slice(lines[start]!.start, lines[end]!.end);
    if (quote.length <= 2000) result.push(quote);
  }
  return result;
}

export function evaluateCoverage(
  group: RequirementGroup,
  selected: string[],
  cv: string,
  allowRecovery = false,
) {
  const quotes = selected.flatMap(passages);
  const all = passages(cv);
  const education =
    group.mode === 'OR' && group.context === 'education'
      ? educationPassages(cv)
      : [];
  const components: ComponentCoverage[] = group.components.map((component) => {
    // Omitted evidence is recoverable only for an explicit OR and a known
    // alias-policy term. Never turn arbitrary source keywords or an AND gap
    // into a match, and apply the same shared-constraint/positive-context checks.
    const recovered =
      allowRecovery &&
      group.mode === 'OR' &&
      aliases.some(([pattern]) => pattern.test(component.label))
        ? all.find(
            (quote) =>
              quote.length <= 2000 &&
              (!group.personalDelivery || !/\b(?:zero|0)\b/iu.test(quote)) &&
              !/\b(?:will|would|want|wish|intend|aim|planning|hoping|goal|if)\b/iu.test(
                quote,
              ) &&
              /\b(?:built|designed|architected|developed|delivered|implemented|used|worked|integrated|deployed|led|created|skills|knowledge|proficient|experience)\b/iu.test(
                quote,
              ) &&
              !/copilot|cursor|claude code|codeium|tabnine|chatgpt|ai[- ]assisted|coding (?:tools?|assistants?)/iu.test(
                quote,
              ) &&
              supports(component.label, quote, group),
          )
        : undefined;
    const degree =
      group.mode === 'OR' &&
      group.context === 'education' &&
      degreeLevel.test(component.label);
    const degreeSupported = (quote: string) =>
      degreeLevel.test(quote) &&
      !degreeIncomplete.test(quote) &&
      supports(component.label, quote, group);
    const positive = degree
      ? education.find(
          (quote) =>
            degreeSupported(quote) &&
            (allowRecovery ||
              selected.some(
                (selection) =>
                  selection.trim() &&
                  degreeLevel.test(selection) &&
                  (selection.includes(quote) || quote.includes(selection)),
              )),
        )
      : (quotes.find((quote) => supports(component.label, quote, group)) ??
        recovered ??
        (allowRecovery ? recoverAndDesign(component, group, all) : undefined));
    const source = degree ? education : all;
    const positiveInCv =
      positive ??
      source.find((quote) =>
        degree
          ? degreeSupported(quote)
          : supports(component.label, quote, group),
      );
    const negatives = source.filter(
      (quote) =>
        (componentMention(component.label, quote, group) ||
          (degree &&
            negative(quote) &&
            /\b(?:bachelor(?:['’]s)?|degree)\b/iu.test(quote) &&
            !/\b(?:degree|science|engineering)\s+in\s+\S/iu.test(
              normalize(quote),
            ))) &&
        (negative(quote) ||
          (degree && degreeIncomplete.test(quote)) ||
          (group.personalDelivery &&
            /\b(?:prototype only|only (?:a |built )?(?:\w+ )?prototypes?)\b/iu.test(
              quote,
            ))) &&
        (!degree ||
          !positiveInCv ||
          !educationFieldsIn(quote).length ||
          educationFieldsIn(quote).some((field) =>
            educationFieldsIn(positiveInCv).includes(field),
          )),
    );
    const conflict = negatives.length > 0 && !!positiveInCv;
    return {
      ...component,
      status: conflict ? 'CONFLICT' : positive ? 'EVIDENCED' : 'NOT_EVIDENCED',
      cvQuote: positive ?? (conflict ? positiveInCv : '') ?? '',
      conflictingQuotes: conflict ? negatives : [],
    };
  });
  const conflict = components.some((item) => item.status === 'CONFLICT');
  const supported = components.filter(
    (item) => item.status === 'EVIDENCED',
  ).length;
  const credit =
    group.mode === 'UNKNOWN' || conflict
      ? 0
      : group.mode === 'OR'
        ? Number(supported > 0)
        : supported / components.length;
  const status: CoverageStatus = conflict
    ? 'CONFLICT'
    : credit === 1
      ? 'EVIDENCED'
      : credit > 0
        ? 'PARTIAL'
        : 'NOT_EVIDENCED';
  return {
    mode: group.mode,
    components,
    credit,
    status,
    reason:
      group.mode === 'UNKNOWN'
        ? 'Compound meaning needs review.'
        : conflict
          ? 'Contradictory CV statements need review.'
          : group.personalDelivery && !credit
            ? 'Personal delivery beyond prototype is not evidenced.'
            : 'Review the selected component evidence.',
  };
}

// Simple requirements retain their established semantic model links, with narrow
// vetoes for verifiable negatives and insufficient generic duration.
export function simpleEvidenceStatus(
  requirement: string,
  quote: string,
  cv: string,
  category = 'skill',
): CoverageStatus {
  if (!quote) return 'NOT_EVIDENCED';
  // Legacy generic Experience rows are semantic duration assessments, not a skill token.
  const bareSkill =
    category === 'skill' &&
    /^[\w+#./-]+$/u.test(requirement) &&
    !/^experience$/iu.test(requirement);
  if (bareSkill && !mentions(requirement, quote)) return 'NOT_EVIDENCED';
  const minimum =
    /^(?:(?:minimum|at least|min\.?)\s+)?(\d+)\+?\s+(?:years?|yrs?)$/iu.exec(
      requirement.trim(),
    );
  if (minimum) {
    const duration = /\b(\d+)\+?\s+(?:years?|yrs?)\b/iu.exec(quote);
    if (
      negative(quote) ||
      uncertain(quote) ||
      !duration ||
      Number(duration[1]) < Number(minimum[1])
    )
      return 'NOT_EVIDENCED';
    return 'EVIDENCED';
  }
  const language = singleManagedLanguage.exec(
    requirement.trim().replace(/\.$/u, ''),
  )?.[1];
  const label =
    language ??
    requirement.replace(
      /^(?:experience (?:with|in)|backend|knowledge of)\s+/iu,
      '',
    );
  const selected = passages(quote).filter(
    (line) => !negative(line) && !uncertain(line),
  );
  const negatives = passages(cv).filter(
    (line) => mentions(label, line) && negative(line),
  );
  if (
    (language !== undefined || bareSkill) &&
    !selected.some((line) => mentions(label, line))
  )
    return 'NOT_EVIDENCED';
  if (negatives.length && selected.some((line) => mentions(label, line)))
    return 'CONFLICT';
  return selected.length ? 'EVIDENCED' : 'NOT_EVIDENCED';
}

export function simpleContradictions(
  requirement: string,
  cv: string,
): string[] {
  const language = singleManagedLanguage.exec(
    requirement.trim().replace(/\.$/u, ''),
  )?.[1];
  const label =
    language ??
    requirement.replace(
      /^(?:experience (?:with|in)|backend|knowledge of)\s+/iu,
      '',
    );
  return passages(cv).filter((line) => mentions(label, line) && negative(line));
}
