import { randomUUID } from 'node:crypto';
import type { scoreCvMatch } from './cv-match.js';

export type Immutable<T> = T extends object
  ? { readonly [K in keyof T]: Immutable<T[K]> }
  : T;
export type SavedCvAssessment = Immutable<ReturnType<typeof scoreCvMatch>>;
export interface SourceRevisions {
  readonly cvUpdatedAt: string;
  readonly jobUpdatedAt: string;
}
export interface MatchSnapshot extends SourceRevisions {
  readonly matchId: string;
  readonly ownerId: string;
  readonly jobId: string;
  readonly assessment: SavedCvAssessment;
}
export function immutableValue<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutableValue(child);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}
export class MatchContextError extends Error {
  constructor() {
    super('Match context is unavailable or stale. Reanalyze CV Match.');
  }
}

// Only assessment excerpts are retained, never a second complete source document.
export class MatchContexts {
  private readonly entries = new Map<
    string,
    { snapshot: MatchSnapshot; expiresAt: number }
  >();
  constructor(private readonly now: () => number = () => performance.now()) {}

  private prune(): void {
    for (const [id, entry] of this.entries)
      if (entry.expiresAt <= this.now()) this.entries.delete(id);
  }
  create(
    ownerId: string,
    jobId: string,
    revisions: SourceRevisions,
    assessment: SavedCvAssessment,
  ): MatchSnapshot {
    this.prune();
    for (const [id, { snapshot }] of this.entries)
      if (snapshot.ownerId === ownerId && snapshot.jobId === jobId)
        this.entries.delete(id);
    while (this.entries.size >= 20)
      this.entries.delete(this.entries.keys().next().value!);
    const snapshot = immutableValue({
      matchId: randomUUID(),
      ownerId,
      jobId,
      ...revisions,
      assessment: structuredClone(assessment),
    });
    this.entries.set(snapshot.matchId, {
      snapshot,
      expiresAt: this.now() + 15 * 60 * 1000,
    });
    return snapshot;
  }
  require(
    matchId: string,
    ownerId: string,
    jobId: string,
    revisions: SourceRevisions,
  ): MatchSnapshot {
    this.prune();
    const snapshot = this.entries.get(matchId)?.snapshot;
    if (
      !snapshot ||
      snapshot.ownerId !== ownerId ||
      snapshot.jobId !== jobId ||
      snapshot.cvUpdatedAt !== revisions.cvUpdatedAt ||
      snapshot.jobUpdatedAt !== revisions.jobUpdatedAt
    )
      throw new MatchContextError();
    return snapshot;
  }
}
