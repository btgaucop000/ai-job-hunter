import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisResult } from '../src/features/dashboard/AnalysisResult';
import type { AnalysisResponse } from '../src/features/dashboard/analysis.types';
import type { PartialFact } from '../src/features/dashboard/partial.types';
const missing = (): PartialFact => ({
  status: 'MISSING',
  value: null,
  evidence: null,
  reason: 'NO_CANDIDATE',
});
const cvText = 'Alex Example\nSkills: SQL\nProject: SQL';
function valid(value: string, quote = value): PartialFact {
  const start = cvText.indexOf(quote),
    valueStart = start + quote.indexOf(value);
  return {
    status: 'VALID',
    value,
    reason: null,
    evidence: {
      segmentId: 'synthetic-cv',
      quote,
      start,
      end: start + quote.length,
      valueStart,
      valueEnd: valueStart + value.length,
    },
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function fixture(): AnalysisResponse {
  return freeze({
    contractVersion: '1',
    requestId: '00000000-0000-4000-8000-000000000007',
    outcome: 'PARTIAL',
    result: null,
    error: null,
    stages: {
      upload: 'SUCCEEDED',
      cv: 'SUCCEEDED',
      jd: 'REJECTED',
      matching: 'NOT_RUN',
    },
    documents: {
      cv: {
        text: cvText,
        facts: null,
        partial: {
          contractVersion: 'partial-v1',
          kind: 'cv',
          generationError: null,
          rejectedCandidateCount: 0,
          fields: {
            name: [valid('Alex Example')],
            email: [missing()],
            phone: [missing()],
            skills: [valid('SQL', 'Skills: SQL'), valid('SQL', 'Project: SQL')],
          },
        },
      },
      jd: {
        text: 'Job description',
        facts: null,
        partial: {
          contractVersion: 'partial-v1',
          kind: 'jd',
          generationError: null,
          rejectedCandidateCount: 1,
          fields: {
            title: [
              {
                status: 'NEEDS_REVIEW',
                value: 'Job description',
                reason: 'JD_TITLE_GENERIC_HEADING',
                evidence: {
                  segmentId: 'synthetic-jd',
                  quote: 'Job description',
                  start: 0,
                  end: 15,
                  valueStart: 0,
                  valueEnd: 15,
                },
              },
            ],
            requirements: [missing()],
          },
        },
      },
    },
  });
}
const group = (label: string) =>
  within(screen.getByRole('group', { name: `${label} review` }));
const accepted = (kind = 'CV') =>
  within(screen.getByRole('list', { name: `${kind} accepted user facts` }));

test('AI VALID starts unconfirmed; Confirm accepts only the selected fact', async () => {
  render(<AnalysisResult response={fixture()} />);
  expect(accepted().queryAllByRole('listitem')).toHaveLength(0);
  expect(group('CV Name').getByRole('button', { name: 'Undo' })).toBeDisabled();
  await userEvent.click(
    group('CV Name').getByRole('button', { name: 'Confirm' }),
  );
  expect(group('CV Name').getByText('User confirmed')).toBeInTheDocument();
  expect(accepted().getAllByRole('listitem')).toHaveLength(1);
  expect(accepted().getByText(/CV Name: Alex Example/)).toBeInTheDocument();
  expect(
    group('CV Skills occurrence 1').getByText(/Not user-confirmed/),
  ).toBeInTheDocument();
});
test('editing preserves original value, evidence, offsets and validation while making no request', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const data = fixture(),
    before = JSON.stringify(data);
  render(<AnalysisResult response={data} />);
  const item = screen
    .getByRole('group', { name: 'CV Skills occurrence 1 review' })
    .closest('li')!;
  await userEvent.click(
    group('CV Skills occurrence 1').getByRole('button', { name: 'Edit' }),
  );
  const input = group('CV Skills occurrence 1').getByRole('textbox', {
    name: 'Value for CV Skills occurrence 1',
  });
  expect(input).toHaveFocus();
  await userEvent.clear(input);
  await userEvent.type(input, 'TypeScript');
  await userEvent.click(
    group('CV Skills occurrence 1').getByRole('button', { name: 'Save' }),
  );
  expect(
    group('CV Skills occurrence 1').getByText('User edited'),
  ).toBeInTheDocument();
  expect(
    group('CV Skills occurrence 1').getByText(
      /not claimed to be supported by the original AI quote/,
    ),
  ).toBeInTheDocument();
  expect(
    group('CV Skills occurrence 1').getByRole('button', { name: 'Edit' }),
  ).toHaveFocus();
  expect(accepted().getByText(/occurrence 1: TypeScript/)).toBeInTheDocument();
  expect(within(item).getByText('VALID')).toBeInTheDocument();
  expect(within(item).getByText('Skills: SQL')).toBeInTheDocument();
  expect(item.textContent).toContain('UTF-16 [13, 24)');
  await userEvent.click(
    group('CV Skills occurrence 1').getByRole('button', { name: 'Reject' }),
  );
  await userEvent.click(
    group('CV Skills occurrence 1').getByRole('button', { name: 'Undo' }),
  );
  expect(
    group('CV Skills occurrence 1').getByText('User edited'),
  ).toBeInTheDocument();
  expect(JSON.stringify(data)).toBe(before);
  expect(fetch).not.toHaveBeenCalled();
});
test('Reject excludes a confirmed fact; Undo reverses each latest action independently', async () => {
  render(<AnalysisResult response={fixture()} />);
  await userEvent.click(
    group('CV Name').getByRole('button', { name: 'Confirm' }),
  );
  await userEvent.click(
    group('CV Name').getByRole('button', { name: 'Reject' }),
  );
  expect(group('CV Name').getByText('User rejected')).toBeInTheDocument();
  expect(accepted().queryAllByRole('listitem')).toHaveLength(0);
  await userEvent.click(group('CV Name').getByRole('button', { name: 'Undo' }));
  expect(group('CV Name').getByText('User confirmed')).toBeInTheDocument();
  expect(accepted().getAllByRole('listitem')).toHaveLength(1);
  await userEvent.click(group('CV Name').getByRole('button', { name: 'Undo' }));
  expect(accepted().queryAllByRole('listitem')).toHaveLength(0);
  expect(group('CV Name').getByRole('button', { name: 'Undo' })).toBeDisabled();
});
test('same-name skill occurrences keep separate review decisions and undo histories', async () => {
  render(<AnalysisResult response={fixture()} />);
  await userEvent.click(
    group('CV Skills occurrence 1').getByRole('button', { name: 'Confirm' }),
  );
  await userEvent.click(
    group('CV Skills occurrence 2').getByRole('button', { name: 'Reject' }),
  );
  await userEvent.click(
    group('CV Skills occurrence 2').getByRole('button', { name: 'Edit' }),
  );
  const input = group('CV Skills occurrence 2').getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, 'PostgreSQL');
  await userEvent.click(
    group('CV Skills occurrence 2').getByRole('button', { name: 'Save' }),
  );
  expect(accepted().getAllByRole('listitem')).toHaveLength(2);
  expect(accepted().getByText(/occurrence 1: SQL/)).toBeInTheDocument();
  expect(accepted().getByText(/occurrence 2: PostgreSQL/)).toBeInTheDocument();
  await userEvent.click(
    group('CV Skills occurrence 2').getByRole('button', { name: 'Undo' }),
  );
  expect(
    group('CV Skills occurrence 2').getByText('User rejected'),
  ).toBeInTheDocument();
  expect(accepted().getAllByRole('listitem')).toHaveLength(1);
  expect(
    group('CV Skills occurrence 1').getByText('User confirmed'),
  ).toBeInTheDocument();
});
test('a JD review suggestion requires explicit acceptance and keeps its original review status and quote', async () => {
  const data = fixture(),
    before = JSON.stringify(data);
  render(<AnalysisResult response={data} />);
  expect(accepted('JD').queryAllByRole('listitem')).toHaveLength(0);
  await userEvent.click(
    group('JD Job title').getByRole('button', { name: 'Confirm' }),
  );
  expect(
    accepted('JD').getByText(/JD Job title: Job description/),
  ).toBeInTheDocument();
  expect(screen.getByText('NEEDS_REVIEW')).toBeInTheDocument();
  expect(screen.getByText(/looks like a document heading/)).toBeInTheDocument();
  const item = screen
    .getByRole('group', { name: 'JD Job title review' })
    .closest('li')!;
  expect(
    within(item).getByText('Source: synthetic-jd, UTF-16 [0, 15)'),
  ).toBeInTheDocument();
  expect(JSON.stringify(data)).toBe(before);
  expect(
    screen.queryByLabelText('Overall documented requirement support'),
  ).not.toBeInTheDocument();
});
test('Cancel makes no decision; blank and oversized edits cannot be saved', async () => {
  render(<AnalysisResult response={fixture()} />);
  await userEvent.click(group('CV Name').getByRole('button', { name: 'Edit' }));
  await userEvent.click(
    group('CV Name').getByRole('button', { name: 'Cancel' }),
  );
  expect(accepted().queryAllByRole('listitem')).toHaveLength(0);
  await userEvent.click(group('CV Name').getByRole('button', { name: 'Edit' }));
  const input = group('CV Name').getByRole('textbox');
  fireEvent.change(input, { target: { value: '   ' } });
  await userEvent.click(group('CV Name').getByRole('button', { name: 'Save' }));
  expect(
    group('CV Name').getByText('Enter a nonempty value.'),
  ).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'x'.repeat(1001) } });
  await userEvent.click(group('CV Name').getByRole('button', { name: 'Save' }));
  expect(
    group('CV Name').getByText('Use at most 1,000 characters.'),
  ).toBeInTheDocument();
  expect(accepted().queryAllByRole('listitem')).toHaveLength(0);
});
test('saving an unchanged value is user confirmation, not an edited evidence claim', async () => {
  render(<AnalysisResult response={fixture()} />);
  await userEvent.click(group('CV Name').getByRole('button', { name: 'Edit' }));
  await userEvent.click(group('CV Name').getByRole('button', { name: 'Save' }));
  expect(group('CV Name').getByText('User confirmed')).toBeInTheDocument();
  expect(group('CV Name').queryByText('User edited')).not.toBeInTheDocument();
});
test('review decisions reset on a new request and on page remount', async () => {
  const data = fixture();
  const view = render(<AnalysisResult response={data} />);
  await userEvent.click(
    group('CV Name').getByRole('button', { name: 'Confirm' }),
  );
  view.rerender(
    <AnalysisResult
      response={{ ...data, requestId: '00000000-0000-4000-8000-000000000008' }}
    />,
  );
  expect(accepted().queryAllByRole('listitem')).toHaveLength(0);
  await userEvent.click(
    group('CV Name').getByRole('button', { name: 'Confirm' }),
  );
  view.unmount();
  render(<AnalysisResult response={data} />);
  expect(accepted().queryAllByRole('listitem')).toHaveLength(0);
  expect(screen.getAllByText(/Refresh, leaving the page/)).toHaveLength(2);
});
