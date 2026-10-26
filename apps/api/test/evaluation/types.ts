import type { LiveCode } from './live-errors.js';
import type {
  EvidenceReference,
  ExtractionResult,
  ExtractionSource,
} from '../../src/extraction/extraction.types.js';

export interface Ratio {
  numerator: number;
  denominator: number;
  value: number | null;
}
export interface GoldFact {
  id: string;
  field: string;
  subject: string;
  values: readonly string[];
  anchor: string;
  important: boolean;
  polarity: 'positive' | 'negative';
}
export interface SourceFact {
  id: string;
  anchor: string;
  polarity: 'positive' | 'negative' | 'uncertain' | 'instruction';
}
export interface Probe {
  field: string;
  subject: string;
  values: readonly string[];
  reason: 'negation' | 'uncertain' | 'injection';
}
export interface ExtractionGold {
  facts: readonly GoldFact[];
  sourceFacts: readonly SourceFact[];
  forbidden: readonly Probe[];
  priorities: readonly {
    subject: string;
    value: 'required' | 'preferred' | null;
  }[];
}
export interface Atom {
  field: string;
  subject: string;
  value: string;
  evidence: readonly EvidenceReference[];
}
export type Observation =
  | { outcome: 'SUCCESS'; result: ExtractionResult }
  | { outcome: 'REJECTED'; code: LiveCode }
  | { outcome: 'NOT_RUN' };
export interface ExtractionMetrics {
  counts: { tp: number; fp: number; fn: number } | null;
  precision: Ratio | null;
  recall: Ratio | null;
  importantCompleteness: Ratio | null;
  unsupportedPositiveClaims: Ratio | null;
  forbiddenClaims: {
    negation: number;
    uncertain: number;
    injection: number;
  } | null;
  negationHandling: Ratio | null;
  priorityAccuracy: Ratio | null;
  evidenceValidity: Ratio | null;
  evidenceSupport: Ratio | null;
  deliveredRecall: Ratio;
  deliveredImportantCompleteness: Ratio;
  deliveredNegationHandling: Ratio;
  completion: Ratio;
  failures: string[];
}
export type Source = ExtractionSource;
