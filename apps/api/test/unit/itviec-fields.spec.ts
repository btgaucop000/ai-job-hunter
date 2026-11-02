import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import { parseJobPosting } from '../../src/opportunities/job-url-import.js';
import { mergeCandidates, validateImportReview, type ImportCandidate, type ImportFieldName } from '../../src/opportunities/job-import.contract.js';
import { salaryEvidence } from '../../src/opportunities/job-import.salary.js';
import { validateOpportunity } from '../../src/opportunities/opportunity.validation.js';
const url = 'https://itviec.com/it-jobs/synthetic-bbv';
const required = ['Java', 'Spring Boot', 'REST APIs', 'JPA/Hibernate', 'SQL', 'Angular', 'TypeScript', 'Kafka', 'Docker', 'Kubernetes', 'CI/CD'];
const preferred = ['DDD', 'Hexagonal Architecture', 'Multi-Tenancy', 'ARC42', 'TDD', 'Pair Programming', 'AI-assisted development tools'];
const domain = 'You will work on enterprise-grade platforms across industries such as Real Estate, Facility Management, Healthcare, MedTech, and Insurance.';
const businessDomains = 'Real Estate, Facility Management, Healthcare, MedTech, Insurance';
const job = {
  '@type': 'JobPosting', title: 'Java Backend Developer', hiringOrganization: { name: 'Synthetic bbv Vietnam' },
  jobLocation: { address: { addressLocality: 'Ho Chi Minh City' } },
  description: `<h3>Must have</h3><ul>${required.map(skill => `<li>${skill}</li>`).join('')}</ul><h3>Nice to have</h3><ul>${preferred.map(skill => `<li>${skill}</li>`).join('')}</ul><h3>Benefits</h3><p>Training and insurance coverage.</p><p>${domain}</p>`,
};
const html = (value: unknown = job, salary = '') => `<script type="application/ld+json">${JSON.stringify(value)}</script>${salary}`;
async function extract(input: string, candidates: ImportCandidate[] = []) {
  const ai = { generateStructured: jest.fn(async (_request: unknown) => ({ candidates })) };
  const output = await new JobImportService(ai as unknown as AiService).extract({ record: { postText: input } });
  expect(ai.generateStructured).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining(input.split('\n')[0]!) }));
  expect(output.error).toBeNull();
  const values = Object.fromEntries(output.fields.map(field => [field.field, field.value])) as Record<ImportFieldName, string>;
  if (output.fields.some(field => field.status === 'CONFLICT')) expect(() => validateImportReview(output.fields, input, '')).toThrow('Review every conflicting');
  else expect(validateImportReview(output.fields, input, '')).toEqual(output.fields);
  return { output, values };
}
test('HTML headings survive fetch, sections populate canonical skills/domain even when provider omits them', async () => {
  const fetched = parseJobPosting(html(), url);
  expect(fetched.description).toContain('Must have\nJava');
  expect(fetched.description).toContain('Nice to have\nDDD');
  const { output, values } = await extract(fetched.sourceText);
  expect(values.skills.split('\n')).toEqual(required);
  expect(values.preferredSkills.split('\n')).toEqual(preferred);
  expect(values.domain).toBe(businessDomains);
  expect(values.salary).toBe('');
  expect(fetched.salaryDetails).toBeNull();
  const saved = validateOpportunity({ ...values, postText: fetched.sourceText, importReview: output.fields, source: 'Website', status: 'SAVED', description: fetched.description, notes: '', contactDates: [], followUpDate: null });
  expect(saved).toMatchObject({ skills: required.join('\n'), preferredSkills: preferred.join('\n'), domain: businessDomains, salary: '' });
});
test('honors source section classification, rejects fabricated expansions, and avoids cross-list duplicates', async () => {
  const input = parseJobPosting(html(), url).sourceText;
  const { output, values } = await extract(input, [
    { field: 'skills', value: 'DDD', source: 'post', quote: 'DDD' },
    { field: 'preferredSkills', value: 'Java', source: 'post', quote: 'Java' },
    { field: 'skills', value: 'Domain Driven Design', source: 'post', quote: 'DDD' },
    { field: 'domain', value: 'Insurance', source: 'post', quote: domain },
  ]);
  expect(values.skills.split('\n')).toEqual(required);
  expect(values.preferredSkills.split('\n')).toEqual(preferred);
  expect(values.skills).not.toContain('DDD');
  expect(values.preferredSkills.split('\n')).not.toContain('Java');
  expect(values.domain).toBe(businessDomains);
  expect(output.rejected).toBe(1);
});
test('also preserves JobPosting requirements and domain outside description', async () => {
  const fetched = parseJobPosting(html({ ...job, description: '<p>Build enterprise applications.</p>', qualifications: '<h3>Must have</h3><p>Java, Spring Boot, SQL</p><h3>Nice to have</h3><p>DDD, TDD</p>', industry: domain }), url);
  const { values } = await extract(fetched.sourceText);
  expect(values.skills.split('\n')).toEqual(['Java', 'Spring Boot', 'SQL']);
  expect(values.preferredSkills.split('\n')).toEqual(['DDD', 'TDD']);
  expect(values.domain).toBe(businessDomains);
});
test.each(['jsonld', 'public-semantic-field', 'public-salary-field'])('salary outside description survives fetch → provider input → canonical review/save: %s', source => {
  const salary = 'Up to 1700 USD net';
  const value = source === 'jsonld' ? { ...job, baseSalary: { '@type': 'MonetaryAmount', description: salary, currency: 'USD', value: { '@type': 'QuantitativeValue', maxValue: 1700 } } } : job;
  const fetched = parseJobPosting(html(value, source === 'public-semantic-field' ? `<span itemprop="baseSalary">${salary}</span>` : source === 'public-salary-field' ? `<div class="salary text-nowrap">${salary}</div>` : ''), url);
  expect(fetched.salary).toBe(salary);
  expect(fetched.salaryDetails).toEqual({ originalText: salary, currency: 'USD', maximum: 1700, minimum: null, basis: 'net', payPeriod: null });
  expect(fetched.sourceText).toContain(`Salary: ${salary}`);
  return extract(fetched.sourceText).then(({ output, values }) => {
    expect(values.salary).toBe(salary);
    const saved = validateOpportunity({ ...values, postText: fetched.sourceText, importReview: output.fields, source: 'Website', status: 'SAVED', description: fetched.description, notes: '', contactDates: [], followUpDate: null });
    expect(saved.salary).toBe(salary);
    expect(salaryEvidence(saved.salary)?.minimum).toBeNull();
    expect(saved.postText).toContain(salary);
  });
});
test('structured maximum preserves unknown minimum/basis/period instead of inventing defaults', () => {
  const fetched = parseJobPosting(html({ ...job, baseSalary: { currency: 'USD', value: { maxValue: 1700 } } }), url);
  expect(fetched.salaryDetails).toMatchObject({ originalText: '', currency: 'USD', minimum: null, maximum: 1700, basis: null, payPeriod: null });
  expect(fetched.sourceText).toContain('"maxValue":1700');
  expect(fetched.salary).toBe('Up to 1700 USD');
});
test('does not scan benefits, market widgets or gated salary text for salary', async () => {
  const fetched = parseJobPosting(html(job, '<div class="market-salary">Market salary: Up to 9999 USD net</div><span itemprop="baseSalary">Sign in to view salary</span><div hidden class="salary">Up to 9999 USD net</div><!-- <div class="salary">Up to 9999 USD net</div> --><script><div class="salary">Up to 9999 USD net</div></script>'), url);
  expect(fetched.salary).toBe('');
  const { values } = await extract(fetched.sourceText);
  expect(values.salary).toBe('');
  expect(salaryEvidence('Health benefits and annual bonus')).toBeNull();
});
test('different salary values remain conflicting evidence, partial numeric quotes do not remove upper bound', async () => {
  const input = 'Salary: Up to 1700 USD net';
  const result = mergeCandidates({ candidates: [
    { field: 'salary', value: 'Up to 1700 USD net', source: 'post', quote: input },
    { field: 'salary', value: '1700 USD', source: 'post', quote: input },
  ] }, input, '');
  expect(result.fields.find(field => field.field === 'salary')).toMatchObject({ value: 'Up to 1700 USD net', status: 'SUPPORTED' });
  const fetched = parseJobPosting(html({ ...job, baseSalary: 'Up to 1700 USD net' }, '<span itemprop="baseSalary">Up to 2000 USD net</span>'), url);
  expect(fetched.salary).toBe('');
  const { output } = await extract(fetched.sourceText);
  expect(output.fields.find(field => field.field === 'salary')).toMatchObject({ value: '', status: 'CONFLICT', reviewed: false });
});

test('a skill required in one section is not duplicated as preferred, and benefits are not requirements', async () => {
  const { values } = await extract('Must have\nJava\nNice to have\nJava, TDD\nBenefits\nKubernetes training\nAnnual bonus up to 1700 USD net');
  expect(values.skills).toBe('Java');
  expect(values.preferredSkills).toBe('TDD');
  expect(values.salary).toBe('');
});
test('salary periods are populated only when explicitly present', () => {
  expect(salaryEvidence('Up to 1700 USD net')?.payPeriod).toBeNull();
  expect(salaryEvidence('Up to 1700 USD net per month')?.payPeriod).toBe('month');
  expect(salaryEvidence('Up to 1700 USD net')?.currency).toBe('USD');
});

test.each(["You'll love it", 'You’ll love it'])('undisclosed header placeholder stays unknown through extraction and save: %s', placeholder => {
  const fetched = parseJobPosting(html({ ...job, baseSalary: placeholder }, `<div class="salary">${placeholder}</div>`), url);
  expect(fetched.salary).toBe('');
  expect(fetched.salaryDetails).toBeNull();
  return extract(fetched.sourceText).then(({ values }) => expect(values.salary).toBe(''));
});
test('a verbatim AI quote of the placeholder is rejected as salary', () => {
  const text = "Salary: You'll love it";
  const result = mergeCandidates({ candidates: [{ field: 'salary', value: "You'll love it", quote: text, source: 'post' }] }, text, '');
  expect(result.rejected).toBe(1);
  expect(result.fields.find(field => field.field === 'salary')).toMatchObject({ value: '', status: 'MISSING' });
});
test('lowercase currency and explicit net survive header fetch/extract/save without invented bounds or period', async () => {
  const original = 'Up to 1700 usd net';
  const fetched = parseJobPosting(html(job, `<div class="salary text-nowrap">${original}</div>`), url);
  expect(fetched.salary).toBe(original);
  expect(fetched.salaryDetails).toEqual({ originalText: original, currency: 'USD', maximum: 1700, minimum: null, basis: 'net', payPeriod: null });
  const { output, values } = await extract(fetched.sourceText);
  expect(validateOpportunity({ ...values, postText: fetched.sourceText, importReview: output.fields, source: 'Website', status: 'SAVED', description: fetched.description, notes: '', contactDates: [], followUpDate: null }).salary).toBe(original);
});
test('usable baseSalary precedes an undisclosed header, with numeric header fallback for placeholder metadata', () => {
  const known = 'Up to 1700 usd net';
  expect(parseJobPosting(html({ ...job, baseSalary: known }, '<div class="salary">You\'ll love it</div>'), url).salary).toBe(known);
  expect(parseJobPosting(html({ ...job, baseSalary: "You'll love it" }, `<div class="salary">${known}</div>`), url).salary).toBe(known);
});
test('real ranges preserve stated currency/basis, while a currency-free amount does not invent currency', () => {
  expect(salaryEvidence('1500-1700 usd gross')).toEqual({ originalText: '1500-1700 usd gross', currency: 'USD', minimum: 1500, maximum: 1700, basis: 'gross', payPeriod: null });
  expect(salaryEvidence('Up to 1700 net')).toMatchObject({ currency: null, minimum: null, maximum: 1700, basis: 'net', payPeriod: null });
});
