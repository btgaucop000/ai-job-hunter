import { useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { AnalysisResult } from './AnalysisResult';
import { analyze, decodeAnalysis } from './analysis-api';
import type { AnalysisResponse } from './analysis.types';
import type { PartialEvidence, PartialFact } from './partial.types';

const cvText = 'Alex Example\nEmail: alex@example.test\nSkills: TypeScript';
const jdText = 'Job description\nSkills required: TypeScript';
const missing = (): PartialFact => ({
  status: 'MISSING',
  value: null,
  evidence: null,
  reason: 'NO_CANDIDATE',
});
function evidence(text: string, value: string, quote = value): PartialEvidence {
  const start = text.indexOf(quote),
    valueStart = start + quote.indexOf(value);
  return {
    segmentId: 'synthetic-ui',
    quote,
    start,
    end: start + quote.length,
    valueStart,
    valueEnd: valueStart + value.length,
  };
}
const valid = (text: string, value: string, quote = value): PartialFact => ({
  status: 'VALID',
  value,
  evidence: evidence(text, value, quote),
  reason: null,
});
function example(failure = false): AnalysisResponse {
  const result: AnalysisResponse = {
    contractVersion: '1',
    requestId: '00000000-0000-4000-8000-000000000005',
    outcome: 'PARTIAL',
    result: null,
    error: null,
    stages: {
      upload: 'SUCCEEDED',
      cv: 'SUCCEEDED',
      jd: failure ? 'TIMED_OUT' : 'REJECTED',
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
          rejectedProposals: [],
          fields: {
            name: [valid(cvText, 'Alex Example')],
            email: [
              valid(cvText, 'alex@example.test', 'Email: alex@example.test'),
            ],
            phone: [missing()],
            skills: [valid(cvText, 'TypeScript', 'Skills: TypeScript')],
          },
        },
      },
      jd: {
        text: jdText,
        facts: null,
        partial: {
          contractVersion: 'partial-v1',
          kind: 'jd',
          generationError: failure ? 'TIMEOUT' : null,
          rejectedCandidateCount: failure ? 0 : 1,
          rejectedProposals: [],
          fields: {
            title: failure
              ? [missing()]
              : [
                  {
                    status: 'NEEDS_REVIEW',
                    value: 'Job description',
                    evidence: evidence(jdText, 'Job description'),
                    reason: 'JD_TITLE_GENERIC_HEADING',
                  },
                ],
            requirements: failure
              ? [missing()]
              : [valid(jdText, 'TypeScript', 'Skills required: TypeScript')],
          },
        },
      },
    },
  };
  return decodeAnalysis(result, true);
}
// Loaded only by the development route. This page has no Analyze action.
export default function UiAcceptancePreview() {
  const [response, setResponse] = useState<AnalysisResponse>(() => example());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h4">
        Synthetic UI acceptance preview
      </Typography>
      <Alert severity="info">
        SYNTHETIC DATA ONLY. These are authored examples, not real-data
        extraction results. No AI requests are sent from this page.
      </Alert>
      <Typography>
        Refreshing this preview restores the synthetic review example. The
        normal dashboard keeps inputs/results only in memory and clears them on
        refresh. No result history is saved.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button
          disabled={busy}
          onClick={() => {
            setResponse(example());
            setFailed(false);
          }}
        >
          Show review example
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            setResponse(example(true));
            setFailed(false);
          }}
        >
          Show AI failure example
        </Button>
        <Button component="a" href="/synthetic-ui-cv.pdf" download>
          Download synthetic CV
        </Button>
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setFailed(false);
            void (async () => {
              try {
                const fileResponse = await fetch('/synthetic-ui-cv.pdf');
                if (!fileResponse.ok) throw new Error('Fixture unavailable');
                const file = new File(
                  [await fileResponse.arrayBuffer()],
                  'synthetic.pdf',
                  { type: 'application/pdf' },
                );
                setResponse(
                  await analyze(
                    file,
                    jdText,
                    new AbortController().signal,
                    true,
                  ),
                );
              } catch {
                setFailed(true);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Parse without AI (synthetic)
        </Button>
      </Stack>
      {busy && (
        <Typography role="status">
          Parsing synthetic source without AI…
        </Typography>
      )}
      {failed && (
        <Alert severity="error">
          The parse-only request failed. No AI request was sent. Check API
          readiness and retry Parse without AI.
        </Alert>
      )}
      <AnalysisResult response={response} />
    </Stack>
  );
}
