import { BadRequestException } from '@nestjs/common';
import { ExtractionError } from '../extraction/extraction.errors.js';
import type { DocxFailureReason } from '../extraction/docx-failure.js';
const messages: Record<DocxFailureReason, string> = {
  ZIP_INVALID:
    'The DOCX archive is damaged or has an unsupported ZIP layout. Open it in Word or LibreOffice and Save As a new .docx, or paste the JD text.',
  ZIP_UNSUPPORTED_PROFILE:
    'This DOCX uses ZIP features the current safety validator does not support (such as streaming data descriptors or ZIP64). Save As a new standard .docx or export a text PDF, or paste the JD text.',
  PACKAGE_INVALID:
    'The DOCX package/XML structure is invalid or unsupported. Open it in Word or LibreOffice and Save As a new .docx, or paste the JD text.',
  TEXT_EXTRACTION_FAILED:
    'The DOCX passed ZIP/package validation but text extraction failed. Export a text PDF or paste the JD text.',
  WORKER_FAILED:
    'The document parser worker could not complete the DOCX request. Retry once; if it persists, export a text PDF or paste the JD text.',
};
export class JobDocumentError extends BadRequestException {
  readonly errorCode: string;
  readonly parserReason?: DocxFailureReason;
  constructor(error: unknown) {
    const code =
      error instanceof ExtractionError ? error.code : 'PARSING_FAILED';
    const reason =
      error instanceof ExtractionError ? error.docxFailure : undefined;
    const message = reason
      ? messages[reason]
      : code === 'PARSING_FAILED'
        ? 'The document could not be parsed. Check that it opens in Word or a PDF reader; Save As a fresh supported file or paste the JD text.'
        : error instanceof ExtractionError
          ? `${error.message}. Remove the attachment and paste JD text, or correct the file and retry.`
          : 'The document parser could not complete this request. Retry or remove the attachment and paste JD text.';
    super(message);
    this.errorCode = code;
    this.parserReason = reason;
  }
}
