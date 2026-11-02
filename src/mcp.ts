/**
 * testfinder MCP server. Tools: find_relevant_tests.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * Finding the relevant tests is pure local computation: no
 * upstream API, no authentication, no configuration, and no
 * test is ever executed.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { findRelevantTests, formatPayload, VERSION } from "./testfinder.js";

const TOOLS = [
  {
    name: "find_relevant_tests",
    description:
      "Find the tests relevant to one source file from a file/import map: direct importers, naming-convention matches, and transitive importers, ranked with the command that runs them.",
    inputSchema: {
      type: "object" as const,
      properties: {
        source_file: {
          type: "string",
          description:
            "Path of the source file to find tests for (must be one of the supplied files)",
        },
        files: {
          type: "array",
          description: "All files in the set, with their imports (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path (unique across the set)" },
              imports: {
                type: "array",
                description:
                  "Paths this file imports; names outside the set are external and ignored (optional, default [])",
                items: { type: "string" },
              },
            },
            required: ["path"],
          },
        },
      },
      required: ["source_file", "files"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "testfinder", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "find_relevant_tests") {
      const raw = (args ?? {}) as Record<string, unknown>;
      out = findRelevantTests(raw.source_file, raw.files);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
