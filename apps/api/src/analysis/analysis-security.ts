import type { IncomingMessage } from 'node:http';
import { AnalysisError } from './analysis.errors.js';

export interface AnalysisSecurity {
  readonly hosts: readonly string[];
  readonly origins: readonly string[];
}
export function localAnalysisSecurity(port: number): AnalysisSecurity {
  return {
    hosts: [`127.0.0.1:${port}`, '127.0.0.1:5173'],
    origins: [`http://127.0.0.1:${port}`, 'http://127.0.0.1:5173'],
  };
}
export function checkAnalysisSecurity(
  req: IncomingMessage,
  config: AnalysisSecurity,
): void {
  // rawHeaders prevents Node's duplicate-header normalization hiding ambiguity.
  for (const name of ['host', 'origin']) {
    let count = 0;
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      if (req.rawHeaders[i]!.toLowerCase() === name) count++;
    if (count !== 1) throw new AnalysisError('LOCAL_REQUEST_DENIED');
  }
  if (
    typeof req.headers.host !== 'string' ||
    !config.hosts.includes(req.headers.host) ||
    typeof req.headers.origin !== 'string' ||
    !config.origins.includes(req.headers.origin)
  )
    throw new AnalysisError('LOCAL_REQUEST_DENIED');
}
