type Mode = 'plan' | 'implement';

type JsonRecord = Record<string, unknown>;

const MAX_TASK_LENGTH = 6000;
const MAX_CONTEXT_LENGTH = 18000;
const DEFAULT_REPOSITORY = 'chakrhonta-gif/freebuff';
const DEFAULT_WORKFLOW = 'freebuff-runner.yml';

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function json(body: JsonRecord, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function repositoryFromEnvironment() {
  const repository =
    asText(process.env.FREEBUFF_REPOSITORY, 180) || DEFAULT_REPOSITORY;
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? repository
    : DEFAULT_REPOSITORY;
}

function workflowFromEnvironment() {
  const workflow =
    asText(process.env.FREEBUFF_WORKFLOW, 160) || DEFAULT_WORKFLOW;
  return /^[A-Za-z0-9_.-]+\.ya?ml$/.test(workflow)
    ? workflow
    : DEFAULT_WORKFLOW;
}

export async function POST(request: Request) {
  let body: JsonRecord;
  try {
    body = asRecord(await request.json());
  } catch {
    return json({ error: 'Send a valid JSON request.' }, 400);
  }

  const mode =
    body.mode === 'implement'
      ? 'implement'
      : body.mode === 'plan'
        ? 'plan'
        : null;
  const task = asText(body.task, MAX_TASK_LENGTH);
  const context = asText(body.context, MAX_CONTEXT_LENGTH);

  if (!mode) return json({ error: 'Choose plan or implementation mode.' }, 400);
  if (task.length < 10) {
    return json({ error: 'Describe the task in at least 10 characters.' }, 400);
  }
  if (mode === 'implement' && body.confirmed !== true) {
    return json(
      {
        error:
          'Explicit confirmation is required before starting an implementation run.',
      },
      409,
    );
  }

  const token = asText(process.env.FREEBUFF_GITHUB_TOKEN, 500);
  if (!token) {
    return json(
      {
        error:
          'Freebuff is not configured yet. Add FREEBUFF_GITHUB_TOKEN as a Site secret.',
      },
      503,
    );
  }

  const repository = repositoryFromEnvironment();
  const workflow = workflowFromEnvironment();
  const requestId = crypto.randomUUID();
  const workflowUrl =
    'https://github.com/' + repository + '/actions/workflows/' + workflow;

  let upstream: Response;
  try {
    upstream = await fetch(
      'https://api.github.com/repos/' +
        repository +
        '/actions/workflows/' +
        workflow +
        '/dispatches',
      {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            mode,
            task,
            context,
            request_id: requestId,
          },
        }),
      },
    );
  } catch {
    return json(
      {
        error:
          'Could not reach GitHub. Check the Site network and token configuration.',
      },
      502,
    );
  }

  if (!upstream.ok) {
    const status = upstream.status === 401 || upstream.status === 403 ? 503 : 502;
    return json(
      {
        error:
          upstream.status === 401 || upstream.status === 403
            ? 'GitHub rejected the runner token. Check FREEBUFF_GITHUB_TOKEN permissions.'
            : 'GitHub could not start the Freebuff runner. Try again shortly.',
      },
      status,
    );
  }

  return json({
    status: 'queued',
    mode,
    requestId,
    workflowUrl,
    message:
      mode === 'plan'
        ? 'Plan run queued. Open the GitHub Actions run when it starts.'
        : 'Implementation run queued. Freebuff will open a pull request instead of changing main.',
  });
}

export function GET() {
  return json({ ok: true, service: 'freebuff-sites-runner' });
}
