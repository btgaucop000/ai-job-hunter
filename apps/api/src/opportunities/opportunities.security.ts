import { localAnalysisSecurity } from '../analysis/analysis-security.js';
import type { AnalysisSecurity } from '../analysis/analysis-security.js';

// Explicit development aliases only. Keep duplicate/missing-header checks and
// reject null origins, LAN/forwarded hosts and arbitrary localhost ports.
export function localOpportunitySecurity(port: number): AnalysisSecurity {
  const security = localAnalysisSecurity(port);
  return {
    hosts: [...security.hosts, `localhost:${port}`, 'localhost:5173'],
    origins: [
      ...security.origins,
      `http://localhost:${port}`,
      'http://localhost:5173',
    ],
  };
}
