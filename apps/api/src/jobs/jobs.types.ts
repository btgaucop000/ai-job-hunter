export interface PublicJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean | null;
  source: 'Arbeitnow';
  url: string;
  publishedAt: string | null;
  tags: string[];
  description: string;
}
export interface JobsResponse {
  source: 'Arbeitnow';
  sourceUrl: 'https://www.arbeitnow.com/api/job-board-api';
  fetchedAt: string;
  jobs: PublicJob[];
  omittedCount: number;
  scope: 'Latest feed page; primarily Germany/Europe. Not an exhaustive search.';
}
