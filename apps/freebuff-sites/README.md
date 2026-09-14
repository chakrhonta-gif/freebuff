# Freebuff Sites app

This package is the hosted Freebuff MVP for ChatGPT Sites.

## What it does

- Provides a responsive browser workspace for coding tasks.
- Uses the OpenAI Responses API from a server-side route.
- Keeps the OpenAI key out of browser code.
- Produces a plan first.
- Requires an explicit confirmation before it produces an implementation draft.
- Does not write to GitHub, a local computer, or a repository.

The local MCP bridge remains at apps/freebuff-chatgpt. This hosted package intentionally has a narrower safety scope: it generates reviewable plans and code proposals from the task and context that the user supplies.

## Runtime configuration

Set these values in Sites settings, not in source code:

- OPENAI_API_KEY: required secret for live AI runs.
- OPENAI_MODEL: optional model override. Defaults to gpt-5.5.

Never put a real key in a prompt, a committed file, or client-side code.

## Local development

    cd apps/freebuff-sites
    npm install
    cp .env.example .env
    npm run dev

Run validation:

    npm run typecheck
    npm run build

## Future extension

To let a hosted app inspect or write a GitHub repository, add a separate, least-privilege OAuth or GitHub App flow. Do not add a personal token to browser storage or commit it to this repository.
