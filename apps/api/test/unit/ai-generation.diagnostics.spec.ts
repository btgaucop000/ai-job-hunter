import { afterEach, expect, jest, test } from '@jest/globals';
import {
  aiGenerationDiagnosticsEnabled,
  configureAiGenerationDiagnostics,
  emitFinalLengthDiagnostic,
  withAiGenerationDiagnosticRequest,
} from '../../src/ai/ai-generation.diagnostics.js';
import type { FinalLengthDiagnosticRecord } from '../../src/ai/ai-generation.diagnostics.js';

const requestId = '7ef4cc66-c25b-4db2-a846-740165d06d22';
const metadata = {
  promptTokens: 4000,
  evalCount: 2048,
  outputTokenLimit: 2048,
  jsonSyntax: 'INVALID',
} as const;

afterEach(() => {
  configureAiGenerationDiagnostics(false, '127.0.0.1', () => {});
});

test('generation diagnostics are disabled by default', () => {
  const sink = jest.fn<(record: FinalLengthDiagnosticRecord) => void>();
  configureAiGenerationDiagnostics(false, '127.0.0.1', sink);
  withAiGenerationDiagnosticRequest(requestId, 'CV', () =>
    emitFinalLengthDiagnostic(metadata),
  );
  expect(aiGenerationDiagnosticsEnabled()).toBe(false);
  expect(sink).not.toHaveBeenCalled();
});

test.each(['0.0.0.0', 'localhost', '::ffff:127.0.0.1'])(
  'rejects non-loopback diagnostic host %s',
  (host) => {
    const sink = jest.fn<(record: FinalLengthDiagnosticRecord) => void>();
    configureAiGenerationDiagnostics(true, host, sink);
    withAiGenerationDiagnosticRequest(requestId, 'CV', () =>
      emitFinalLengthDiagnostic(metadata),
    );
    expect(aiGenerationDiagnosticsEnabled()).toBe(false);
    expect(sink).not.toHaveBeenCalled();
  },
);

test.each(['127.0.0.1', '::1'] as const)(
  'emits one closed record on loopback host %s',
  (host) => {
    const sink = jest.fn<(record: FinalLengthDiagnosticRecord) => void>();
    configureAiGenerationDiagnostics(true, host, sink);
    withAiGenerationDiagnosticRequest(requestId, 'JD', () => {
      emitFinalLengthDiagnostic(metadata);
      emitFinalLengthDiagnostic({
        promptTokens: 1,
        evalCount: 1,
        jsonSyntax: 'VALID',
      });
    });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith({
      requestId,
      extractionKind: 'JD',
      reason: 'FINAL_LENGTH',
      promptTokens: 4000,
      evalCount: 2048,
      outputTokenLimit: 2048,
      jsonSyntax: 'INVALID',
    });
    expect(Object.keys(sink.mock.calls[0]![0]).sort()).toEqual(
      [
        'evalCount',
        'extractionKind',
        'jsonSyntax',
        'outputTokenLimit',
        'promptTokens',
        'reason',
        'requestId',
      ].sort(),
    );
  },
);

test.each([
  [{ ...metadata, privateOutput: 'PRIVATE' }],
  [{ ...metadata, promptTokens: 0 }],
  [{ ...metadata, promptTokens: 8193 }],
  [{ ...metadata, evalCount: 0 }],
  [{ ...metadata, evalCount: 2049 }],
  [{ ...metadata, outputTokenLimit: 2047 }],
  [{ ...metadata, outputTokenLimit: 4097 }],
  [{ ...metadata, outputTokenLimit: 2048.5 }],
  [{ ...metadata, jsonSyntax: 'UNKNOWN' }],
] as const)('rejects malformed or unbounded metadata %#', (value) => {
  const sink = jest.fn<(record: FinalLengthDiagnosticRecord) => void>();
  configureAiGenerationDiagnostics(true, '127.0.0.1', sink);
  withAiGenerationDiagnosticRequest(requestId, 'CV', () =>
    emitFinalLengthDiagnostic(value),
  );
  expect(sink).not.toHaveBeenCalled();
});

test('rejects missing context and invalid request IDs without exposing values', () => {
  const sink = jest.fn<(record: FinalLengthDiagnosticRecord) => void>();
  configureAiGenerationDiagnostics(true, '127.0.0.1', sink);
  emitFinalLengthDiagnostic(metadata);
  withAiGenerationDiagnosticRequest('private-file-name', 'CV', () =>
    emitFinalLengthDiagnostic(metadata),
  );
  expect(sink).not.toHaveBeenCalled();
});

test('diagnostic sink failure cannot change application behavior', () => {
  configureAiGenerationDiagnostics(true, '127.0.0.1', () => {
    throw new Error('private sink failure');
  });
  expect(() =>
    withAiGenerationDiagnosticRequest(requestId, 'CV', () =>
      emitFinalLengthDiagnostic(metadata),
    ),
  ).not.toThrow();
});
