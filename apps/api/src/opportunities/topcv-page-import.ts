import { BadRequestException } from '@nestjs/common';
import { parseJobPosting, type UrlJobPreview } from './job-url-import.js';
const fail = (field = 'payload'): never => { throw new BadRequestException(`Job-page import rejected: check ${field}. Reinstall the import bookmark and retry. No job was saved.`); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
function keys(row: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(row).some(key => !allowed.includes(key))) fail('unexpected fields');
}
function textFields(row: Record<string, unknown>, allowed: string[]): void {
  keys(row, allowed);
  if (Object.values(row).some(value => typeof value !== 'string')) fail('text metadata');
}
function posting(value: unknown): Record<string, unknown> {
  const row = object(value);
  keys(row, ['@type', 'title', 'description', 'qualifications', 'skills', 'responsibilities', 'industry', 'validThrough', 'hiringOrganization', 'jobLocation', 'baseSalary', 'experienceRequirements', 'jobLocationType', 'workMode']);
  if (row['@type'] !== 'JobPosting') fail();
  for (const key of ['title', 'description', 'validThrough', 'jobLocationType', 'workMode']) if (row[key] !== undefined && typeof row[key] !== 'string') fail(`jobPosting.${key}`);
  for (const key of ['title', 'description', 'qualifications', 'skills', 'responsibilities', 'industry', 'validThrough'])
    if (row[key] !== undefined && typeof row[key] !== 'string' && !(Array.isArray(row[key]) && row[key].every((item: unknown) => typeof item === 'string'))) fail(`jobPosting.${key}`);
  if (row.hiringOrganization !== undefined) textFields(object(row.hiringOrganization), ['name']);
  if (row.jobLocation !== undefined) for (const value of [row.jobLocation].flat()) {
    const place = object(value); keys(place, ['name', 'address']);
    if (place.name !== undefined && typeof place.name !== 'string') fail('jobPosting.jobLocation.name');
    if (place.address !== undefined) {
      const address = object(place.address); keys(address, ['streetAddress', 'addressLocality', 'addressRegion', 'addressCountry']);
      for (const key of ['streetAddress', 'addressLocality', 'addressRegion']) if (address[key] !== undefined && typeof address[key] !== 'string') fail(`jobPosting.jobLocation.address.${key}`);
      if (address.addressCountry !== undefined && typeof address.addressCountry !== 'string') textFields(object(address.addressCountry), ['name']);
    }
  }
  if (row.baseSalary !== undefined && typeof row.baseSalary !== 'string') {
    const salary = object(row.baseSalary); keys(salary, ['currency', 'name', 'description', 'value']);
    for (const key of ['currency', 'name', 'description']) if (salary[key] !== undefined && typeof salary[key] !== 'string') fail(`jobPosting.baseSalary.${key}`);
    if (salary.value !== undefined) {
      const quantity = object(salary.value); keys(quantity, ['minValue', 'maxValue', 'value', 'unitText']);
      for (const [key, value] of Object.entries(quantity)) {
        const valid = key === 'unitText' ? typeof value === 'string' :
          key === 'value' && typeof value === 'string' ? value.length <= 300 :
          typeof value === 'number' && Number.isFinite(value) && value >= 0;
        if (!valid) fail(`jobPosting.baseSalary.value.${key}`);
      }
    }
  }
  if (row.experienceRequirements !== undefined && typeof row.experienceRequirements !== 'string') {
    const experience = object(row.experienceRequirements); keys(experience, ['monthsOfExperience']);
    if (experience.monthsOfExperience !== undefined && (typeof experience.monthsOfExperience !== 'number' || !Number.isFinite(experience.monthsOfExperience) || experience.monthsOfExperience < 0)) fail('jobPosting.experienceRequirements.monthsOfExperience');
  }
  return row;
}
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function importTopcvPage(input: unknown): UrlJobPreview & { experience: string; workMode: string; importWarnings: string[] } {
  let serialized: string;
  try { serialized = JSON.stringify(input); } catch { return fail(); }
  if (!serialized || Buffer.byteLength(serialized) > 64 * 1024) return fail('payload size (64 KiB maximum)');
  const body = object(input); keys(body, ['version', 'sourceUrl', 'jobPosting', 'visibleText', 'salaryText', 'workModeText']);
  if (body.version !== 1 || typeof body.sourceUrl !== 'string' || body.sourceUrl.length > 2048 ||
      typeof body.visibleText !== 'string' || body.visibleText.length > 12000 || typeof body.salaryText !== 'string' || body.salaryText.length > 300) return fail();
  if (body.workModeText !== undefined && (typeof body.workModeText !== 'string' || body.workModeText.length > 200)) return fail();
  let url: URL;
  try { url = new URL(body.sourceUrl); } catch { return fail(); }
  const topcv = ['https://topcv.vn', 'https://www.topcv.vn'].includes(url.origin);
  const vietnamworks = ['https://vietnamworks.com', 'https://www.vietnamworks.com'].includes(url.origin);
  if ((!topcv && !vietnamworks) || url.username || url.password || url.search || url.hash ||
      !(topcv ? /^\/viec-lam\/[^/]+\/\d+\.html$/u.test(url.pathname) : /^\/[^/]+-\d+-jv$/u.test(url.pathname))) return fail('sourceUrl (public supported job URL)');
  const job: Record<string, unknown> = body.jobPosting === null ? { '@type': 'JobPosting' } : { ...posting(body.jobPosting) };
  if (typeof job.description !== 'string' || !job.description.trim()) job.description = escapeHtml(body.visibleText).replace(/\n/g, '<br>');
  if (!(job.description as string).trim()) throw new BadRequestException('No JD content found in the open page. Use manual import instead.');
  const importWarnings: string[] = [];
  const supplementalSkills = vietnamworks ? job.skills : undefined;
  if (vietnamworks) delete job.skills; // Taxonomy/search tags are not qualifications.
  const rawSalary = job.baseSalary;
  const salaryObject = rawSalary && typeof rawSalary === 'object' ? rawSalary as Record<string, unknown> : null;
  const quantity = salaryObject?.value && typeof salaryObject.value === 'object' ? salaryObject.value as Record<string, unknown> : null;
  const undisclosed = [body.salaryText, typeof rawSalary === 'string' ? rawSalary : '', salaryObject?.description, quantity?.value].find(value =>
    typeof value === 'string' && /^(?:thương lượng|thỏa thuận|thoả thuận|negotiable)$/iu.test(value.trim()));
  if (vietnamworks && undisclosed) {
    delete job.baseSalary;
    importWarnings.push('Salary is negotiable; numeric amount, currency and period are unknown. Inconsistent salary placeholders were ignored.');
  }
  const visibleHasRequirements = /(?:^|\n)\s*(?:Yêu cầu công việc|Job Requirements|Requirements|Qualifications)\s*[:：]?\s*(?:\n|$)/iu.test(body.visibleText);
  if (vietnamworks && visibleHasRequirements) {
    // Visible semantic sections are ordered by the source DOM. They supersede a
    // partial JSON-LD description; retain structured-only content below if needed.
    const prior = parseJobPosting(`<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', description: job.description }).replace(/</g, '\\u003c')}</script>`, body.sourceUrl).description;
    const normalizeText = (value: string) => value.replace(/\s+/g, ' ').toLowerCase().trim();
    job.description = escapeHtml(body.visibleText).replace(/\n/g, '<br>');
    // Only add structured sections not already present in visible job content.
    for (const key of ['qualifications', 'responsibilities']) {
      const raw = job[key];
      if (typeof raw === 'string' && normalizeText(body.visibleText).includes(normalizeText(raw.replace(/<[^>]*>/g, ' ')))) delete job[key];
    }
    if (prior && !normalizeText(body.visibleText).includes(normalizeText(prior)))
      job.description += `<h3>Additional structured JD evidence</h3><p>${escapeHtml(prior).replace(/\n/g, '<br>')}</p>`;
  }
  const html = `<script type="application/ld+json">${JSON.stringify(job).replace(/</g, '\\u003c')}</script><div class="salary">${escapeHtml(vietnamworks && undisclosed ? '' : body.salaryText)}</div>`;
  const preview = parseJobPosting(html, body.sourceUrl);
  const requirement = job.experienceRequirements;
  const experience = typeof requirement === 'string' ? requirement : requirement && typeof requirement === 'object' && typeof (requirement as { monthsOfExperience?: unknown }).monthsOfExperience === 'number' ? `${(requirement as { monthsOfExperience: number }).monthsOfExperience} months` : '';
  const modeValues = [job.jobLocationType === 'TELECOMMUTE' ? 'Remote' : '', job.workMode, body.workModeText].filter((value): value is string => typeof value === 'string' && /^(?:on[- ]?site|remote|hybrid|tại văn phòng|làm việc tại văn phòng|từ xa|kết hợp)$/iu.test(value));
  const mode = (value: string) => /remote|từ xa/iu.test(value) ? 'Remote' : /hybrid|kết hợp/iu.test(value) ? 'Hybrid' : 'Onsite';
  const modes = [...new Set(modeValues.map(mode))];
  const workMode = modes.length === 1 ? modes[0]! : '';
  if (vietnamworks && !/(?:^|\n)\s*(?:Yêu cầu công việc|Job Requirements|Requirements|Qualifications)\s*[:：]?\s*(?:\n|$)/iu.test(preview.description)) importWarnings.push('Requirements section was not captured or could not be identified. The JD may be incomplete; check the source page before extraction or saving.');
  const sourceText = [preview.sourceText, supplementalSkills && `Supplemental skill tags (not requirements): ${JSON.stringify(supplementalSkills)}`, vietnamworks && undisclosed && `Salary disclosure: ${undisclosed} (Negotiable; amount unknown)`, vietnamworks && undisclosed && `Ignored salary placeholders (not compensation): ${JSON.stringify(rawSalary)}`, ...modeValues.map(value => `Work mode: ${value}`), job.jobLocationType === 'TELECOMMUTE' && 'Work mode metadata: {"jobLocationType":"TELECOMMUTE"}', experience && `Experience: ${experience}`, requirement && `Experience metadata: ${JSON.stringify(requirement)}`, preview.validThrough && `Listing expires: ${preview.validThrough}`].filter(Boolean).join('\n');
  if (sourceText.length > 12000) throw new BadRequestException('Imported JD exceeds the paste limit. Your existing inputs are unchanged; use manual import.');
  return { ...preview, sourceText, experience, workMode, importWarnings };
}
