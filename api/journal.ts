export const config = { runtime: "edge" };

import { corsHeaders, rejectOrigin } from "./_cors";
import { timingSafeEqual } from "./_auth";

// Server-side backup for the trade journal. Without this, the journal
// (the only record of real trades) lives ONLY in one browser's localStorage
// — clear site data or switch devices and it's gone for good. This endpoint
// is an optional upgrade: if it isn't configured, GET/POST both return
// {available:false} and the app falls back to localStorage exactly as
// before, same pattern as the other optional integrations in this app.
//
// Auth: a single shared secret (JOURNAL_ACCESS_KEY), sent as the
// `x-journal-key` header and compared with timingSafeEqual (api/_auth.ts)
// rather than `!==`, since there's no rate limiting in front of this
// endpoint. This is a personal single-user app with no account system — a
// shared secret is the lightweight equivalent of a PIN, not a substitute
// for real auth. Don't reuse this pattern for anything multi-user.
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
      // identical either way once both succeed. But each is its own D1
      // request, not one atomic transaction, so ordering matters if one
      // fails partway: delete-then-upsert can leave FEWER rows than either
      // journal ever had (a failed upsert after a successful delete loses
      // data); upsert-then-delete can at worst leave a stale row or two
      // temporarily (a failed delete after successful upserts), which the
      // next sync cleans up — never fewer rows than intended.
      // One D1 HTTP round-trip per entry either way, but sequentially that's
      // up to 5000 round-trips end to end — easily enough to blow an edge
      // function's execution limit on a real, months-old journal, breaking
      // the sync this endpoint exists to provide. The upserts have no
      // ordering dependency on each other (only "upserts before delete"
      // above matters), so run each small batch concurrently instead of
      // one at a time; bounded rather than a single unbounded Promise.all
      // across the full (up to 5000-entry) array, so this doesn't fire an
      // unbounded burst of simultaneous outbound requests.
      const UPSERT_BATCH_SIZE = 25;
      for (let i = 0; i < body.entries.length; i += UPSERT_BATCH_SIZE) {
        const batch = body.entries.slice(i, i + UPSERT_BATCH_SIZE);
        await Promise.all(batch.map((e) =>
          d1(
            "INSERT INTO journal_entries (id, status, data, updated_at) VALUES (?, ?, ?, ?) " +
              "ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data, updated_at = excluded.updated_at",
            [String(e.id), String(e.status || "open"), JSON.stringify(e), now]
          )
        ));
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
