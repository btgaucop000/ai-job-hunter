import type {
  AnalysisResponse,
  RequirementResult,
} from '../../src/features/dashboard/analysis.types';
export function completed(): Extract<
  AnalysisResponse,
  { outcome: 'COMPLETED' }
> {
  const statuses: RequirementResult['status'][] = [
    'MATCHED',
    'PARTIAL',
    'MISSING_EVIDENCE',
    'NOT_MATCHED',
    'MISSING_EVIDENCE',
    'MISSING_EVIDENCE',
  ];
  return {
    contractVersion: '1',
    requestId: '00000000-0000-4000-8000-000000000001',
    outcome: 'COMPLETED',
    stages: {
      upload: 'SUCCEEDED',
      cv: 'SUCCEEDED',
      jd: 'SUCCEEDED',
      matching: 'SUCCEEDED',
    },
    error: null,
    result: {
      contractVersion: '1',
      policyVersion: 'matching-v1',
      scoreMeaning: 'DOCUMENTED_REQUIREMENT_SUPPORT',
      overallScore: 0,
      scoreExplanation: 'Synthetic score explanation.',
      reviewRequired: true,
      categories: [
        {
          category: 'technicalSkills',
          configuredWeight: 35,
          effectiveWeight: 1,
          score: 0,
          earnedWeight: 0,
          denominatorWeight: 4,
          eligibleRequirementCount: 4,
          excludedRequirementCount: 2,
          missingEvidenceCount: 1,
        },
        {
          category: 'experience',
          configuredWeight: 25,
          effectiveWeight: 0,
          score: null,
          earnedWeight: 0,
          denominatorWeight: 0,
          eligibleRequirementCount: 0,
          excludedRequirementCount: 0,
          missingEvidenceCount: 0,
        },
      ],
      coverage: {
        inputRequirementCount: 7,
        canonicalRequirementCount: 6,
        evaluableRequirementCount: 4,
        excludedRequirementCount: 2,
        unclassifiedRequirementCount: 1,
        activeCategoryWeight: 35,
        jdEvaluabilityRatio: 0.6667,
      },
      extractionWarnings: [
        { document: 'cv', warning: { code: 'PAGE_WITHOUT_TEXT', page: 2 } },
        {
          document: 'jd',
          warning: { code: 'EXTRACTION_COMPLETENESS_NOT_VERIFIED' },
        },
      ],
      uncertainty: ['SEMANTICS_NOT_VERIFIED'],
      requirements: statuses.map((status, index) => ({
        id: `r${index}`,
        jdRequirementIndexes: [index],
        originalTexts: [`Synthetic requirement ${index}`],
        category: 'technicalSkills',
        canonicalTerm: 'TypeScript',
        predicate: index >= 4 ? 'unsupported' : 'termPresence',
        minimumMonths: null,
        priority: 'unknown',
        importanceWeight: 1,
        status,
        evaluability:
          index === 4
            ? 'AMBIGUOUS_JD'
            : index === 5
              ? 'UNSUPPORTED'
              : 'EVALUABLE',
        includedInScore: index < 4,
        credit: index >= 4 ? null : 0,
        observedMonths: null,
        ruleIds: ['synthetic-rule'],
        explanation: {
          code: 'NO_USABLE_CV_SUPPORT',
          params: { term: 'TypeScript' },
          text: '<script>synthetic explanation</script>',
        },
        uncertainty: ['PRIORITY_UNKNOWN'],
        evidence: [
          {
            document: 'cv',
            factPath: 'skills[0].name',
            role: 'support',
            reference: {
              segmentId: 's1',
              quote: '<img src=x onerror="synthetic()">\n  evidence',
              start: 0,
              end: 49,
            },
          },
          {
            document: 'jd',
            factPath: 'requirements[0].text',
            role: 'context',
            reference: {
              segmentId: 'jd-1',
              quote: 'Synthetic JD evidence',
              start: 0,
              end: 21,
            },
          },
        ],
      })),
    },
  };
}
export function incomplete(
  code = 'INVALID_EVIDENCE',
): Extract<AnalysisResponse, { outcome: 'INCOMPLETE' }> {
  return {
    contractVersion: '1',
    requestId: '00000000-0000-4000-8000-000000000002',
    outcome: 'INCOMPLETE',
    stages: {
      upload: 'SUCCEEDED',
      cv: 'REJECTED',
      jd: 'NOT_RUN',
      matching: 'NOT_RUN',
    },
    result: null,
    error: {
      stage: 'CV',
      code,
      diagnostic:
        code === 'INVALID_EVIDENCE'
          ? {
              stage: 'EVIDENCE',
              rule: 'QUOTE_AMBIGUOUS',
              field: 'cv.skills[].name',
            }
          : null,
    },
  };
}
