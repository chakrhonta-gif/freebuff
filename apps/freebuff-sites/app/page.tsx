'use client';

import { useState } from 'react';

type Mode = 'plan' | 'implement';

type RunResult = {
  id: string | null;
  mode: Mode;
  result: string;
};

function isImplementationMode(mode: Mode) {
  return mode === 'implement';
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('plan');
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [error, setError] = useState('');

  async function submit(nextMode: Mode) {
    const request = task.trim();
    if (request.length < 10) {
      setError('Describe the task in at least 10 characters.');
      return;
    }

    if (isImplementationMode(nextMode) && !confirmed) {
      setError('Tick the confirmation box before generating an implementation draft.');
      return;
    }

    setBusy(true);
    setError('');
    setRun(null);

    try {
      const response = await fetch('/api/freebuff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: nextMode,
          task: request,
          context: context.trim(),
          confirmed: nextMode === 'implement' ? true : undefined,
        }),
      });

      const payload = (await response.json()) as RunResult & { error?: string };
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'Freebuff could not complete this request.');
      }

      setRun({
        id: payload.id || null,
        mode: payload.mode,
        result: payload.result,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Freebuff could not complete this request.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Freebuff home">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>Freebuff</span>
        </a>
        <span className="status-pill">Private coding workspace</span>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">OpenAI-powered coding assistant</p>
          <h1>Plan safely. Generate the next change with clarity.</h1>
          <p className="lead">
            Give Freebuff a coding task and the relevant project context. Start
            with a plan, then explicitly confirm before you ask for an
            implementation draft.
          </p>
        </div>
        <aside className="safety-card">
          <strong>Safe by default</strong>
          <span>
            This hosted MVP never writes to a repository or your computer.
            It returns a reviewable plan or change proposal.
          </span>
        </aside>
      </section>

      <section className="workspace" aria-label="Freebuff task workspace">
        <div className="mode-switch" role="tablist" aria-label="Run mode">
          <button
            className={mode === 'plan' ? 'mode active' : 'mode'}
            onClick={() => {
              setMode('plan');
              setError('');
            }}
            role="tab"
            aria-selected={mode === 'plan'}
            type="button"
          >
            Plan
          </button>
          <button
            className={mode === 'implement' ? 'mode active' : 'mode'}
            onClick={() => {
              setMode('implement');
              setError('');
            }}
            role="tab"
            aria-selected={mode === 'implement'}
            type="button"
          >
            Implementation draft
          </button>
        </div>

        <label className="field">
          <span>What do you want to build or change?</span>
          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Example: Add a responsive project dashboard with a searchable task list."
            rows={5}
            maxLength={6000}
          />
        </label>

        <label className="field">
          <span>
            Relevant files or project context <em>(optional)</em>
          </span>
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Paste selected files, error messages, constraints, or the current architecture."
            rows={8}
            maxLength={20000}
          />
        </label>

        {mode === 'implement' ? (
          <label className="confirmation">
            <input
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>
              I understand this creates a proposed implementation for review; it
              will not change any files automatically.
            </span>
          </label>
        ) : null}

        <div className="actions">
          <button
            className="primary-action"
            disabled={busy}
            onClick={() => submit(mode)}
            type="button"
          >
            {busy
              ? 'Freebuff is working…'
              : mode === 'plan'
                ? 'Create a plan'
                : 'Generate implementation draft'}
          </button>
          <button
            className="secondary-action"
            disabled={busy}
            onClick={() => {
              setTask(
                'Review this feature request and identify the smallest safe implementation plan.',
              );
              setContext('');
              setMode('plan');
              setConfirmed(false);
              setError('');
              setRun(null);
            }}
            type="button"
          >
            Use example
          </button>
        </div>

        {error ? <p className="error-message">{error}</p> : null}
      </section>

      {run ? (
        <section className="result-card" aria-live="polite">
          <div className="result-header">
            <div>
              <p className="eyebrow">Freebuff result</p>
              <h2>
                {run.mode === 'plan'
                  ? 'Implementation plan'
                  : 'Implementation draft'}
              </h2>
            </div>
            <span className="result-mode">{run.mode}</span>
          </div>
          <pre>{run.result}</pre>
        </section>
      ) : (
        <section className="empty-result">
          <span className="empty-icon" aria-hidden="true">
            {'</>'}
          </span>
          <div>
            <strong>Your result will appear here.</strong>
            <p>
              Start with Plan. When the plan looks right, choose Implementation
              draft and review the generated changes.
            </p>
          </div>
        </section>
      )}

      <footer>
        Freebuff Site MVP · Your API key stays on the server and is never sent
        to the browser.
      </footer>
    </main>
  );
}
