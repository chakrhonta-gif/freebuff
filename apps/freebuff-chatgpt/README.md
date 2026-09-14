# Freebuff ChatGPT App

This is a self-hosted, single-user MCP Apps bridge that lets ChatGPT plan and run Freebuff coding tasks against one local workspace.

It adds an interactive card inside ChatGPT, keeps plan-only runs from changing files, and requires an explicit confirmed flag before an implementation run can modify the workspace.

## What it includes

- A Streamable HTTP MCP endpoint at /mcp.
- A native ChatGPT widget using the MCP Apps bridge.
- A read-only workspace readiness check.
- A plan tool that blocks file writes, patches, and terminal commands.
- An implementation tool that requires confirmed=true and declares a destructive action.
- Short, redacted task summaries rather than full agent traces.
- In-memory task sessions for follow-up plans while the local process stays up.

The server deliberately binds to 127.0.0.1 by default. It is not a multi-user hosted service and does not implement OAuth or durable task storage.

## Install

Use Node 22 or later.

~~~bash
cd apps/freebuff-chatgpt
npm install
cp .env.example .env
npm run dev
~~~

The default workspace is the root of this Freebuff checkout. To target another checked-out project, set FREEBUFF_WORKSPACE_ROOT before starting the server.

PowerShell example:

~~~powershell
cd apps\freebuff-chatgpt
npm install
$env:FREEBUFF_WORKSPACE_ROOT = "C:\path\to\your\project"
$env:FREEBUFF_BYOK_API_KEY = "your_api_key"
$env:FREEBUFF_BYOK_MODEL = "gpt-5.6"
npm run dev
~~~

## Configure the runner

Set CODEBUFF_API_KEY in your shell or local .env file before starting the server. The published Codebuff SDK uses this credential to run the agent.

A ChatGPT Plus subscription is separate from a Codebuff API key. This local bridge does not send your ChatGPT account token to Freebuff.

## Check locally

Open this URL after starting the server:

~~~text
http://127.0.0.1:8787/healthz
~~~

For protocol-level testing:

~~~bash
npx @modelcontextprotocol/inspector
~~~

Choose Streamable HTTP and enter:

~~~text
http://127.0.0.1:8787/mcp
~~~

Then run:

~~~bash
npm run typecheck
~~~

## Connect it to ChatGPT

1. Keep the local server running.
2. In ChatGPT, enable Developer mode under Settings, Security and login.
3. Expose the local /mcp endpoint through a secure HTTPS tunnel for development.
4. In ChatGPT Plugins, add the HTTPS endpoint ending in /mcp.
5. Start a new chat, select the Freebuff connection, and ask it to check the workspace.

For example:

- Check my Freebuff workspace.
- Plan a change to add a project dashboard.
- Implement the approved dashboard plan.
- Show the Freebuff run.

Use a tunnel only for development. Do not expose this credentialed, writable runner on a public network. A hosted version needs real authentication, authorization, durable storage, and an isolated workspace per user.

## Tool flow

1. get_freebuff_workspace checks the local setup.
2. plan_freebuff_task inspects the workspace without modifying files.
3. implement_freebuff_task runs only after explicit user approval and confirmed=true.
4. render_freebuff_run displays the result in the interactive ChatGPT widget.

The widget can plan a follow-up against the same in-memory session. Ask in ChatGPT before any implementation, so the explicit approval step remains visible.

## Validation status

This package is intentionally standalone, so it does not alter the upstream Freebuff build or release flow. Run npm install followed by npm run typecheck locally before connecting it to ChatGPT.
