import { ConflictException } from '@nestjs/common';
export interface CandidateMatch {
  id: string;
  title: string;
  company: string;
  location: string;
}
export class DiscoveryConflict extends ConflictException {
  constructor(
    readonly errorCode: string,
    message: string,
    readonly matches: CandidateMatch[] = [],
  ) {
    super(message);
  }
}
