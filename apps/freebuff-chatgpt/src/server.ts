import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CodebuffClient } from "@codebuff/sdk";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const VERSION = "0.1.0";
const MCP_PATH = "/mcp";
const TEMPLATE_URI = "ui://freebuff/chatgpt-dashboard-v1.html";
const MAX_PROMPT_LENGTH = 6000;
const MAX_EVENT_COUNT = 24;
const MAX_EVENT_LENGTH = 280;

const defaultWorkspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const workspaceRoot = resolve(
  process.env.FREEBUFF_WORKSPACE_ROOT || defaultWorkspaceRoot,
);
const workspaceName =
  cleanString(process.env.FREEBUFF_WORKSPACE_NAME) || basename(workspaceRoot);
const host = cleanString(process.env.HOST) || "127.0.0.1";
const port = readPort(process.env.PORT);

if (
  host !== "127.0.0.1" &&
  host !== "localhost" &&
  process.env.FREEBUFF_MCP_ALLOW_NETWORK !== "true"
) {
  throw new Error(
    "Refusing a network-visible host. Keep HOST on 127.0.0.1 or explicitly set FREEBUFF_MCP_ALLOW_NETWORK=true behind real authentication.",
  );
}

const widgetHtml = readFileSync(
  new URL("../public/freebuff-widget.html", import.meta.url),
  "utf8",
);

type RunMode = "plan" | "implement";
type RunStatus = "completed" | "failed";
type AgentRunState = Awaited<ReturnType<CodebuffClient["run"]>>;

type TaskRun = {
  runId: string;
  sessionId: string;
  mode: RunMode;
  status: RunStatus;
  workspaceName: string;
  runner: string;
  request: string;
  summary: string;
  events: string[];
  startedAt: string;
  finishedAt: string;
};

const runStates = new Map<string, AgentRunState>();
const runs = new Map<string, TaskRun>();

const workspaceOutputSchema = {
  workspaceName: z.string(),
  workspaceFound: z.boolean(),
  runner: z.string(),
  ready: z.boolean(),
  message: z.string(),
};

const taskRunOutputSchema = {
  runId: z.string(),
  sessionId: z.string(),
  mode: z.enum(["plan", "implement"]),
  status: z.enum(["completed", "failed"]),
  workspaceName: z.string(),
  runner: z.string(),
  request: z.string(),
  summary: z.string(),
  events: z.array(z.string()),
  startedAt: z.string(),
  finishedAt: z.string(),
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readPort(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536
    ? parsed
    : 8787;
}

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit
    ? normalized.slice(0, Math.max(0, limit - 1)) + "…"
    : normalized;
}

function redact(value: string): string {
  return value
    .replace(/sk-(?:proj-)?[A-Za-z0-9_-]{12,}/g, "[redacted]")
    .replace(
      /(authorization\s*:\s*bearer\s+)[^\s]+/gi,
      "$1[redacted]",
    )
    .replace(
      /(api[_-]?key\s*[=:]\s*)[^\s,;]+/gi,
      "$1[redacted]",
    );
}

function safeText(value: unknown, limit: number): string {
  return truncate(redact(cleanString(value)), limit);
}

function runnerName(): string {
  return cleanString(process.env.CODEBUFF_API_KEY)
    ? "Codebuff API"
    : "Not configured";
}

function workspaceSnapshot() {
  const workspaceFound = existsSync(workspaceRoot);
  const runner = runnerName();
  const ready = workspaceFound && runner !== "Not configured";

  return {
    workspaceName,
    workspaceFound,
    runner,
    ready,
    message: ready
      ? "Freebuff is ready for a plan or an explicitly confirmed implementation."
      : !workspaceFound
        ? "The configured workspace folder does not exist."
        : "Add CODEBUFF_API_KEY or FREEBUFF_BYOK_API_KEY before running a task.",
  };
}

function createFreebuffClient(): CodebuffClient {
  const codebuffApiKey = cleanString(process.env.CODEBUFF_API_KEY);
  if (!codebuffApiKey) {
    throw new Error(
      "No Codebuff API key is configured. Add CODEBUFF_API_KEY before running a task.",
    );
  }

  return new CodebuffClient({
    apiKey: codebuffApiKey,
    cwd: workspaceRoot,
  });
}

function summarizeEvent(event: unknown): string {
  if (!event || typeof event !== "object") return "Agent event";

  const record = event as Record<string, unknown>;
  const type = safeText(record.type, 80) || "agent event";
  const tool =
    safeText(record.toolName, 80) ||
    safeText(record.name, 80) ||
    safeText(record.tool, 80);
  const message =
    safeText(record.message, 160) ||
    safeText(record.text, 160) ||
    safeText(record.summary, 160);

  return truncate(
    [type, tool, message].filter(Boolean).join(" — "),
    MAX_EVENT_LENGTH,
  );
}

function summarizeOutput(output: unknown): string {
  if (typeof output === "string") return safeText(output, 4000);

  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    for (const field of ["message", "text", "summary"]) {
      const candidate = safeText(record[field], 4000);
      if (candidate) return candidate;
    }

    try {
      return safeText(JSON.stringify(output), 4000);
    } catch {
      return "The agent completed without a printable summary.";
    }
  }

  return "The agent completed without a text summary.";
}

function errorSummary(error: unknown): string {
  if (error instanceof Error) return safeText(error.message, 800);
  return safeText(String(error), 800) || "The Freebuff run failed.";
}

function buildAgentPrompt(mode: RunMode, request: string): string {
  if (mode === "plan") {
    return (
      "You are in strict plan-only mode. Inspect the workspace and return a concise implementation plan, including relevant files and validation steps. Do not write or patch files, do not run terminal commands, do not commit, and do not deploy anything.\n\nUser request:\n" +
      request
    );
  }

  return (
    "Implement the user request in the configured workspace. Inspect relevant files first, make the smallest safe changes, and describe validation that should be run. Do not commit, push, deploy, change credentials, or access files outside the configured workspace.\n\nUser request:\n" +
    request
  );
}

async function blockPlanOnlyTool() {
  return [
    {
      type: "text" as const,
      text: "Blocked: this Freebuff run is in plan-only mode.",
    },
  ];
}

const planOnlyOverrides = {
  apply_patch: blockPlanOnlyTool,
  propose_str_replace: blockPlanOnlyTool,
  propose_write_file: blockPlanOnlyTool,
  run_file_change_hooks: blockPlanOnlyTool,
  run_terminal_command: blockPlanOnlyTool,
  str_replace: blockPlanOnlyTool,
  write_file: blockPlanOnlyTool,
};

function createMissingRun(runId: string): TaskRun {
  const now = new Date().toISOString();
  return {
    runId,
    sessionId: "unknown",
    mode: "plan",
    status: "failed",
    workspaceName,
    runner: runnerName(),
    request: "",
    summary: "Run not found. Start a new plan or implementation first.",
    events: [],
    startedAt: now,
    finishedAt: now,
  };
}

async function executeTask(input: {
  prompt: string;
  sessionId?: string;
  mode: RunMode;
}): Promise<TaskRun> {
  const sessionId = cleanString(input.sessionId) || "session_" + crypto.randomUUID();
  const runId = "run_" + crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const events: string[] = [];
  const record: TaskRun = {
    runId,
    sessionId,
    mode: input.mode,
    status: "failed",
    workspaceName,
    runner: runnerName(),
    request: input.prompt,
    summary: "",
    events,
    startedAt,
    finishedAt: startedAt,
  };

  try {
    if (!existsSync(workspaceRoot)) {
      throw new Error("The configured workspace folder does not exist.");
    }

    const client = createFreebuffClient();
    const result = await client.run({
      agent: "base",
      prompt: buildAgentPrompt(input.mode, input.prompt),
      previousRun: runStates.get(sessionId),
      maxAgentSteps: input.mode === "plan" ? 12 : 20,
      handleEvent(event) {
        const summary = summarizeEvent(event);
        if (summary && events.length < MAX_EVENT_COUNT) events.push(summary);
      },
      ...(input.mode === "plan"
        ? { overrideTools: planOnlyOverrides }
        : {}),
    });

    runStates.set(sessionId, result);
    record.status = "completed";
    record.summary = summarizeOutput(result.output);
  } catch (error) {
    record.status = "failed";
    record.summary = errorSummary(error);
  }

  record.finishedAt = new Date().toISOString();
  runs.set(runId, record);
  return record;
}

function contentForRun(record: TaskRun) {
  return {
    structuredContent: record,
    content: [
      {
        type: "text" as const,
        text:
          record.status === "completed"
            ? "Freebuff " + record.mode + " completed. Run ID: " + record.runId
            : "Freebuff " + record.mode + " failed: " + record.summary,
      },
    ],
  };
}

function createFreebuffServer(): McpServer {
  const server = new McpServer(
    {
      name: "freebuff-chatgpt",
      version: VERSION,
    },
    {
      instructions:
        "Use get_freebuff_workspace before a task. For planning call plan_freebuff_task. For implementation, first get explicit user approval and then call implement_freebuff_task with confirmed=true. Call render_freebuff_run after a task to show the interactive result.",
    },
  );

  registerAppResource(
    server,
    "freebuff-dashboard",
    TEMPLATE_URI,
    {},
    async () => ({
      contents: [
        {
          uri: TEMPLATE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              prefersBorder: true,
            },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "get_freebuff_workspace",
    {
      title: "Check Freebuff workspace",
      description:
        "Check whether the locally configured Freebuff workspace and runner credential are ready. Use before planning or implementing.",
      inputSchema: {},
      outputSchema: workspaceOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Checking Freebuff workspace…",
        "openai/toolInvocation/invoked": "Freebuff workspace checked.",
      },
    },
    async () => {
      const snapshot = workspaceSnapshot();
      return {
        structuredContent: snapshot,
        content: [
          {
            type: "text" as const,
            text: snapshot.message,
          },
        ],
      };
    },
  );

  registerAppTool(
    server,
    "plan_freebuff_task",
    {
      title: "Plan a Freebuff task",
      description:
        "Inspect the local workspace and return an implementation plan without changing files or running terminal commands. Use this before implementing a coding request.",
      inputSchema: {
        prompt: z.string().trim().min(10).max(MAX_PROMPT_LENGTH),
        sessionId: z.string().trim().min(1).max(160).optional(),
      },
      outputSchema: taskRunOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Freebuff is planning…",
        "openai/toolInvocation/invoked": "Freebuff plan ready.",
      },
    },
    async ({ prompt, sessionId }) =>
      contentForRun(await executeTask({ prompt, sessionId, mode: "plan" })),
  );

  registerAppTool(
    server,
    "implement_freebuff_task",
    {
      title: "Implement a Freebuff task",
      description:
        "Apply a coding change in the configured local workspace. Use only after the user has explicitly approved the implementation.",
      inputSchema: {
        prompt: z.string().trim().min(10).max(MAX_PROMPT_LENGTH),
        sessionId: z.string().trim().min(1).max(160).optional(),
        confirmed: z.literal(true).describe(
          "Must be true only after the user explicitly approves workspace changes.",
        ),
      },
      outputSchema: taskRunOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Freebuff is implementing…",
        "openai/toolInvocation/invoked": "Freebuff implementation finished.",
      },
    },
    async ({ prompt, sessionId }) =>
      contentForRun(
        await executeTask({
          prompt,
          sessionId,
          mode: "implement",
        }),
      ),
  );

  registerAppTool(
    server,
    "render_freebuff_run",
    {
      title: "Show Freebuff run",
      description:
        "Render an interactive summary card for a Freebuff task run. Use after planning or implementation.",
      inputSchema: {
        runId: z.string().trim().min(1).max(160),
      },
      outputSchema: taskRunOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: {
          resourceUri: TEMPLATE_URI,
        },
        "openai/toolInvocation/invoking": "Opening Freebuff dashboard…",
        "openai/toolInvocation/invoked": "Freebuff dashboard ready.",
      },
    },
    async ({ runId }) => contentForRun(runs.get(runId) || createMissingRun(runId)),
  );

  return server;
}

function setCorsHeaders(response: import("node:http").ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, mcp-session-id",
  );
  response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

const httpServer = createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(
    request.url,
    "http://" + (request.headers.host || "localhost"),
  );

  if (request.method === "OPTIONS" && url.pathname === MCP_PATH) {
    setCorsHeaders(response);
    response.writeHead(204).end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    response
      .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
      .end("Freebuff ChatGPT MCP server");
    return;
  }

  if (request.method === "GET" && url.pathname === "/healthz") {
    response
      .writeHead(200, { "content-type": "application/json; charset=utf-8" })
      .end(JSON.stringify({ ok: true, workspace: workspaceName }));
    return;
  }

  const mcpMethods = new Set(["POST", "GET", "DELETE"]);
  if (
    url.pathname === MCP_PATH &&
    request.method &&
    mcpMethods.has(request.method)
  ) {
    setCorsHeaders(response);
    const server = createFreebuffServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error("Freebuff MCP request failed:", error);
      if (!response.headersSent) {
        response.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  response.writeHead(404).end("Not Found");
});

httpServer.listen(port, host, () => {
  console.log(
    "Freebuff ChatGPT MCP server listening on http://" +
      host +
      ":" +
      port +
      MCP_PATH +
      " for workspace " +
      workspaceName,
  );
});
