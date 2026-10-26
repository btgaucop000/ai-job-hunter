import type {
  CvData,
  JdData,
  QuoteReference,
  ExtractionSource,
} from '../../src/extraction/extraction.types.js';

export const unknownFact = () => ({ value: null, evidence: [] });
export const quotedFact = (value: string, segmentId = 's1', quote = value) => ({
  value,
  evidence: [{ segmentId, quote }],
});
export const emptyCv = (): CvData<QuoteReference> => ({
  name: unknownFact(),
  email: unknownFact(),
  phone: unknownFact(),
  location: unknownFact(),
  skills: [],
  experience: [],
  education: [],
});
export const emptyJd = (): JdData<QuoteReference> => ({
  title: unknownFact(),
  company: unknownFact(),
  location: unknownFact(),
  employmentType: unknownFact(),
  compensationText: unknownFact(),
  requirements: [],
  responsibilities: [],
});
export const syntheticSource = (
  text = 'Synthetic',
  format: ExtractionSource['format'] = 'pdf',
): ExtractionSource => ({
  format,
  text,
  segments: [
    { id: 's1', start: 0, end: text.length, page: format === 'pdf' ? 1 : null },
  ],
});
