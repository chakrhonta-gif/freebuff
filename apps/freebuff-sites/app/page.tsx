'use client';

import { useState } from 'react';

type Mode = 'plan' | 'implement';

type RunResult = {
  mode: Mode;
  status: 'queued';
  requestId: string;
  workflowUrl: string;
  message: string;
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
      setError('Tick the confirmation box before starting the implementation run.');
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
        throw new Error(payload.error || 'Freebuff could not start this request.');
      }

      setRun(payload);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Freebuff could not start this request.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Freebuff home">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>Freebuff</span>
        </a>
        <span className="status-pill">Private repository runner</span>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Codebuff + GitHub Actions</p>
          <h1>Run Freebuff on your repository, safely.</h1>
          <p className="lead">
            Start with a read-only plan. For an implementation, Freebuff works
            in an isolated GitHub runner and opens a pull request for review.
          </p>
        </div>
        <aside className="safety-card">
          <strong>Safe by default</strong>
          <span>
            Plans cannot write to the repository. Implementations never push to
            main: they create a separate pull request.
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
            Implement to PR
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
          <span>Constraints or extra context <em>(optional)</em></span>
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Describe expected behavior, relevant paths, error messages, or constraints."
            rows={8}
            maxLength={18000}
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
              I understand that Freebuff will work in an isolated runner and
              create a pull request for my review. It will not push to main.
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
              ? 'Starting Freebuff…'
              : mode === 'plan'
                ? 'Run a read-only plan'
                : 'Run Freebuff and create a PR'}
          </button>
          <button
            className="secondary-action"
            disabled={busy}
            onClick={() => {
              setTask('Review this feature request and identify the smallest safe implementation plan.');
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
              <p className="eyebrow">Freebuff run queued</p>
              <h2>{run.mode === 'plan' ? 'Read-only plan' : 'Implementation to pull request'}</h2>
            </div>
            <span className="result-mode">{run.mode}</span>
          </div>
          <div className="queued-result">
            <p>{run.message}</p>
            <a className="run-link" href={run.workflowUrl} rel="noreferrer" target="_blank">
              Open GitHub Actions
            </a>
            <code>Request: {run.requestId}</code>
          </div>
        </section>
      ) : (
        <section className="empty-result">
          <span className="empty-icon" aria-hidden="true">{'</>'}</span>
          <div>
            <strong>Your run will appear here.</strong>
            <p>
              Start with Plan. When it looks right, choose Implement to PR and
              review the new pull request before merging it.
            </p>
          </div>
        </section>
      )}

      <footer>
        Freebuff runs Codebuff in GitHub Actions. Secrets stay server-side and
        are never sent to the browser.
      </footer>
    </main>
  );
}
