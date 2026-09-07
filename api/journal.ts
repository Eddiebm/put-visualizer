export const config = { runtime: "edge" };

import { corsHeaders, rejectOrigin } from "./_cors";
import { timingSafeEqual } from "./_auth";
import { rateLimit, clientKey, rateLimitResponse } from "./_rateLimit";

// Server-side backup for the trade journal. Without this, the journal
// (the only record of real trades) lives ONLY in one browser's localStorage
// — clear site data or switch devices and it's gone for good. This endpoint
// is an optional upgrade: if it isn't configured, GET/POST both return
// {available:false} and the app falls back to localStorage exactly as
// before, same pattern as the other optional integrations in this app.
//
// Auth: a single shared secret (JOURNAL_ACCESS_KEY), sent as the
// `x-journal-key` header and compared with timingSafeEqual (api/_auth.ts)
// rather than `!==`. This is a personal single-user app with no account
// system — a shared secret is the lightweight equivalent of a PIN, not a
// substitute for real auth. Don't reuse this pattern for anything
// multi-user. RATE_LIMIT below (api/_rateLimit.ts) caps both wrong-key
// guesses and legitimate sync volume from one client.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 5 * 60_000;
//
// Storage model: full-replace sync, not incremental diffing. The client
// already holds the whole journal array as one piece of React state, so on
// every mutation it POSTs the entire array; the server upserts what's
// present and deletes what's gone. Simple and correct for a single person's
// low-volume trade log — NOT a conflict-resolution system for concurrent
// edits from two devices at once (last write wins).

interface JournalSyncEntry {
  id: string | number;
  status?: string;
  [key: string]: unknown;
}

interface JournalSyncBody {
  action: string;
  entries: JournalSyncEntry[];
}

export default async function handler(req: Request): Promise<Response> {
  const ch = corsHeaders(req);
  const originRejection = rejectOrigin(req);
  if (originRejection) return originRejection;

  const rl = rateLimit(clientKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return rateLimitResponse(rl, ch);

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accessKey = process.env.JOURNAL_ACCESS_KEY;

  if (!accountId || !databaseId || !apiToken || !accessKey) {
    return json({ available: false, reason: "not_configured" }, 200, ch);
  }

  const providedKey = req.headers.get("x-journal-key") ?? "";
  if (!(await timingSafeEqual(providedKey, accessKey))) {
    return json({ error: "unauthorized" }, 401, ch);
  }

  async function d1(sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
        body: JSON.stringify({ sql, params }),
      }
    );
    const data = await r.json();
    if (!r.ok || !data.success) {
      throw new Error(data?.errors?.[0]?.message || `D1 query failed (${r.status})`);
    }
    return data.result?.[0]?.results ?? [];
  }

  try {
    if (req.method === "GET") {
      const rows = await d1("SELECT data FROM journal_entries ORDER BY updated_at ASC");
      const entries = rows.map((r) => JSON.parse(r.data as string));
      return json({ available: true, entries }, 200, ch);
    }

    if (req.method === "POST") {
      const body: JournalSyncBody = await req.json();
      if (body.action !== "sync" || !Array.isArray(body.entries)) {
        return json({ error: "expected { action: 'sync', entries: [...] }" }, 400, ch);
      }
      // Cap payload size — this is a personal trade log, not a bulk import target.
      if (body.entries.length > 5000) {
        return json({ error: "too many entries" }, 413, ch);
      }

      const now = new Date().toISOString();
      const ids = body.entries.map((e) => String(e.id));

      // Upsert everything the client has BEFORE deleting what it doesn't —
      // not the other way around. The two operations touch disjoint rows
      // (delete only ever removes ids absent from the client's array, and
      // upsert only ever touches ids present in it), so the end state is
      // identical either way once both succeed. But the delete is still its
      // own separate D1 request from the last upsert batch, not one atomic
      // transaction spanning the whole sync, so ordering matters if it fails
      // right after upserts succeed: delete-then-upsert can leave FEWER rows
      // than either journal ever had (a failed upsert after a successful
      // delete loses data); upsert-then-delete can at worst leave a stale
      // row or two temporarily (a failed delete after successful upserts),
      // which the next sync cleans up — never fewer rows than intended.
      //
      // Within a batch, though, this IS one atomic transaction: every
      // upsert in the batch is sent as a single D1 request — one SQL string
      // wrapped in BEGIN TRANSACTION/COMMIT, with all params concatenated
      // in matching positional order — instead of the batch's entries each
      // getting their own auto-committed statement. Standard SQLite
      // transaction syntax, and D1 is documented as SQLite-compatible; this
      // codebase's own d1() helper already expected `result` to be an
      // array indexed per-statement (`result?.[0]`), consistent with the
      // multi-statement-per-request shape this relies on. NOT verified
      // against a live D1 database from this environment (no credentials
      // available to test against) — if BEGIN/COMMIT inside one HTTP
      // request turns out to be rejected by D1's HTTP API, the whole batch
      // fails loudly (a normal D1 error, caught below and surfaced as a 502
      // to the client) rather than silently writing a partial batch — a
      // syntax-level rejection fails before any statement executes. Test a
      // real sync end to end after deploying before trusting this shrinks
      // the blast radius of a partial-write failure to a batch of
      // UPSERT_BATCH_SIZE rather than a single row.
      //
      // One D1 HTTP round-trip per BATCH now (not per entry) — up to 5000
      // entries is at most 200 requests instead of 5000, both reducing the
      // edge-function execution-time risk this batching originally existed
      // to solve, and (new) bounding a partial-write failure to at most
      // UPSERT_BATCH_SIZE rows instead of one row at a time.
      const UPSERT_BATCH_SIZE = 25;
      for (let i = 0; i < body.entries.length; i += UPSERT_BATCH_SIZE) {
        const batch = body.entries.slice(i, i + UPSERT_BATCH_SIZE);
        const sql = ["BEGIN TRANSACTION;"];
        const params: unknown[] = [];
        for (const e of batch) {
          sql.push(
            "INSERT INTO journal_entries (id, status, data, updated_at) VALUES (?, ?, ?, ?) " +
              "ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data, updated_at = excluded.updated_at;"
          );
          params.push(String(e.id), String(e.status || "open"), JSON.stringify(e), now);
        }
        sql.push("COMMIT;");
        await d1(sql.join(" "), params);
      }

      // Delete anything server-side that's no longer in the client's array.
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        await d1(`DELETE FROM journal_entries WHERE id NOT IN (${placeholders})`, ids);
      } else {
        await d1("DELETE FROM journal_entries");
      }

      return json({ available: true, count: body.entries.length }, 200, ch);
    }

    return json({ error: "method not allowed" }, 405, ch);
  } catch (err) {
    return json({ available: true, error: err instanceof Error ? err.message : "sync failed" }, 502, ch);
  }
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
