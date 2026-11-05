// Synthetic scorer/policy data; no AI or private sources.
import type { MatchResult } from '../../src/features/inbox/cv-match.types';
import type { CvSuggestionsResponse } from '../../src/features/inbox/cv-suggestions.contract';
export const syntheticCv = 'Designed Java APIs.';
export const syntheticMatch: MatchResult = {
  score: 50,
  recommendation: 'Consider',
  requirements: [
    {
      parentId: 'p1',
      requirement: 'Experience designing APIs and integrations',
      priority: 'required',
      category: 'skill',
      jdQuote: 'Experience designing APIs and integrations',
      cvQuote: 'Designed Java APIs.',
      status: 'PARTIAL',
      credit: 0.5,
      coverage: {
        mode: 'AND',
        components: [
          {
            id: 'c1',
            label: 'APIs',
            jdQuote: 'APIs',
            status: 'EVIDENCED',
            cvQuote: 'Designed Java APIs.',
            conflictingQuotes: [],
          },
          {
            id: 'c2',
            label: 'integrations',
            jdQuote: 'integrations',
            status: 'NOT_EVIDENCED',
            cvQuote: '',
            conflictingQuotes: [],
          },
        ],
        credit: 0.5,
        status: 'PARTIAL',
        reason: 'Review the selected component evidence.',
      },
    },
    {
      parentId: 'p2',
      requirement: 'Kubernetes',
      priority: 'required',
      category: 'skill',
      jdQuote: 'Kubernetes',
      cvQuote: '',
      status: 'NOT_EVIDENCED',
      credit: 0,
      coverage: {
        mode: 'SINGLE',
        credit: 0,
        status: 'NOT_EVIDENCED',
        reason: 'Review the selected evidence.',
        components: [
          {
            id: 'c1',
            label: 'Kubernetes',
            jdQuote: 'Kubernetes',
            status: 'NOT_EVIDENCED',
            cvQuote: '',
            conflictingQuotes: [],
          },
        ],
      },
    },
    {
      parentId: 'p3',
      requirement: 'Java',
      priority: 'required',
      category: 'skill',
      jdQuote: 'Java',
      cvQuote: 'Designed Java APIs.',
      status: 'EVIDENCED',
      credit: 1,
      coverage: {
        mode: 'SINGLE',
        credit: 1,
        status: 'EVIDENCED',
        reason: 'Review the selected evidence.',
        components: [
          {
            id: 'c1',
            label: 'Java',
            jdQuote: 'Java',
            status: 'EVIDENCED',
            cvQuote: 'Designed Java APIs.',
            conflictingQuotes: [],
          },
        ],
      },
    },
  ],
  explanation:
    'Heuristic documented-evidence coverage: one canonical parent weight 3 if required, 1 if preferred; AND credit is proportional, OR needs one supported alternative and shared constraints. Unknown/conflict earns zero. AI links and requirement completeness need human review; this is not a hiring probability.',
  advice:
    'Verify the required evidence gaps before applying. Add only accurate supporting experience to your CV.',
  matchId: 'synthetic-p74-match',
  cvUpdatedAt: '2026-11-05T00:00:00.000Z',
  jobUpdatedAt: '2026-11-05T00:00:00.000Z',
  analyzedAt: new Date().toISOString(),
};
export const syntheticSuggestions: CvSuggestionsResponse = {
  contractVersion: '1',
  matchId: 'synthetic-p74-match',
  cvUpdatedAt: '2026-11-05T00:00:00.000Z',
  jobUpdatedAt: '2026-11-05T00:00:00.000Z',
  generatedAt: '2026-11-05T00:00:00.000Z',
  suggestions: [
    {
      parentId: 'p1',
      componentIds: ['c1', 'c2'],
      requirement: 'Experience designing APIs and integrations',
      priority: 'required',
      status: 'PARTIAL',
      kind: 'surface_evidence',
      reason:
        'Only some components are evidenced; this passage does not establish the full requirement.',
      wording: 'Designed Java APIs.',
      clarification: null,
      jdEvidence: [
        {
          parentId: 'p1',
          componentId: 'c1',
          cvUpdatedAt: '2026-11-05T00:00:00.000Z',
          jobUpdatedAt: '2026-11-05T00:00:00.000Z',
          source: 'canonical_saved_job_requirement',
          quote: 'APIs',
        },
        {
          parentId: 'p1',
          componentId: 'c2',
          cvUpdatedAt: '2026-11-05T00:00:00.000Z',
          jobUpdatedAt: '2026-11-05T00:00:00.000Z',
          source: 'canonical_saved_job_requirement',
          quote: 'integrations',
        },
      ],
      cvEvidence: [
        {
          parentId: 'p1',
          componentId: 'c1',
          cvUpdatedAt: '2026-11-05T00:00:00.000Z',
          jobUpdatedAt: '2026-11-05T00:00:00.000Z',
          source: 'saved_cv_text',
          quote: 'Designed Java APIs.',
          role: 'support',
          span: {
            start: 0,
            end: 19,
          },
        },
      ],
      id: 'candidate-1',
      rank: 1,
    },
    {
      parentId: 'p2',
      componentIds: ['c1'],
      requirement: 'Kubernetes',
      priority: 'required',
      status: 'NOT_EVIDENCED',
      kind: 'clarify',
      reason:
        'Not evidenced in the saved CV does not mean you lack this qualification.',
      wording: null,
      clarification:
        'Can you verify an accurate example? Add only what you can substantiate, with its role, scope and qualifiers.',
      jdEvidence: [
        {
          parentId: 'p2',
          componentId: 'c1',
          cvUpdatedAt: '2026-11-05T00:00:00.000Z',
          jobUpdatedAt: '2026-11-05T00:00:00.000Z',
          source: 'canonical_saved_job_requirement',
          quote: 'Kubernetes',
        },
      ],
      cvEvidence: [],
      id: 'candidate-2',
      rank: 2,
    },
    {
      parentId: 'p3',
      componentIds: ['c1'],
      requirement: 'Java',
      priority: 'required',
      status: 'EVIDENCED',
      kind: 'surface_evidence',
      reason:
        'Consider making this existing supporting passage easier to find.',
      wording: 'Designed Java APIs.',
      clarification: null,
      jdEvidence: [
        {
          parentId: 'p3',
          componentId: 'c1',
          cvUpdatedAt: '2026-11-05T00:00:00.000Z',
          jobUpdatedAt: '2026-11-05T00:00:00.000Z',
          source: 'canonical_saved_job_requirement',
          quote: 'Java',
        },
      ],
      cvEvidence: [
        {
          parentId: 'p3',
          componentId: 'c1',
          cvUpdatedAt: '2026-11-05T00:00:00.000Z',
          jobUpdatedAt: '2026-11-05T00:00:00.000Z',
          source: 'saved_cv_text',
          quote: 'Designed Java APIs.',
          role: 'support',
          span: {
            start: 0,
            end: 19,
          },
        },
      ],
      id: 'candidate-3',
      rank: 3,
    },
  ],
};
export const conflictMatch: MatchResult = {
  score: 0,
  recommendation: 'Low Fit',
  requirements: [
    {
      parentId: 'p1',
      requirement: 'Java',
      priority: 'required',
      category: 'skill',
      jdQuote: 'Java',
      cvQuote: 'Built Java APIs.',
      status: 'CONFLICT',
      credit: 0,
      coverage: {
        mode: 'SINGLE',
        credit: 0,
        status: 'CONFLICT',
        reason: 'Contradictory CV statements need review.',
        components: [
          {
            id: 'c1',
            label: 'Java',
            jdQuote: 'Java',
            status: 'CONFLICT',
            cvQuote: 'Built Java APIs.',
            conflictingQuotes: ['I have never used Java.'],
          },
        ],
      },
    },
  ],
  explanation:
    'Heuristic documented-evidence coverage: one canonical parent weight 3 if required, 1 if preferred; AND credit is proportional, OR needs one supported alternative and shared constraints. Unknown/conflict earns zero. AI links and requirement completeness need human review; this is not a hiring probability.',
  advice:
    'Verify the required evidence gaps before applying. Add only accurate supporting experience to your CV.',
  matchId: 'synthetic-p74-conflict',
  cvUpdatedAt: '2026-11-05T00:00:00.000Z',
  jobUpdatedAt: '2026-11-05T00:00:00.000Z',
  analyzedAt: new Date().toISOString(),
};
export const conflictSuggestions: CvSuggestionsResponse = {
  contractVersion: '1',
  matchId: 'synthetic-p74-conflict',
  cvUpdatedAt: '2026-11-05T00:00:00.000Z',
  jobUpdatedAt: '2026-11-05T00:00:00.000Z',
  generatedAt: '2026-11-05T00:00:00.000Z',
  suggestions: [
    {
      parentId: 'p1',
      componentIds: ['c1'],
      requirement: 'Java',
      priority: 'required',
      status: 'CONFLICT',
      kind: 'clarify',
      reason: 'Contradictory CV evidence needs review; no wording is offered.',
      wording: null,
      clarification:
        'Which CV statement is accurate? Reconcile the contradictory evidence before updating your CV.',
      jdEvidence: [
        {
          parentId: 'p1',
          componentId: 'c1',
          cvUpdatedAt: '2026-11-05T00:00:00.000Z',
          jobUpdatedAt: '2026-11-05T00:00:00.000Z',
          source: 'canonical_saved_job_requirement',
          quote: 'Java',
        },
      ],
      cvEvidence: [
        {
          parentId: 'p1',
          componentId: 'c1',
          cvUpdatedAt: '2026-11-05T00:00:00.000Z',
          jobUpdatedAt: '2026-11-05T00:00:00.000Z',
          source: 'saved_cv_text',
          quote: 'Built Java APIs.',
          role: 'support',
          span: {
            start: 0,
            end: 16,
          },
        },
        {
          parentId: 'p1',
          componentId: 'c1',
          cvUpdatedAt: '2026-11-05T00:00:00.000Z',
          jobUpdatedAt: '2026-11-05T00:00:00.000Z',
          source: 'saved_cv_text',
          quote: 'I have never used Java.',
          role: 'contradiction',
          span: {
            start: 17,
            end: 40,
          },
        },
      ],
      id: 'candidate-1',
      rank: 1,
    },
  ],
};
