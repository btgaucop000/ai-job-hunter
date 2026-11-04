import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { expect, test } from '@jest/globals';
import { parseJobPosting } from '../../src/opportunities/job-url-import.js';
import { businessDomainCandidates } from '../../src/opportunities/job-import.domain.js';
import { sectionCandidates } from '../../src/opportunities/job-import.sections.js';
import {
  mergeCandidates,
  validateImportReview,
} from '../../src/opportunities/job-import.contract.js';
const fixture = readFileSync('test/fixtures/itviec-metadata-real.html', 'utf8');
const url = 'https://itviec.com/it-jobs/synthetic';
const domains = [
  'Banking',
  'IT Services and IT Consulting',
  'Software Products and Web Services',
  'Financial Services',
];

test('verified structure preserves all groups, atomic domains and tooltip boundaries through evidence validation', () => {
  const preview = parseJobPosting(fixture, url);
  expect(preview.sourceMetadata).toEqual({
    skills: ['LLM', 'Kubernetes', 'RAG', 'English'],
    jobExpertise: ['AI Architect'],
    jobDomains: domains,
  });
  expect(preview.domain).toBe(domains.join('; '));
  expect(preview.sourceText).not.toContain('Consumer Finance');
  const candidates = businessDomainCandidates(preview.sourceText, 'post');
  expect(candidates.map((item) => item.value)).toEqual(domains);
  expect(sectionCandidates(preview.sourceText, 'post')).toEqual([]);
  const merged = mergeCandidates({ candidates }, preview.sourceText, '');
  expect(merged.fields.find((item) => item.field === 'domain')).toMatchObject({
    value: preview.domain,
    status: 'SUPPORTED',
  });
  expect(validateImportReview(merged.fields, preview.sourceText, '')).toEqual(
    merged.fields,
  );
});

test('synthetic comma/conjunction labels, duplicates and entities stay atomic and ordered', () => {
  const html = fixture.replace(
    'Banking</div>',
    'Media, Advertising and Entertainment</div><div class="itag">IT Services and IT Consulting</div><div class="itag">Research &amp; Commerce</div>',
  );
  const preview = parseJobPosting(html, url);
  expect(preview.sourceMetadata?.jobDomains).toEqual([
    'Media, Advertising and Entertainment',
    'IT Services and IT Consulting',
    'Research & Commerce',
    ...domains.slice(2),
  ]);
  const result = mergeCandidates(
    { candidates: businessDomainCandidates(preview.sourceText, 'post') },
    preview.sourceText,
    '',
  );
  expect(result.fields.find((item) => item.field === 'domain')?.value).toBe(
    preview.domain,
  );
});

test('partial/absent groups and unrelated headers do not fabricate domains or requirements', () => {
  const absent = fixture.replace('job-show-info', 'navigation');
  const preview = parseJobPosting(absent, url);
  expect(preview.sourceMetadata).toBeUndefined();
  expect(preview.domain).toBeUndefined();
  expect(preview.sourceText).toContain(
    'Source industry:\nInformation Technology',
  );
  expect(businessDomainCandidates(preview.sourceText, 'post')).toEqual([]);
  const partial = parseJobPosting(
    fixture.replace('Job Domain:', 'Other:'),
    url,
  );
  expect(partial.sourceMetadata?.skills).toHaveLength(4);
  expect(partial.domain).toBeUndefined();
  const other = parseJobPosting(fixture, 'https://topcv.vn/viec-lam/synthetic');
  expect(other.sourceMetadata).toBeUndefined();
  expect(other.domain).toBeUndefined();
});

test('metadata ends requirements, taxonomy proposals are rejected, genuine conflicts require acknowledgement', () => {
  const preview = parseJobPosting(
    fixture.replace(
      'Synthetic description replacing unrelated public job prose.',
      'Must have</p><p>Java',
    ),
    url,
  );
  expect(
    sectionCandidates(preview.sourceText, 'post').map((item) => item.value),
  ).toEqual(['Java']);
  const post = `${preview.sourceText}\nDomain: Healthcare`;
  const merged = mergeCandidates(
    {
      candidates: [
        ...businessDomainCandidates(post, 'post'),
        { field: 'skills', value: 'Banking', source: 'post', quote: 'Banking' },
        {
          field: 'preferredSkills',
          value: 'AI Architect',
          source: 'post',
          quote: 'AI Architect',
        },
      ],
    },
    post,
    '',
  );
  expect(merged.rejected).toBe(2);
  const domain = merged.fields.find((item) => item.field === 'domain')!;
  expect(domain.status).toBe('CONFLICT');
  expect(() => validateImportReview(merged.fields, post, '')).toThrow(
    'Review every conflicting',
  );
  domain.reviewed = true;
  expect(
    validateImportReview(merged.fields, post, '').find(
      (item) => item.field === 'domain',
    )?.reviewed,
  ).toBe(true);
});

test('unrelated XML/SVG cannot invalidate the header; scripts/templates and hidden chips are ignored', () => {
  const wrapped = `<html><body><svg><use xlink:href="ignored"/></svg><?xml version="1.0"?>${fixture}<template><div class="job-show-info">Fake</div></template></body></html>`;
  expect(parseJobPosting(wrapped, url).sourceMetadata?.jobDomains).toEqual(
    domains,
  );
  const hidden = fixture.replace(
    'Banking</div>',
    'Banking</div><div class="itag" hidden>Fake domain</div>',
  );
  expect(parseJobPosting(hidden, url).sourceMetadata?.jobDomains).toEqual(
    domains,
  );
  expect(
    parseJobPosting(
      fixture + fixture.replace(/<script[^]*?<\/script>/u, ''),
      url,
    ).sourceMetadata,
  ).toBeUndefined();
});
