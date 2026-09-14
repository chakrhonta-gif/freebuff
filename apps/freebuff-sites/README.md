# Freebuff Sites app

This package is the hosted Freebuff control panel for ChatGPT Sites.

## What it does

- Lets the owner launch a Codebuff plan against the configured GitHub repository.
- Runs Codebuff inside an isolated GitHub Actions workspace.
- Keeps plan runs read-only.
- Requires an explicit confirmation before an implementation run.
- Turns implementation changes into a new pull request; it never writes to `main`.
- Blocks runner changes under `.github/` and obvious secret-file paths before the pull request is created.

## Required configuration

Keep all values in their intended secret store. Never put them in browser code, prompts, or committed files.

### GitHub repository Actions secret

In `chakrhonta-gif/freebuff` add this Actions secret:

- `CODEBUFF_API_KEY`: the Codebuff key used by the runner.

### Sites secrets

In the Freebuff Site settings add:

- `FREEBUFF_GITHUB_TOKEN`: a fine-grained GitHub token limited to
  `chakrhonta-gif/freebuff` with only the permission needed to dispatch
  `freebuff-runner.yml` (Actions: read and write).

Optional non-secret values:

- `FREEBUFF_REPOSITORY`: defaults to `chakrhonta-gif/freebuff`.
- `FREEBUFF_WORKFLOW`: defaults to `freebuff-runner.yml`.

The existing `CODEBUFF_API_KEY` Site secret is not used by this design. Remove
it from Sites after the GitHub Actions secret has been added.

## Safety model

The Site token can only start the fixed repository workflow. Codebuff runs in a
job that has read-only repository permissions. A separate job receives the
generated patch, rejects sensitive paths, and is the only job allowed to create
a reviewable pull request.

## Local development

    cd apps/freebuff-sites
    npm install
    cp .env.example .env
    npm run dev

Run validation:

    npm run typecheck
    npm run build
