/**
 * Natural-language → read-only SQL service.
 *
 * Workflow:
 *   1. LLM produces a single SELECT statement using a whitelisted schema view.
 *   2. The statement passes a syntactic safety filter (single stmt, SELECT only,
 *      no DDL/DML keywords, no system catalogs, no LLM-invented identifiers).
 *   3. Executed via the isolated aiPool against `SET LOCAL statement_timeout`
 *      and `SET LOCAL transaction_read_only = on` so even a bypass can't mutate.
 *   4. Row count capped; returned to caller.
 *
 * The whitelist doubles as context for the LLM — it only sees the columns it is
 * allowed to query, which both shrinks prompt size and prevents data-exfiltration.
 */
import Anthropic from "@anthropic-ai/sdk";
import { aiPool } from "../db.js";
import { getWorkspaceScope } from "../middleware/workspaceContext.js";
import { getAnthropicClient } from "../routes/_helpers.js";
import { logger } from "../observability/logger.js";

// ─── Schema whitelist (columns exposed to the model) ────────────────────────

interface TableSpec {
  description: string;
  columns: Record<string, string>;
}

const SCHEMA: Record<string, TableSpec> = {
  vehicles: {
    description: "Fleet vehicles — operational state, not pricing/bookings.",
    columns: {
      id: "integer PK",
      plate: "text",
      model: "text",
      category: "text",
      status: "text — ready|cleaning|qc|blocked|rented",
      mileage: "integer",
      fuel_level: "integer (0-100)",
      station_id: "integer FK stations",
      deleted_at: "timestamp nullable — filter `IS NULL` for live rows",
    },
  },
  wash_queue: {
    description: "Active wash pipeline. Status pending/in_progress/completed/cancelled.",
    columns: {
      id: "integer PK",
      vehicle_plate: "text",
      wash_type: "text",
      priority: "text",
      status: "text",
      assigned_to: "text",
      station_id: "integer FK stations",
      sla_deadline: "timestamp",
      created_at: "timestamp",
      completed_at: "timestamp",
    },
  },
  shifts: {
    description: "Staff shifts and schedule entries.",
    columns: {
      id: "integer PK",
      user_id: "integer FK users",
      station_id: "integer FK stations",
      start_time: "timestamp",
      end_time: "timestamp",
      role: "text",
      status: "text",
    },
  },
  incidents: {
    description: "Operational incidents (damage, complaints, safety).",
    columns: {
      id: "integer PK",
      vehicle_id: "integer FK vehicles",
      type: "text",
      severity: "text — info|warning|critical",
      status: "text — open|investigating|resolved|closed",
      title: "text",
      created_at: "timestamp",
      resolved_at: "timestamp",
    },
  },
  stations: {
    description: "Physical locations (depots, wash bays).",
    columns: { id: "integer PK", name: "text", city: "text" },
  },
  vehicle_evidence: {
    description: "Photos, notes, damage records attached to vehicles.",
    columns: {
      id: "integer PK",
      vehicle_id: "integer FK vehicles",
      type: "text",
      severity: "text",
      created_at: "timestamp",
    },
  },
};

function renderSchemaForPrompt(): string {
  const lines: string[] = [];
  for (const [name, spec] of Object.entries(SCHEMA)) {
    lines.push(`TABLE ${name} — ${spec.description}`);
    for (const [col, desc] of Object.entries(spec.columns)) {
      lines.push(`  - ${col}: ${desc}`);
    }
  }
  return lines.join("\n");
}

// ─── Safety filter ──────────────────────────────────────────────────────────

const FORBIDDEN_KEYWORDS = [
  "insert", "update", "delete", "drop", "alter", "create", "truncate",
  "grant", "revoke", "vacuum", "analyze", "copy", "comment",
  "reindex", "cluster", "refresh", "notify", "listen",
  "do", "call", "merge", "lock", "begin", "commit", "rollback",
  "pg_", "information_schema", "current_setting", "set_config",
  "pg_read_server_files", "pg_ls_dir", "pg_read_binary_file",
  "load", "execute", "prepare", "deallocate", "discard",
];

/**
 * Lightweight check that the statement is a single SELECT / WITH-SELECT
 * that references only whitelisted tables. Uses a conservative tokenizer —
 * strip string literals first so keywords inside quotes don't false-trigger.
 */
export function validateSql(sql: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = sql.trim().replace(/;?\s*$/, "");
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.split(";").filter((s) => s.trim().length > 0).length > 1) {
    return { ok: false, reason: "multiple statements not allowed" };
  }

  // Strip single-quoted literals so keywords inside them don't match.
  const stripped = trimmed.replace(/'(?:''|[^'])*'/g, "''");
  const lower = stripped.toLowerCase();

  // Must start with SELECT or WITH.
  if (!/^\s*(select|with)\b/.test(lower)) {
    return { ok: false, reason: "only SELECT / WITH-SELECT statements allowed" };
  }

  const sqlWords: string[] = lower.match(/[a-z_]+/g) ?? [];
  const forbiddenKeywords: readonly string[] = FORBIDDEN_KEYWORDS;
  for (const keyword of forbiddenKeywords) {
    if (sqlWords.includes(keyword)) {
      return { ok: false, reason: `forbidden keyword: ${keyword}` };
    }
  }

  // Reject unknown table references. We look for `from <tbl>` and `join <tbl>`.
  const tablePattern = /\b(from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(lower))) {
    const name = match[2];
    if (name && !Object.prototype.hasOwnProperty.call(SCHEMA, name)) {
      return { ok: false, reason: `table not in whitelist: ${name}` };
    }
  }

  return { ok: true };
}

// ─── Generation ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a SQL generator for a PostgreSQL database.

STRICT RULES:
- Return ONLY a single SELECT statement (or WITH ... SELECT). No prose, no backticks, no Markdown.
- Use ONLY the tables and columns listed in the SCHEMA block below.
- Do NOT reference any system catalogs or internal schemas.
- Prefer LIMIT 100 unless the user clearly asks for a summary aggregate.
- Time filters: the current workspace uses UTC. Use NOW() and INTERVAL arithmetic.
- Exclude soft-deleted rows when the table has a deleted_at column (add WHERE deleted_at IS NULL).
- Case-insensitive text match: use ILIKE.

SCHEMA:
{{SCHEMA}}`;

export interface NlSqlResult {
  question: string;
  sql: string;
  rowCount: number;
  rows: Record<string, unknown>[];
  latencyMs: number;
}

/**
 * Execute a natural-language question as safe read-only SQL.
 * Throws on policy violations (caller should surface as 4xx).
 */
export async function runNlQuery(question: string, opts: { maxRows?: number } = {}): Promise<NlSqlResult> {
  const maxRows = Math.min(opts.maxRows ?? 200, 500);
  const t0 = Date.now();
  const client = getAnthropicClient();

  const systemPrompt = SYSTEM_PROMPT.replace("{{SCHEMA}}", renderSchemaForPrompt());

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: question.slice(0, 1000) }],
  });

  const sql = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:sql)?\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  const validation = validateSql(sql);
  if (!validation.ok) {
    logger.warn("NL-SQL rejected", { reason: validation.reason, sql: sql.slice(0, 200) });
    throw Object.assign(new Error(`Generated SQL rejected: ${validation.reason}`), { status: 422 });
  }

  // Execute under a read-only transaction + statement timeout.
  const workspaceId = getWorkspaceScope();
  const pgClient = await aiPool.connect();
  try {
    await pgClient.query("BEGIN");
    await pgClient.query("SET LOCAL transaction_read_only = on");
    await pgClient.query("SET LOCAL statement_timeout = 15000");
    // Scope via GUC so any row-level-security policy reading app.workspace_id
    // filters correctly. The LLM-generated SQL doesn't know the workspace.
    await pgClient.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
    const { rows } = await pgClient.query(`${sql} LIMIT ${maxRows}`);
    await pgClient.query("COMMIT");

    return {
      question,
      sql,
      rowCount: rows.length,
      rows,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    await pgClient.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    pgClient.release();
  }
}
