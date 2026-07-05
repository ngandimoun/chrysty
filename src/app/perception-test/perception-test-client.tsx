'use client';

import { useEffect, useState } from 'react';

import {
  runPerceptionRealTests,
  type PerceptionRealTestResult,
} from '@/lib/perception/test-harness';

type TestState =
  | { status: 'running'; results: PerceptionRealTestResult[] }
  | { status: 'done'; results: PerceptionRealTestResult[] }
  | { status: 'error'; results: PerceptionRealTestResult[]; error: string };

export function PerceptionTestClient() {
  const [state, setState] = useState<TestState>({ status: 'running', results: [] });

  useEffect(() => {
    let cancelled = false;

    runPerceptionRealTests()
      .then((results) => {
        if (!cancelled) {
          setState({ status: 'done', results });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            results: [],
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const payload = {
    status: state.status,
    ok: state.status === 'done' && state.results.every((result) => result.ok),
    results: state.results,
    ...(state.status === 'error' ? { error: state.error } : {}),
  };

  return (
    <main style={{ padding: 24, fontFamily: 'monospace' }}>
      <h1>Perception real tests</h1>
      <p data-testid="perception-status">{state.status}</p>
      <pre data-testid="perception-results">{JSON.stringify(payload, null, 2)}</pre>
    </main>
  );
}

