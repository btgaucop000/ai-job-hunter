import { afterAll, expect, jest, test } from '@jest/globals';
import mammoth from 'mammoth';
import { DocumentParser } from '../../src/extraction/document-parser.js';
import { parseDocx } from '../../src/extraction/docx.parser.js';
import { validateParseResponse } from '../../src/extraction/parser.protocol.js';
import { docxEntries, docxInput, paragraph } from '../support/docx-fixtures.js';
const parser = new DocumentParser();
afterAll(() => parser.close());
test('distinguishes a corrupt ZIP from package validation through the real worker', async () => {
  await expect(
    parser.parse({
      ...docxInput(),
      bytes: Buffer.from('SYNTHETIC_INVALID_ARCHIVE'),
    }),
  ).rejects.toMatchObject({
    code: 'PARSING_FAILED',
    docxFailure: 'ZIP_INVALID',
    message: 'Document parsing failed',
  });
  await expect(
    parser.parse(docxInput(docxEntries().slice(1))),
  ).rejects.toMatchObject({
    code: 'PARSING_FAILED',
    docxFailure: 'PACKAGE_INVALID',
  });
  expect(
    (
      await parser.parse(
        docxInput(
          docxEntries({ body: paragraph('Synthetic JD after failure') }),
        ),
      )
    ).source.text,
  ).toContain('Synthetic JD after failure');
});
test('identifies unsupported ZIP features without relaxing existing checks', async () => {
  const entries = docxEntries().map((entry) => ({ ...entry, flags: 0x808 }));
  await expect(parser.parse(docxInput(entries))).rejects.toMatchObject({
    code: 'PARSING_FAILED',
    docxFailure: 'ZIP_UNSUPPORTED_PROFILE',
  });
});
test('classifies text-library failures without retaining raw errors', async () => {
  const spy = jest
    .spyOn(mammoth, 'extractRawText')
    .mockRejectedValueOnce(new Error('PRIVATE_LIBRARY_PAYLOAD'));
  try {
    await expect(parseDocx(docxInput().bytes)).rejects.toMatchObject({
      code: 'PARSING_FAILED',
      docxFailure: 'TEXT_EXTRACTION_FAILED',
      message: 'Document parsing failed',
    });
  } finally {
    spy.mockRestore();
  }
});
test('worker failure diagnostics accept only fixed tokens and correct error codes', () => {
  const base = {
    version: 1,
    ok: false,
    code: 'PARSING_FAILED',
    diagnostic: null,
  };
  expect(
    validateParseResponse({ ...base, docxFailure: 'ZIP_INVALID' }),
  ).toMatchObject({ docxFailure: 'ZIP_INVALID' });
  for (const value of ['PRIVATE_FILENAME', null, {}, ''])
    expect(() =>
      validateParseResponse({ ...base, docxFailure: value }),
    ).toThrow();
  expect(() =>
    validateParseResponse({
      ...base,
      code: 'NO_EXTRACTABLE_TEXT',
      docxFailure: 'ZIP_INVALID',
    }),
  ).toThrow();
});
