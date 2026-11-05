import { expect, test } from '@jest/globals';
import {
  scoreCvMatch,
  type MatchRequirement,
} from '../../src/matching/cv-match.js';
import {
  MatchContexts,
  immutableValue,
  type MatchSnapshot,
} from '../../src/matching/match-context.js';
import {
  cvEvidenceReference,
  jobEvidenceReference,
} from '../../src/matching/suggestion-evidence.js';
import { suggestionCandidates } from '../../src/matching/suggestion-policy.js';

const revisions = { cvUpdatedAt: 'cv-1', jobUpdatedAt: 'job-1' };
const link = { ...revisions, parentId: 'p1', componentId: 'c1' };
function context(requirement: string, cv: string, quote = cv): MatchSnapshot {
  const canonical: MatchRequirement[] = [
    {
      parentId: 'p1',
      requirement,
      priority: 'required',
      category: 'skill',
      jdQuote: requirement,
      cvQuote: '',
    },
  ];
  const assessment = scoreCvMatch(
    [{ ...canonical[0]!, cvQuote: quote }],
    cv,
    requirement,
    canonical,
  );
  return new MatchContexts().create('owner', 'job', revisions, assessment);
}

test.each([
  ['Built Java APIs.', 'Built Java APIs.', { start: 0, end: 16 }],
  ['😀\nBuilt Java APIs.', 'Built Java APIs.', { start: 3, end: 19 }],
  ['Built Java\n APIs.', 'Built Java APIs.', { start: 0, end: 17 }],
  ['Java\nJava', 'Java', null],
  ['aaaa', 'aa', null],
])('exact UTF-16 and unique original span: %s', (source, quote, span) => {
  const reference = cvEvidenceReference(source, quote, link, 'support');
  expect(reference?.span).toEqual(span);
  if (reference?.span)
    expect(source.slice(reference.span.start, reference.span.end)).toBe(
      reference.quote,
    );
  expect(Object.isFrozen(reference)).toBe(true);
});

test('invalid evidence is rejected; canonical JD provenance is explicit and immutable', () => {
  expect(cvEvidenceReference('Java', 'Invented', link, 'support')).toBeNull();
  expect(jobEvidenceReference('Java', 'Python', link)).toBeNull();
  const evidence = jobEvidenceReference('Java and SQL', 'Java', link);
  expect(evidence).toMatchObject({
    source: 'canonical_saved_job_requirement',
    quote: 'Java',
    ...link,
  });
  expect(Object.isFrozen(evidence)).toBe(true);
});

test('SINGLE copies the exact original passage without mutating the assessment', () => {
  const snapshot = context('Java', 'Built Java APIs.');
  const before = JSON.stringify(snapshot);
  expect(suggestionCandidates(snapshot, 'Built Java APIs.')[0]).toMatchObject({
    kind: 'surface_evidence',
    wording: 'Built Java APIs.',
    status: 'EVIDENCED',
  });
  expect(JSON.stringify(snapshot)).toBe(before);
  expect(Object.isFrozen(snapshot.assessment.requirements)).toBe(true);
});

test('Partial AND surfaces only supported components and retains the missing component', () => {
  const snapshot = context(
    'Experience designing APIs and integrations',
    'Designed APIs.',
  );
  const [card] = suggestionCandidates(snapshot, 'Designed APIs.');
  expect(card).toMatchObject({ status: 'PARTIAL', wording: 'Designed APIs.' });
  expect(card?.reason).toContain('does not establish the full requirement');
  expect(card?.componentIds).toEqual(['c1', 'c2']);
});

test('OR needs one alternative, not all alternatives', () => {
  const snapshot = context('Java or Python', 'Skills: Java');
  const [card] = suggestionCandidates(snapshot, 'Skills: Java');
  expect(card).toMatchObject({
    status: 'EVIDENCED',
    wording: 'Skills: Java',
    clarification: null,
  });
  expect(card?.componentIds).toEqual(['c1']);
});

test.each([
  ['Kubernetes', 'Built Java APIs.', ''],
  ['Java', 'I have never used Java.', ''],
  ['Java', 'Aspiring Java developer.', ''],
  ['Java', 'Built a Java prototype only.', 'Built a Java prototype only.'],
  ['Java', 'Employer: Alpha\nBuilt Java APIs.', 'Built Java APIs.'],
  ['Java', 'Project: Alpha\nBuilt Java APIs.', 'Built Java APIs.'],
  [
    'Java',
    'Built Java APIs.\n\nBuilt SQL systems at Beta.',
    'Built Java APIs.',
  ],
  ['Java', 'Built Java APIs.\nBuilt Java APIs.', 'Built Java APIs.'],
])('unsafe or absent support clarifies: %s / %s', (requirement, cv, quote) => {
  const [card] = suggestionCandidates(context(requirement, cv, quote), cv);
  expect(card?.kind).toBe('clarify');
  expect(card?.wording).toBeNull();
});

test('whole-entry employer, project, duration and qualification context remains intact', () => {
  const cv =
    'Developed Java APIs at Alpha for Project Atlas for 2 years as an intern.';
  expect(suggestionCandidates(context('Java', cv), cv)[0]?.wording).toBe(cv);
});

test('multiline complete entry preserves original delimiters and qualifiers', () => {
  const cv = 'Built Java APIs at Alpha.\nScope: internal tools, 6 months.';
  expect(suggestionCandidates(context('Java', cv), cv)[0]?.wording).toBe(cv);
});

test('conflict shows both source quotes, no favorable wording', () => {
  const cv = 'Built Java APIs.\nI have never used Java.';
  const snapshot = context('Java', cv, 'Built Java APIs.');
  const [card] = suggestionCandidates(snapshot, cv);
  expect(card).toMatchObject({
    status: 'CONFLICT',
    kind: 'clarify',
    wording: null,
  });
  expect(card?.cvEvidence.map((evidence) => evidence.role)).toContain(
    'contradiction',
  );
});

test('UNKNOWN group always clarifies and source mismatch never yields wording', () => {
  const base = context('Java', 'Built Java APIs.');
  const snapshot = context(
    'Personally built several Java systems',
    'Built Java APIs.',
  );
  expect(snapshot.assessment.requirements[0]?.coverage.mode).toBe('UNKNOWN');
  expect(
    suggestionCandidates(snapshot, 'Built Java APIs.')[0]?.wording,
  ).toBeNull();
  expect(suggestionCandidates(base, 'Different source')[0]?.wording).toBeNull();
});

test('conflict-first ordering, five-card cap, stable order and one card per parent', () => {
  const base = context('Java', 'Built Java APIs.');
  const row = base.assessment.requirements[0]!;
  const rows = Array.from({ length: 8 }, (_, index) => ({
    ...row,
    parentId: `p${index}`,
    status:
      index === 7
        ? ('CONFLICT' as const)
        : index === 6
          ? ('NOT_EVIDENCED' as const)
          : ('EVIDENCED' as const),
  }));
  const snapshot = immutableValue({
    ...base,
    assessment: { ...base.assessment, requirements: [...rows, rows[7]!] },
  });
  const cards = suggestionCandidates(snapshot, 'Built Java APIs.');
  expect(cards.map((card) => card.parentId)).toEqual([
    'p7',
    'p6',
    'p0',
    'p1',
    'p2',
  ]);
  expect(cards[0]?.wording).toBeNull();
  expect(cards[1]?.wording).toBeNull();
});

test('required gaps precede preferred gaps and matched rows without score changes', () => {
  const base = context('Java', 'Built Java APIs.');
  const row = base.assessment.requirements[0]!;
  const snapshot = immutableValue({
    ...base,
    assessment: {
      ...base.assessment,
      requirements: [
        { ...row, parentId: 'matched' },
        {
          ...row,
          parentId: 'preferred',
          priority: 'preferred' as const,
          status: 'NOT_EVIDENCED' as const,
        },
        { ...row, parentId: 'required', status: 'NOT_EVIDENCED' as const },
      ],
    },
  });
  expect(
    suggestionCandidates(snapshot, 'Built Java APIs.').map(
      (card) => card.parentId,
    ),
  ).toEqual(['required', 'preferred', 'matched']);
  expect(snapshot.assessment.score).toBe(base.assessment.score);
});

test('a valid empty assessment yields no candidates', () => {
  const snapshot = new MatchContexts().create(
    'owner',
    'job',
    revisions,
    scoreCvMatch([], '', '', []),
  );
  expect(suggestionCandidates(snapshot, '')).toEqual([]);
});
