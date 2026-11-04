import { BadRequestException } from '@nestjs/common';
import type { DiscoveryCandidate } from './discovery-candidate.entity.js';
import { DiscoveryConflict } from './discovery-conflict.js';
export function validateReviewStatus(value: unknown): 'SEEN' | 'DISMISSED' {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Choose SEEN or DISMISSED.');
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== 1 ||
    typeof row.status !== 'string' ||
    !['SEEN', 'DISMISSED'].includes(row.status)
  )
    throw new BadRequestException('Choose SEEN or DISMISSED.');
  return row.status as 'SEEN' | 'DISMISSED';
}
export function validateSaveConfirmation(value: unknown): boolean {
  if (value === undefined) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid Save request.');
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).some((key) => key !== 'confirmSeparate') ||
    (Object.hasOwn(row, 'confirmSeparate') &&
      typeof row.confirmSeparate !== 'boolean')
  )
    throw new BadRequestException(
      'Only an explicit separate-job confirmation is accepted.',
    );
  return row.confirmSeparate === true;
}
export function assertReviewTransition(
  current: DiscoveryCandidate['status'],
  next: 'SEEN' | 'DISMISSED',
) {
  if (
    current === next ||
    current === 'NEW' ||
    (current === 'SEEN' && next === 'DISMISSED')
  )
    return;
  throw new DiscoveryConflict(
    'INVALID_REVIEW_TRANSITION',
    'This candidate cannot move to that review state. Reload the queue.',
  );
}
