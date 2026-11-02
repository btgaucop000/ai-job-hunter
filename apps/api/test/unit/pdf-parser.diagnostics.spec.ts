import { afterEach, expect, jest, test } from '@jest/globals';
import {
  configurePdfParserDiagnostics,
  emitPdfParserDiagnostic,
  pdfParserDiagnosticsEnabled,
  withPdfParserDiagnosticRequest,
} from '../../src/extraction/pdf-parser.diagnostics.js';
import type { PdfParserDiagnosticRecord } from '../../src/extraction/pdf-parser.diagnostics.js';

const diagnostic = {
  phase: 'TEXT_STREAM',
  category: 'UNKNOWN_PDFJS',
  recoveryAttempted: true,
} as const;

afterEach(() => {
  configurePdfParserDiagnostics(false, '127.0.0.1', () => {});
});

test('diagnostics are disabled by default', () => {
  const sink = jest.fn<(record: PdfParserDiagnosticRecord) => void>();
  configurePdfParserDiagnostics(false, '127.0.0.1', sink);
  emitPdfParserDiagnostic(diagnostic, 'MESSAGE');
  expect(pdfParserDiagnosticsEnabled()).toBe(false);
  expect(sink).not.toHaveBeenCalled();
});

test.each([
  [false, '127.0.0.1'],
  [true, '0.0.0.0'],
  [true, 'localhost'],
  [true, '::ffff:127.0.0.1'],
] as const)(
  'does not enable diagnostics for requested=%s host=%s',
  (requested, host) => {
    const sink = jest.fn<(record: PdfParserDiagnosticRecord) => void>();
    configurePdfParserDiagnostics(requested, host, sink);
    emitPdfParserDiagnostic(diagnostic, 'MESSAGE');
    expect(pdfParserDiagnosticsEnabled()).toBe(false);
    expect(sink).not.toHaveBeenCalled();
  },
);

test.each(['127.0.0.1', '::1'] as const)(
  'emits only closed tokens on loopback host %s',
  (host) => {
    const sink = jest.fn<(record: PdfParserDiagnosticRecord) => void>();
    configurePdfParserDiagnostics(true, host, sink);
    withPdfParserDiagnosticRequest(
      '7ef4cc66-c25b-4db2-a846-740165d06d22',
      () => emitPdfParserDiagnostic(diagnostic, 'MESSAGE'),
    );
    expect(sink).toHaveBeenCalledWith({
      requestId: '7ef4cc66-c25b-4db2-a846-740165d06d22',
      phase: 'TEXT_STREAM',
      category: 'UNKNOWN_PDFJS',
      recoveryAttempted: true,
      workerStatus: 'MESSAGE',
    });
    expect(Object.keys(sink.mock.calls[0]![0]).sort()).toEqual(
      [
        'category',
        'phase',
        'recoveryAttempted',
        'requestId',
        'workerStatus',
      ].sort(),
    );
  },
);

test('rejects malformed diagnostics and sanitizes a non-application request ID', () => {
  const sink = jest.fn<(record: PdfParserDiagnosticRecord) => void>();
  configurePdfParserDiagnostics(true, '127.0.0.1', sink);
  withPdfParserDiagnosticRequest('private-file-name.pdf', () => {
    emitPdfParserDiagnostic(
      { ...diagnostic, exception: 'private raw error' },
      'MESSAGE',
    );
    emitPdfParserDiagnostic(diagnostic, 'private-status');
    emitPdfParserDiagnostic(diagnostic, 'ERROR');
  });
  expect(sink).toHaveBeenCalledTimes(1);
  expect(sink.mock.calls[0]![0]).toEqual({
    requestId: null,
    ...diagnostic,
    workerStatus: 'ERROR',
  });
  expect(JSON.stringify(sink.mock.calls)).not.toContain('private');
});
