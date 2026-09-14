# Freebuff for ChatGPT

This package exposes a small, safe **Streamable HTTP MCP server** so Freebuff's task-planning workflow can be used from the ChatGPT UI.

## What it does

- `prepare_coding_task` converts a request into a precise implementation brief.
- `get_connection_status` confirms that the bridge is live.
- ChatGPT can then apply the task using its connected GitHub tools.

The bridge does **not** accept arbitrary remote execution or hold a repository token. That separation keeps repository writes inside the user's authenticated ChatGPT/GitHub connection.

## Run locally

```bash
cd apps/chatgpt-mcp
bun install
bun run start
```

Check it with:

```bash
curl http://localhost:8787/health
```

## Connect it to ChatGPT

ChatGPT needs a publicly reachable HTTPS URL. Deploy this small Bun service behind an authenticated HTTPS endpoint, then add the MCP URL in ChatGPT Developer Mode:

```
https://YOUR-DOMAIN/mcp
```

Use `/health` for hosting health checks.

## Security model

This first version is intentionally planning-only:

- no server-side GitHub token;
- no arbitrary command execution;
- no wildcard CORS;
- all repository modifications stay in the connected GitHub app and require its normal authorization.

To add background task execution later, put it behind user authentication, repository allowlists, signed task requests, audit logs, and explicit approval before each write.
