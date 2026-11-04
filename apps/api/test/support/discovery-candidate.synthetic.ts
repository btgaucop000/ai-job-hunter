import type { DiscoveredJob } from '../../src/discovery/discovery.js';
export function candidateSnapshot(): DiscoveredJob {
  return {
    title: 'Synthetic Java engineer',
    company: 'Synthetic Company',
    location: 'Vietnam',
    workMode: '',
    seniority: '',
    skills: 'Java',
    preferredSkills: '',
    description: 'Synthetic public job description.',
    originalLink: 'https://boards.greenhouse.io/synthetic/jobs/123',
    discovery: {
      sourceName: 'Synthetic board',
      sourceJobId: '123',
      sourceUrl:
        'https://boards-api.greenhouse.io/v1/boards/synthetic/jobs?content=true',
      discoveredAt: '2026-11-03T00:00:00.000Z',
      techStack: ['Java'],
      requirementSkills: { required: 'Java', preferred: '' },
    },
  };
}
