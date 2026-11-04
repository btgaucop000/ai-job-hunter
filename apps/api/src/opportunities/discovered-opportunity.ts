import type { DiscoveredJob } from '../discovery/discovery.js';
import { discoverySourceKey } from '../discovery/greenhouse.source.js';
import { duplicateJob, normalizedUrl } from '../discovery/discovery.js';
import { DiscoveryConflict } from '../discovery/discovery-conflict.js';
import type { Opportunity } from './opportunity.entity.js';
import { validateOpportunity } from './opportunity.validation.js';

export function discoveredOpportunityFields(job: DiscoveredJob) {
  return validateOpportunity({
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: job.workMode,
    seniority: job.seniority,
    skills: job.skills,
    preferredSkills: job.preferredSkills,
    description: job.description,
    originalLink: job.originalLink,
    source: 'Website',
    status: 'SAVED',
    contactNotes: '',
    notes: '',
    contactDates: [],
    followUpDate: null,
  });
}
export function matchDiscoveredOpportunity(
  job: DiscoveredJob,
  sourceKey: string,
  existing: Opportunity[],
  confirmSeparate: boolean,
): Opportunity | null {
  const url = normalizedUrl(job.originalLink);
  // Union of exact matches: conflicting source and URL identities are ambiguous.
  const exact = existing.filter(
    (row) =>
      (row.discovery &&
        discoverySourceKey(row.discovery) === sourceKey &&
        row.discovery.sourceJobId === job.discovery.sourceJobId) ||
      (url && normalizedUrl(row.originalLink) === url),
  );
  const safe = (rows: Opportunity[]) =>
    rows.slice(0, 20).map(({ id, title, company, location }) => ({
      id,
      title,
      company,
      location,
    }));
  if (exact.length > 1)
    throw new DiscoveryConflict(
      'AMBIGUOUS_INBOX_MATCH',
      'Multiple Inbox jobs match this listing. Review the existing jobs; no changes were saved.',
      safe(exact),
    );
  if (exact.length === 1) return exact[0]!;
  const possible = existing.filter((row) =>
    duplicateJob(job, { ...row, discovery: null, originalLink: '' }),
  );
  if (possible.length && !confirmSeparate)
    throw new DiscoveryConflict(
      'POSSIBLE_DUPLICATE',
      'Similar Inbox jobs exist. Review them, or explicitly confirm creating a separate job.',
      safe(possible),
    );
  return null;
}
