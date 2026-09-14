import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const port = Number(process.env.PORT ?? 8787);
const sessions = new Map<string, StreamableHTTPServerTransport>();

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function createServer() {
  const server = new McpServer({ name: "Freebuff", version: "0.1.0" });

  server.tool(
    "prepare_coding_task",
    "Turn a coding request into a Freebuff-ready task brief. Use it before implementing a repository change.",
    {
      goal: z.string().min(1).describe("What should be built or changed"),
      repository: z.string().optional().describe("GitHub repository, owner/name"),
      constraints: z.array(z.string()).optional(),
    },
    async ({ goal, repository, constraints = [] }) =>
      result({
        goal,
        repository: repository ?? null,
        task_prompt: [
          "Work on this task:",
          goal,
          constraints.length ? "Constraints:\n- " + constraints.join("\n- ") : "",
          "First inspect relevant files. Make the smallest safe implementation, run focused checks, then report changed files and verification.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        workflow: ["inspect", "plan", "implement", "verify", "summarize"],
      }),
  );

  server.tool(
    "get_connection_status",
    "Confirm that the Freebuff ChatGPT bridge is running.",
    {},
    async () =>
      result({
        mcp: "ready",
        execution: "Use ChatGPT's connected GitHub tools to apply the prepared task.",
        note: "Automated remote execution is intentionally disabled until an authenticated task service is configured.",
      }),
  );

  return server;
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "freebuff-chatgpt-mcp" });
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Use POST /mcp", { status: 405 });
    }

    const sessionId = request.headers.get("mcp-session-id");
    let transport = sessionId ? sessions.get(sessionId) : undefined;

    if (!transport) {
      let createdTransport: StreamableHTTPServerTransport;
      createdTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: (id) => sessions.set(id, createdTransport),
      });
      transport = createdTransport;
      await createServer().connect(transport);
    }

    return transport.handleRequest(request);
  },
});

console.log("Freebuff ChatGPT MCP listening on http://localhost:" + port + "/mcp");
