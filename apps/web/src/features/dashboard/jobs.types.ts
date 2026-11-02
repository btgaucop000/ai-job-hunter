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
  sourceUrl: string;
  fetchedAt: string;
  jobs: PublicJob[];
  omittedCount: number;
  scope: string;
}
