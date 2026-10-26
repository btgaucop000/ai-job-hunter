import { Injectable } from '@nestjs/common';
import { matchExtractions } from './matching.js';
import type { MatchingInput, MatchingResult } from './matching.types.js';

@Injectable()
export class MatchingService {
  match(input: MatchingInput): MatchingResult {
    return matchExtractions(input);
  }
}
