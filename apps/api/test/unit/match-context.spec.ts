import { expect, test } from '@jest/globals';
import { MatchContexts } from '../../src/matching/match-context.js';
import { scoreCvMatch } from '../../src/matching/cv-match.js';
const revisions = { cvUpdatedAt: 'cv1', jobUpdatedAt: 'job1' };
const assessment = () => scoreCvMatch([], '', '', []);

test('opaque ID, immutable detached assessment, exact TTL boundary and no source document', () => {
  let now = 0;
  const contexts = new MatchContexts(() => now);
  const input = assessment();
  const snapshot = contexts.create('owner', 'job', revisions, input);
  expect(snapshot.matchId).toMatch(/^[0-9a-f-]{36}$/u);
  input.advice = 'mutated';
  expect(snapshot.assessment.advice).not.toBe('mutated');
  expect(Object.keys(snapshot).sort()).toEqual([
    'assessment',
    'cvUpdatedAt',
    'jobId',
    'jobUpdatedAt',
    'matchId',
    'ownerId',
  ]);
  expect(Object.isFrozen(snapshot.assessment)).toBe(true);
  now = 899999;
  expect(contexts.require(snapshot.matchId, 'owner', 'job', revisions)).toBe(
    snapshot,
  );
  now = 900000;
  expect(() =>
    contexts.require(snapshot.matchId, 'owner', 'job', revisions),
  ).toThrow(/stale/);
});

test('replacement invalidates old identity; owner/job and revisions are isolated', () => {
  const contexts = new MatchContexts();
  const first = contexts.create('owner', 'job', revisions, assessment());
  const other = contexts.create('owner', 'other', revisions, assessment());
  for (const [owner, job, revision] of [
    ['wrong', 'job', revisions],
    ['owner', 'other', revisions],
    ['owner', 'job', { ...revisions, cvUpdatedAt: 'cv2' }],
    ['owner', 'job', { ...revisions, jobUpdatedAt: 'job2' }],
  ] as const)
    expect(() =>
      contexts.require(first.matchId, owner, job, revision),
    ).toThrow();
  const latest = contexts.create('owner', 'job', revisions, assessment());
  expect(() =>
    contexts.require(first.matchId, 'owner', 'job', revisions),
  ).toThrow();
  expect(contexts.require(latest.matchId, 'owner', 'job', revisions)).toBe(
    latest,
  );
  expect(contexts.require(other.matchId, 'owner', 'other', revisions)).toBe(
    other,
  );
  expect(() =>
    new MatchContexts().require(latest.matchId, 'owner', 'job', revisions),
  ).toThrow();
});

test('capacity evicts oldest insertion; reads do not extend TTL or refresh order', () => {
  const contexts = new MatchContexts();
  const entries = Array.from({ length: 20 }, (_, index) =>
    contexts.create('owner', `job${index}`, revisions, assessment()),
  );
  contexts.require(entries[0]!.matchId, 'owner', 'job0', revisions);
  contexts.create('owner', 'job20', revisions, assessment());
  expect(() =>
    contexts.require(entries[0]!.matchId, 'owner', 'job0', revisions),
  ).toThrow();
  expect(
    contexts.require(entries[1]!.matchId, 'owner', 'job1', revisions),
  ).toBe(entries[1]);
});

test('same job under a different owner does not replace the first owner snapshot', () => {
  const contexts = new MatchContexts();
  const first = contexts.create('owner1', 'job', revisions, assessment());
  const second = contexts.create('owner2', 'job', revisions, assessment());
  expect(contexts.require(first.matchId, 'owner1', 'job', revisions)).toBe(
    first,
  );
  expect(contexts.require(second.matchId, 'owner2', 'job', revisions)).toBe(
    second,
  );
});
