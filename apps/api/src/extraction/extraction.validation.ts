import { EXTRACTION_DIAGNOSTIC_RULES } from './extraction.diagnostics.js';
import type {
  DiagnosticField,
  DiagnosticRule,
} from './extraction.diagnostics.js';
import { compileOutputSchema } from '../ai/ai.schema.js';
import { ExtractionError } from './extraction.errors.js';
import { EXTRACTION_LIMITS as limits } from './extraction.limits.js';
import {
  CV_OUTPUT_SCHEMA,
  JD_OUTPUT_SCHEMA,
  SOURCE_SCHEMA,
} from './extraction.schemas.js';
import type {
  CvData,
  JdData,
  Fact,
  QuoteReference,
  EvidenceReference,
  ExtractionSource,
} from './extraction.types.js';

const cvValidator = compileOutputSchema(CV_OUTPUT_SCHEMA).validate;
const jdValidator = compileOutputSchema(JD_OUTPUT_SCHEMA).validate;
const sourceValidator = compileOutputSchema(SOURCE_SCHEMA).validate;

export function validateText(input: unknown): string {
  if (typeof input !== 'string') throw new ExtractionError('INVALID_INPUT');
  if (
    input.length > limits.textUnits ||
    Buffer.byteLength(input, 'utf8') > limits.textBytes
  )
    throw new ExtractionError('DOCUMENT_TOO_LARGE');
  if (!input.trim()) throw new ExtractionError('NO_EXTRACTABLE_TEXT');
  return input; // Preserve every code unit for evidence offsets.
}

// Metadata validation only; format signatures/package structure belong to parsing.
export function validateDocumentInput(input: {
  readonly bytes: unknown;
  readonly fileName: unknown;
  readonly mediaType: unknown;
}): 'pdf' | 'docx' {
  if (
    !input ||
    !(input.bytes instanceof Uint8Array) ||
    input.bytes.byteLength === 0 ||
    typeof input.fileName !== 'string' ||
    typeof input.mediaType !== 'string'
  )
    throw new ExtractionError('INVALID_INPUT');
  if (input.bytes.byteLength > limits.fileBytes)
    throw new ExtractionError('DOCUMENT_TOO_LARGE');
  if (
    /[/\\]/u.test(input.fileName) ||
    Array.from(input.fileName).some(
      (character) => character.charCodeAt(0) < 32,
    ) ||
    input.fileName.length > 255
  )
    throw new ExtractionError('INVALID_INPUT');
  if (/\.pdf$/iu.test(input.fileName) && input.mediaType === 'application/pdf')
    return 'pdf';
  if (
    /\.docx$/iu.test(input.fileName) &&
    input.mediaType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx';
  throw new ExtractionError('UNSUPPORTED_FILE_TYPE');
}

function splitsSurrogate(text: string, offset: number): boolean {
  return (
    /[\uD800-\uDBFF]/u.test(text.charAt(offset - 1)) &&
    /[\uDC00-\uDFFF]/u.test(text.charAt(offset))
  );
}

export function createExtractionSource(input: unknown): ExtractionSource {
  if (!sourceValidator(input)) throw new ExtractionError('INVALID_SOURCE');
  // This assertion follows the application-owned runtime schema; semantic checks follow.
  const source = input as ExtractionSource;
  validateText(source.text);
  const ids = new Set<string>();
  let previousEnd = 0;
  for (const segment of source.segments) {
    if (
      !segment.id.trim() ||
      ids.has(segment.id) ||
      !Number.isSafeInteger(segment.start) ||
      !Number.isSafeInteger(segment.end) ||
      segment.start < previousEnd ||
      segment.start >= segment.end ||
      segment.end > source.text.length ||
      splitsSurrogate(source.text, segment.start) ||
      splitsSurrogate(source.text, segment.end) ||
      (source.format === 'pdf' ? segment.page === null : segment.page !== null)
    )
      throw new ExtractionError('INVALID_SOURCE');
    ids.add(segment.id);
    previousEnd = segment.end;
  }
  return Object.freeze({
    format: source.format,
    text: source.text,
    segments: Object.freeze(
      source.segments.map((segment) => Object.freeze({ ...segment })),
    ),
  });
}

function reject(rule: DiagnosticRule, field: DiagnosticField): never {
  const stage = EXTRACTION_DIAGNOSTIC_RULES[rule];
  throw new ExtractionError(
    stage === 'OUTPUT' ? 'INVALID_OUTPUT' : 'INVALID_EVIDENCE',
    { stage, rule, field },
  );
}

function resolveQuote(
  source: ExtractionSource,
  reference: QuoteReference,
  field: DiagnosticField,
): EvidenceReference {
  const segment = source.segments.find(
    (item) => item.id === reference.segmentId,
  );
  if (!segment) reject('SEGMENT_UNKNOWN', field);
  if (!reference.quote.trim()) reject('QUOTE_EMPTY', field);
  if (reference.quote.length > limits.quoteUnits)
    reject('QUOTE_TOO_LONG', field);
  const text = source.text.slice(segment.start, segment.end);
  const local = text.indexOf(reference.quote);
  // Search from +1, not quote.length: overlapping matches are ambiguous too.
  if (local < 0) reject('QUOTE_NOT_FOUND', field);
  if (text.indexOf(reference.quote, local + 1) !== -1)
    reject('QUOTE_AMBIGUOUS', field);
  const start = segment.start + local;
  const end = start + reference.quote.length;
  if (splitsSurrogate(source.text, start) || splitsSurrogate(source.text, end))
    reject('QUOTE_BOUNDARY_INVALID', field);
  return { segmentId: segment.id, quote: reference.quote, start, end };
}

function resolveFact<V extends string>(
  source: ExtractionSource,
  fact: Fact<QuoteReference, V>,
  field: DiagnosticField,
  priority = false,
): Fact<EvidenceReference, V> {
  if (fact.value === null) {
    if (fact.evidence.length) reject('NULL_WITH_EVIDENCE', field);
    return { value: null, evidence: [] };
  }
  if (!fact.value.trim()) reject('VALUE_EMPTY', field);
  if (fact.value.length > limits.factUnits) reject('VALUE_TOO_LONG', field);
  if (!fact.evidence.length) reject('EVIDENCE_MISSING', field);
  const evidence = fact.evidence.map((reference) =>
    resolveQuote(source, reference, field),
  );
  if (
    new Set(evidence.map((item) => `${item.start}:${item.end}`)).size !==
    evidence.length
  )
    reject('EVIDENCE_DUPLICATE', field);
  // Priority is the sole categorization: require its literal cue as a whole word.
  const supported = priority
    ? evidence.some((item) =>
        (fact.value === 'required' ? /\brequired\b/iu : /\bpreferred\b/iu).test(
          item.quote,
        ),
      )
    : evidence.some((item) => item.quote.includes(fact.value!));
  if (!supported)
    reject(priority ? 'PRIORITY_CUE_MISSING' : 'VALUE_UNSUPPORTED', field);
  return { value: fact.value, evidence };
}

function checkOutputSize(input: unknown, field: DiagnosticField): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input);
  } catch {
    reject('OUTPUT_NOT_SERIALIZABLE', field);
  }
  if (serialized === undefined) reject('OUTPUT_NOT_SERIALIZABLE', field);
  if (Buffer.byteLength(serialized, 'utf8') > limits.outputBytes)
    throw new ExtractionError('OUTPUT_TOO_LARGE');
}

export function validateCvOutput(input: unknown, sourceInput: unknown): CvData {
  const source = createExtractionSource(sourceInput);
  if (source.format === 'text') throw new ExtractionError('INVALID_SOURCE');
  checkOutputSize(input, 'cv');
  if (!cvValidator(input)) reject('SCHEMA_MISMATCH', 'cv');
  const data = input as CvData<QuoteReference>;
  const fact = (value: Fact<QuoteReference>, field: DiagnosticField) =>
    resolveFact(source, value, field);
  const result: CvData = {
    name: fact(data.name, 'cv.name'),
    email: fact(data.email, 'cv.email'),
    phone: fact(data.phone, 'cv.phone'),
    location: fact(data.location, 'cv.location'),
    skills: data.skills.map((item) => ({
      name: fact(item.name, 'cv.skills[].name'),
      experienceText: fact(item.experienceText, 'cv.skills[].experienceText'),
    })),
    experience: data.experience.map((item) => ({
      employer: fact(item.employer, 'cv.experience[].employer'),
      title: fact(item.title, 'cv.experience[].title'),
      startDateText: fact(item.startDateText, 'cv.experience[].startDateText'),
      endDateText: fact(item.endDateText, 'cv.experience[].endDateText'),
      descriptionText: fact(
        item.descriptionText,
        'cv.experience[].descriptionText',
      ),
    })),
    education: data.education.map((item) => ({
      institution: fact(item.institution, 'cv.education[].institution'),
      qualification: fact(item.qualification, 'cv.education[].qualification'),
      dateText: fact(item.dateText, 'cv.education[].dateText'),
    })),
  };
  // Empty records assert no fact and should not masquerade as extracted history.
  if (result.skills.some((item) => item.name.value === null))
    reject('REQUIRED_COLLECTION_VALUE_NULL', 'cv.skills[].name');
  if (
    result.experience.some((item) =>
      Object.values(item).every((value) => value.value === null),
    )
  )
    reject('EMPTY_HISTORY_RECORD', 'cv.experience[]');
  if (
    result.education.some((item) =>
      Object.values(item).every((value) => value.value === null),
    )
  )
    reject('EMPTY_HISTORY_RECORD', 'cv.education[]');
  rejectDuplicates(result.skills.map((item) => item.name.value));
  rejectDuplicates(result.experience.map(historyKey));
  rejectDuplicates(result.education.map(historyKey));
  return result;
}

export function validateJdOutput(input: unknown, sourceInput: unknown): JdData {
  const source = createExtractionSource(sourceInput);
  if (source.format !== 'text') throw new ExtractionError('INVALID_SOURCE');
  checkOutputSize(input, 'jd');
  if (!jdValidator(input)) reject('SCHEMA_MISMATCH', 'jd');
  const data = input as JdData<QuoteReference>;
  const fact = (value: Fact<QuoteReference>, field: DiagnosticField) =>
    resolveFact(source, value, field);
  const result: JdData = {
    title: fact(data.title, 'jd.title'),
    company: fact(data.company, 'jd.company'),
    location: fact(data.location, 'jd.location'),
    employmentType: fact(data.employmentType, 'jd.employmentType'),
    compensationText: fact(data.compensationText, 'jd.compensationText'),
    requirements: data.requirements.map((item) => ({
      text: fact(item.text, 'jd.requirements[].text'),
      priority: resolveFact(
        source,
        item.priority,
        'jd.requirements[].priority',
        true,
      ),
    })),
    responsibilities: data.responsibilities.map((item) =>
      fact(item, 'jd.responsibilities[]'),
    ),
  };
  if (result.requirements.some((item) => item.text.value === null))
    reject('REQUIRED_COLLECTION_VALUE_NULL', 'jd.requirements[].text');
  if (result.responsibilities.some((item) => item.value === null))
    reject('REQUIRED_COLLECTION_VALUE_NULL', 'jd.responsibilities[]');
  // A priority cue must be in the same cited passage as the requirement it qualifies.
  for (const item of result.requirements) {
    if (
      item.priority.value !== null &&
      !item.priority.evidence.some(
        (cue) =>
          cue.quote.includes(item.text.value!) &&
          item.text.evidence.some(
            (text) =>
              cue.segmentId === text.segmentId &&
              cue.start <= text.start &&
              cue.end >= text.end,
          ),
      )
    )
      reject('PRIORITY_LINK_INVALID', 'jd.requirements[].priority');
  }
  rejectDuplicates(result.requirements.map((item) => item.text.value));
  rejectDuplicates(result.responsibilities.map((item) => item.value));
  return result;
}

function rejectDuplicates(keys: readonly (string | null)[]): void {
  if (new Set(keys).size !== keys.length)
    throw new ExtractionError('DUPLICATE_FACT');
}

// Validators construct fields in fixed order. Evidence order is not identity;
// sort detached reference tuples without changing source text or returned data.
function historyKey(item: Record<string, Fact>): string {
  return JSON.stringify(
    Object.values(item).map((fact) => [
      fact.value,
      fact.evidence
        .map((ref) =>
          JSON.stringify([ref.segmentId, ref.quote, ref.start, ref.end]),
        )
        .sort(),
    ]),
  );
}
