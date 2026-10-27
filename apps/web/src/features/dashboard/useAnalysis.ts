import { useEffect, useRef, useState } from 'react';
import { analyze, AnalysisClientError } from './analysis-api';
import type { AnalysisResponse } from './analysis.types';
export type AnalysisState =
  | { status: 'idle' | 'processing' | 'cancelled' }
  | {
      status: 'completed';
      response: Extract<AnalysisResponse, { outcome: 'COMPLETED' }>;
    }
  | {
      status: 'incomplete';
      response: Extract<AnalysisResponse, { outcome: 'INCOMPLETE' }>;
    }
  | { status: 'clientError'; kind: 'network' | 'malformed' };
export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const invalidate = () => {
    generation.current++;
    const previous = active.current;
    active.current = null;
    previous?.abort();
  };
  useEffect(
    () => () => {
      generation.current++;
      const previous = active.current;
      active.current = null;
      previous?.abort();
    },
    [],
  );
  const start = async (file: File, jdText: string) => {
    if (active.current) return;
    const id = ++generation.current;
    const controller = new AbortController();
    active.current = controller;
    setState({ status: 'processing' });
    try {
      const response = await analyze(file, jdText, controller.signal);
      if (id !== generation.current) return;
      setState(
        response.outcome === 'COMPLETED'
          ? { status: 'completed', response }
          : { status: 'incomplete', response },
      );
    } catch (error: unknown) {
      if (id !== generation.current) return;
      setState({
        status: 'clientError',
        kind: error instanceof AnalysisClientError ? error.kind : 'network',
      });
    } finally {
      if (id === generation.current) active.current = null;
    }
  };
  return {
    state,
    start,
    cancel: () => {
      invalidate();
      setState({ status: 'cancelled' });
    },
    reset: () => {
      invalidate();
      setState({ status: 'idle' });
    },
  };
}
