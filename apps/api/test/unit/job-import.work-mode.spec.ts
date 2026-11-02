import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import {
  mergeCandidates,
  validateImportReview,
} from '../../src/opportunities/job-import.contract.js';
import { sourceCandidates } from '../../src/opportunities/job-import.evidence.js';
import { mdmJd } from '../support/mdm-import.synthetic.js';

test('MDM technical remote usage is rejected from both recovery and model proposals; salary unchanged', async () => {
  const quote = mdmJd
    .split('\n')
    .find((line) => line.includes('remote attestation'))!;
  const ai = {
    generateStructured: jest.fn(async () => ({
      candidates: [
        { field: 'workMode', value: 'remote', quote, source: 'post' },
      ],
    })),
  };
  expect(
    sourceCandidates(mdmJd, '').filter((item) => item.field === 'workMode'),
  ).toEqual([]);
  const result = await new JobImportService(ai as unknown as AiService).extract(
    { record: { postText: mdmJd } },
  );
  expect(result.error).toBeNull();
  expect(result.rejected).toBe(1);
  expect(
    result.fields.find((field) => field.field === 'workMode'),
  ).toMatchObject({ value: '', status: 'MISSING' });
  expect(result.fields.find((field) => field.field === 'salary')?.value).toBe(
    'Negotiable based on capability',
  );
  expect(validateImportReview(result.fields, mdmJd, '')).toEqual(result.fields);
});

test.each([
  ['Implement remote lock/wipe.', ''],
  ['Familiarity with remote attestation and desktop agent work.', ''],
  ['Build remote device management software.', ''],
  ['Office address: Hanoi. Monday–Friday, 8 AM–5 PM.', ''],
  ['work remotely', 'Remote'],
  ['fully remote position', 'Remote'],
  ['hybrid working arrangement', 'Hybrid'],
  ['on-site at our Hanoi office', 'Onsite'],
  ['Work mode: Remote', 'Remote'],
  ['Work mode: Hybrid', 'Hybrid'],
  ['Làm việc onsite tại quận 7, HCM.', 'Onsite'],
  ['Làm việc từ xa', 'Remote'],
  ['not a remote position', ''],
])('work arrangement requires contextual evidence: %s', (text, expected) => {
  const result = mergeCandidates(
    { candidates: sourceCandidates(text, '') },
    text,
    '',
  );
  expect(result.fields.find((field) => field.field === 'workMode')?.value).toBe(
    expected,
  );
});
