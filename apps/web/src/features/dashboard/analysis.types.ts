// Browser-owned version-1 wire types. No backend runtime imports.
interface EvidenceReference {
  readonly segmentId: string;
  readonly quote: string;
  readonly start: number;
  readonly end: number;
}
type ExtractionWarning =
  | {
      readonly code:
        | 'IMAGE_CONTENT_NOT_INTERPRETED'
        | 'DOCX_CONTENT_WARNING'
        | 'EXTRACTION_COMPLETENESS_NOT_VERIFIED';
    }
  | { readonly code: 'PAGE_WITHOUT_TEXT'; readonly page: number };
export type Category =
  | 'technicalSkills'
  | 'experience'
  | 'architecture'
  | 'engineeringPractices'
  | 'domainKnowledge';
export type MatchStatus =
  'MATCHED' | 'PARTIAL' | 'MISSING_EVIDENCE' | 'NOT_MATCHED';
export type Priority = 'required' | 'preferred' | 'unknown';
export type Predicate =
  'termPresence' | 'experiencePresence' | 'minimumDuration' | 'unsupported';
export type UncertaintyCode =
  | 'SEMANTICS_NOT_VERIFIED'
  | 'CV_FACT_NOT_STATED'
  | 'DURATION_UNKNOWN'
  | 'CONFLICTING_CV_EVIDENCE'
  | 'AMBIGUOUS_JD_REQUIREMENT'
  | 'UNSUPPORTED_REQUIREMENT'
  | 'PRIORITY_UNKNOWN'
  | 'PRIORITY_CONFLICT'
  | 'CONTEXT_NOT_SUPPORTED'
  | 'POSSIBLE_REQUIREMENT_OVERLAP';
export interface EvidenceLink {
  readonly document: 'cv' | 'jd';
  readonly factPath: string;
  readonly reference: EvidenceReference;
  readonly role: 'support' | 'contradiction' | 'context' | 'priority';
}
export interface Explanation {
  readonly code:
    | 'EXPLICIT_SUPPORT'
    | 'DURATION_BELOW_MINIMUM'
    | 'EXPLICIT_NEGATIVE'
    | 'NO_USABLE_CV_SUPPORT'
    | 'UNKNOWN_DURATION'
    | 'CONFLICTING_EVIDENCE'
    | 'REQUIREMENT_NOT_EVALUABLE';
  readonly params: Readonly<Record<string, string | number>>;
  readonly text: string;
}
export interface RequirementResult {
  readonly id: string;
  readonly jdRequirementIndexes: readonly number[];
  readonly originalTexts: readonly string[];
  readonly category: Category | null;
  readonly canonicalTerm: string | null;
  readonly predicate: Predicate;
  readonly minimumMonths: number | null;
  readonly priority: Priority;
  readonly importanceWeight: 1 | 2;
  readonly status: MatchStatus;
  readonly evaluability: 'EVALUABLE' | 'AMBIGUOUS_JD' | 'UNSUPPORTED';
  readonly includedInScore: boolean;
  readonly credit: number | null;
  readonly observedMonths: number | null;
  readonly ruleIds: readonly string[];
  readonly evidence: readonly EvidenceLink[];
  readonly explanation: Explanation;
  readonly uncertainty: readonly UncertaintyCode[];
}
export interface CategoryScore {
  readonly category: Category;
  readonly configuredWeight: 35 | 25 | 20 | 10;
  readonly effectiveWeight: number;
  readonly score: number | null;
  readonly earnedWeight: number;
  readonly denominatorWeight: number;
  readonly eligibleRequirementCount: number;
  readonly excludedRequirementCount: number;
  readonly missingEvidenceCount: number;
}
export interface MatchingResult {
  readonly contractVersion: '1';
  readonly policyVersion: 'matching-v1';
  readonly overallScore: number | null;
  readonly scoreExplanation: string | null;
  readonly scoreMeaning: 'DOCUMENTED_REQUIREMENT_SUPPORT';
  readonly categories: readonly CategoryScore[];
  readonly requirements: readonly RequirementResult[];
  readonly coverage: {
    readonly inputRequirementCount: number;
    readonly canonicalRequirementCount: number;
    readonly evaluableRequirementCount: number;
    readonly excludedRequirementCount: number;
    readonly unclassifiedRequirementCount: number;
    readonly activeCategoryWeight: number;
    readonly jdEvaluabilityRatio: number | null;
  };
  readonly extractionWarnings: readonly {
    readonly document: 'cv' | 'jd';
    readonly warning: ExtractionWarning;
  }[];
  readonly uncertainty: readonly UncertaintyCode[];
  readonly reviewRequired: true;
}

export type StageStatus =
  'NOT_RUN' | 'SUCCEEDED' | 'REJECTED' | 'TIMED_OUT' | 'FAILED';
export interface Stages {
  upload: StageStatus;
  cv: StageStatus;
  jd: StageStatus;
  matching: StageStatus;
}
export interface AnalysisError {
  stage: 'REQUEST' | 'CV' | 'JD' | 'MATCHING';
  code: string;
  diagnostic: { stage: string; rule: string; field: string } | null;
}
interface Base {
  contractVersion: '1';
  requestId: string;
  stages: Stages;
}
export type AnalysisResponse = Base &
  (
    | { outcome: 'COMPLETED'; result: MatchingResult; error: null }
    | { outcome: 'INCOMPLETE'; result: null; error: AnalysisError }
  );
