import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalysisResult } from '../src/features/dashboard/AnalysisResult';
import { decodeAnalysis } from '../src/features/dashboard/analysis-api';
import type { AnalysisResponse } from '../src/features/dashboard/analysis.types';
import type { PartialFact } from '../src/features/dashboard/partial.types';
const missing = (): PartialFact => ({
  status: 'MISSING',
  value: null,
  evidence: null,
  reason: 'NO_CANDIDATE',
});
const text = 'Alex Sample\nSkills: TypeScript';
function valid(value: string, quote: string): PartialFact {
  const start = text.indexOf(quote);
  const valueStart = start + quote.indexOf(value);
  return {
    status: 'VALID',
    value,
    reason: null,
    evidence: {
      segmentId: 'synthetic-span',
      quote,
      start,
      end: start + quote.length,
      valueStart,
      valueEnd: valueStart + value.length,
    },
  };
}
function response(): Extract<AnalysisResponse, { outcome: 'PARTIAL' }> {
  return {
    contractVersion: '1',
    requestId: '00000000-0000-4000-8000-000000000003',
    outcome: 'PARTIAL',
    result: null,
    error: null,
    stages: {
      upload: 'SUCCEEDED',
      cv: 'REJECTED',
      jd: 'TIMED_OUT',
      matching: 'NOT_RUN',
    },
    documents: {
      cv: {
        text,
        facts: null,
        partial: {
          contractVersion: 'partial-v1',
          kind: 'cv',
          generationError: null,
          rejectedCandidateCount: 1,
          fields: {
            name: [valid('Alex Sample', 'Alex Sample')],
            email: [missing()],
            phone: [
              {
                status: 'NEEDS_REVIEW',
                value: '+1 999 555 0000',
                evidence: null,
                reason: 'EVIDENCE_NOT_FOUND',
              },
            ],
            skills: [valid('TypeScript', 'Skills: TypeScript')],
          },
        },
      },
      jd: {
        text: 'Synthetic JD',
        facts: null,
        partial: {
          contractVersion: 'partial-v1',
          kind: 'jd',
          generationError: 'TIMEOUT',
          rejectedCandidateCount: 0,
          fields: { title: [missing()], requirements: [missing()] },
        },
      },
    },
  };
}
test('renders independently valid facts, untrusted suggestions, missing fields and generation failure without a score', () => {
  const result = decodeAnalysis(response(), true);
  render(<AnalysisResult response={result} />);
  expect(
    screen.getByRole('heading', { name: 'CV source' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'JD source' }),
  ).toBeInTheDocument();
  expect(screen.getAllByText('VALID')).toHaveLength(2);
  expect(screen.getByText('NEEDS_REVIEW')).toBeInTheDocument();
  expect(screen.getAllByText('MISSING')).toHaveLength(3);
  expect(screen.getByText(/Unverified suggestion/)).toBeInTheDocument();
  expect(
    screen.getByText(/JD AI extraction failed: TIMEOUT/),
  ).toBeInTheDocument();
  expect(screen.getByText('Skills: TypeScript')).toBeInTheDocument();
  expect(
    screen.queryByLabelText('Overall documented requirement support'),
  ).not.toBeInTheDocument();
});
test.each([
  'offset',
  'quote',
  'value',
  'reviewEvidence',
  'missingValue',
  'field',
])('decoder rejects invalid partial %s instead of trusting it', (mutation) => {
  const result = response();
  const partial = result.documents!.cv!.partial!;
  const name = partial.fields.name![0]!;
  if (name.status !== 'VALID') throw new Error('bad fixture');
  if (mutation === 'offset') name.evidence.start++;
  if (mutation === 'quote') name.evidence.quote = 'Fabricated';
  if (mutation === 'value') name.value = 'Fabricated';
  if (mutation === 'reviewEvidence')
    Object.assign(partial.fields.phone![0]!, { evidence: name.evidence });
  if (mutation === 'missingValue')
    Object.assign(partial.fields.email![0]!, { value: 'Fabricated' });
  if (mutation === 'field') delete partial.fields.name;
  expect(() => decodeAnalysis(result, true)).toThrow();
});
test('partial response cannot carry a matching result or matching success', () => {
  const result = response();
  result.stages.matching = 'SUCCEEDED';
  expect(() => decodeAnalysis(result, true)).toThrow();
  expect(() =>
    decodeAnalysis({ ...response(), result: { overallScore: 100 } }, true),
  ).toThrow();
});

test('explicit proposal rejections remain visible alongside validated facts', () => {
  const result = response();
  result.documents!.cv!.partial!.rejectedProposals = [
    { index: 2, reason: 'UNSUPPORTED_FIELD' },
    { index: 3, reason: 'MALFORMED_PROPOSAL' },
  ];
  render(<AnalysisResult response={decodeAnalysis(result, true)} />);
  expect(screen.getByText(/Proposal 3: UNSUPPORTED_FIELD/)).toBeInTheDocument();
  expect(
    screen.getByText(/Proposal 4: MALFORMED_PROPOSAL/),
  ).toBeInTheDocument();
  expect(screen.getAllByText('VALID')).toHaveLength(2);
  expect(
    screen.getByRole('heading', { name: 'CV source' }),
  ).toBeInTheDocument();
});
test('decoder rejects arbitrary proposal rejection payloads', () => {
  const result = response();
  Object.assign(result.documents!.cv!.partial!, {
    rejectedProposals: [{ index: 0, reason: 'arbitrary untrusted text' }],
  });
  expect(() => decodeAnalysis(result, true)).toThrow();
});

function titleReviewResponse(): AnalysisResponse {
  const result = response();
  const doc = result.documents!.jd!;
  doc.text = 'Job description';
  doc.partial!.generationError = null;
  doc.partial!.rejectedCandidateCount = 1;
  doc.partial!.fields.title = [
    {
      status: 'NEEDS_REVIEW',
      reason: 'JD_TITLE_GENERIC_HEADING',
      value: doc.text,
      evidence: {
        segmentId: 'jd-synthetic',
        quote: doc.text,
        start: 0,
        end: doc.text.length,
        valueStart: 0,
        valueEnd: doc.text.length,
      },
    },
  ];
  result.stages.jd = 'REJECTED';
  return result;
}
test('JD title review shows the original proposal and exact evidence without trusting its meaning', () => {
  render(
    <AnalysisResult response={decodeAnalysis(titleReviewResponse(), true)} />,
  );
  expect(
    screen.getByText(/looks like a document heading, not a role title/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Exact source evidence is retained below/),
  ).toBeInTheDocument();
  expect(
    [...document.querySelectorAll('blockquote')].some(
      (element) => element.textContent === 'Job description',
    ),
  ).toBe(true);
  expect(
    screen.queryByLabelText('Overall documented requirement support'),
  ).not.toBeInTheDocument();
});
test.each(['offset', 'absent', 'wrongField'])(
  'title review evidence %s must pass wire validation',
  (mutation) => {
    const result = titleReviewResponse();
    const title = result.documents!.jd!.partial!.fields.title![0]!;
    if (mutation === 'offset') title.evidence!.start++;
    if (mutation === 'absent') title.evidence = null;
    if (mutation === 'wrongField')
      result.documents!.cv!.partial!.fields.phone = [title];
    expect(() => decodeAnalysis(result, true)).toThrow();
  },
);
