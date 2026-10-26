import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { ExtractionResult } from '../../src/extraction/extraction.types.js';
import { LOCAL_ENV } from './live-plan.js';
import { errorCode, LiveError } from './live-errors.js';
import type { LiveBoundary } from './live-run.js';

// One process owns Nest, parser threads and provider sockets. The parent never
// instantiates a provider and discards child stdout/stderr, including diagnostics.
export function startLocalBoundary(): LiveBoundary {
  const env: NodeJS.ProcessEnv = { ...process.env, ...LOCAL_ENV };
  delete env.NODE_OPTIONS;
  const child = fork(
    new URL('./live-child.js', import.meta.url),
    ['--allow-local-ollama'],
    { env, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  );
  return supervise(child);
}
export function supervise(
  child: ChildProcess,
  cleanupGraceMs = 5000,
): LiveBoundary {
  let pending: {
    resolve: (result: ExtractionResult) => void;
    reject: (error: LiveError) => void;
  } | null = null;
  let closing = false;
  let exited = false;
  let cleanupFailed = false;
  let currentId: string | null = null;
  let readyResolve!: () => void;
  let readyReject!: (error: LiveError) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  void ready.catch(() => {});
  const startup = setTimeout(() => {
    readyReject(new LiveError('SETUP_FAILURE'));
    child.kill('SIGKILL');
  }, 10000);
  const exit = new Promise<void>((resolve) => {
    const finish = (code: number | null) => {
      if (exited) return;
      if (code !== 0) cleanupFailed = true;
      exited = true;
      clearTimeout(startup);
      readyReject(new LiveError('CHILD_EXIT'));
      pending?.reject(new LiveError('CHILD_EXIT'));
      pending = null;
      resolve();
    };
    child.once('exit', finish);
    // Failed spawn emits error/close without exit.
    child.once('close', finish);
  });
  child.on('error', () => {
    readyReject(new LiveError('SETUP_FAILURE'));
    pending?.reject(new LiveError('CHILD_EXIT'));
  });
  child.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return;
    if (message.type === 'ready') {
      clearTimeout(startup);
      readyResolve();
    }
    if (message.type === 'error' && 'code' in message) {
      const failure = new LiveError(errorCode(message));
      if (failure.code === 'CLEANUP_FAILURE') cleanupFailed = true;
      readyReject(failure);
      pending?.reject(failure);
      pending = null;
    }
    if (
      message.type === 'result' &&
      'id' in message &&
      message.id === currentId &&
      'result' in message
    ) {
      pending?.resolve(message.result as ExtractionResult);
      pending = null;
    }
  });
  function send(message: { type: 'extract'; id: string } | { type: 'close' }) {
    if (!child.connected || exited) throw new LiveError('CHILD_EXIT');
    child.send(message, (error) => {
      if (error) pending?.reject(new LiveError('CHILD_EXIT'));
    });
  }
  return {
    async extract(documentId, signal) {
      if (pending || closing) throw new LiveError('EXTRACTION_BUSY');
      const abort = () => {
        const failure = new LiveError(errorCode(signal.reason));
        readyReject(failure);
        pending?.reject(failure);
        child.kill('SIGKILL');
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        if (signal.aborted) {
          abort();
          throw new LiveError(errorCode(signal.reason));
        }
        await ready;
        if (signal.aborted) throw new LiveError(errorCode(signal.reason));
        currentId = documentId;
        return await new Promise<ExtractionResult>((resolve, reject) => {
          pending = { resolve, reject };
          try {
            send({ type: 'extract', id: documentId });
          } catch {
            pending = null;
            reject(new LiveError('CHILD_EXIT'));
          }
        });
      } finally {
        signal.removeEventListener('abort', abort);
        pending = null;
      }
    },
    async close(signal) {
      closing = true;
      clearTimeout(startup);
      if (exited) {
        if (cleanupFailed && !signal?.aborted)
          throw new LiveError('CLEANUP_FAILURE');
        return;
      }
      let forced = false;
      const kill = () => {
        forced = true;
        child.kill('SIGKILL');
      };
      const grace = setTimeout(kill, cleanupGraceMs);
      signal?.addEventListener('abort', kill, { once: true });
      try {
        if (signal?.aborted) kill();
        else {
          try {
            send({ type: 'close' });
          } catch {
            kill();
          }
        }
        await exit;
        if ((forced || cleanupFailed) && !signal?.aborted)
          throw new LiveError('CLEANUP_FAILURE');
      } finally {
        clearTimeout(grace);
        signal?.removeEventListener('abort', kill);
      }
    },
  };
}
