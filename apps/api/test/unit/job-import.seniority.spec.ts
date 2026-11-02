import 'reflect-metadata';
import { expect, test } from '@jest/globals';
import {
  mergeCandidates,
  validateImportReview,
  type ImportCandidate,
} from '../../src/opportunities/job-import.contract.js';
import { sourceCandidates } from '../../src/opportunities/job-import.evidence.js';

const seniority = (candidates: ImportCandidate[], post: string, jd = '') =>
  mergeCandidates({ candidates }, post, jd).fields.find(
    (field) => field.field === 'seniority',
  )!;

test.each(['Junior', 'Mid-level', 'Senior', 'Lead', 'Principal'])(
  'explicit %s title provides source-grounded fallback and review round-trip',
  (level) => {
    const post = `Job title: ${level} Fullstack Java Developer (Good At English)`;
    const result = mergeCandidates(
      { candidates: sourceCandidates(post, '') },
      post,
      '',
    );
    expect(
      result.fields.find((field) => field.field === 'seniority'),
    ).toMatchObject({ status: 'SUPPORTED', value: level });
    expect(validateImportReview(result.fields, post, '')).toEqual(
      result.fields,
    );
  },
);

test.each(['Senior Fullstack Java Developer', 'Junior Engineer'])(
  'validated model title in JD also supports fallback: %s',
  (title) => {
    expect(
      seniority(
        [{ field: 'title', value: title, source: 'jd', quote: title }],
        '',
        title,
      ),
    ).toMatchObject({ value: title.split(' ')[0], status: 'SUPPORTED' });
  },
);

test.each([
  'Seniority Engineer',
  'Leadership Developer',
  'Senior2 Engineer',
  'Principalities Engineer',
  'Junior/Senior Developer',
  'Java Developer',
])('ambiguous/absent explicit level remains unknown: %s', (title) => {
  const post = `Job title: ${title}\nRequirements\n5 years of experience\nWork with Senior engineers`;
  expect(seniority(sourceCandidates(post, ''), post)).toMatchObject({
    value: '',
    status: 'MISSING',
  });
});

test('existing evidence-supported seniority is not overridden by title fallback', () => {
  const post = 'Job title: Senior Java Developer\nLevel: Lead';
  expect(
    seniority(
      [
        ...sourceCandidates(post, ''),
        {
          field: 'seniority',
          value: 'Lead',
          source: 'post',
          quote: 'Level: Lead',
        },
      ],
      post,
    ),
  ).toMatchObject({ value: 'Lead', status: 'SUPPORTED' });
});

test('fabricated title cannot provide seniority evidence', () => {
  expect(
    seniority(
      [
        {
          field: 'title',
          value: 'Senior Engineer',
          source: 'post',
          quote: 'Senior Engineer',
        },
      ],
      'Java Engineer',
    ),
  ).toMatchObject({ value: '', status: 'MISSING' });
});
