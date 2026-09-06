export const config = { runtime: "edge" };

import { corsHeaders, rejectOrigin } from "./_cors.js";

// Server-side backup for the trade journal. Without this, the journal
// (the only record of real trades) lives ONLY in one browser's localStorage
// — clear site data or switch devices and it's gone for good. This endpoint
// is an optional upgrade: if it isn't configured, GET/POST both return
// {available:false} and the app falls back to localStorage exactly as
// before, same pattern as the other optional integrations in this app.
//
// Auth: a single shared secret (JOURNAL_ACCESS_KEY), sent as the
// `x-journal-key` header. This is a personal single-user app with no
// account system — a shared secret is the lightweight equivalent of a
// PIN, not a substitute for real auth. Don't reuse this pattern for
// anything multi-user.
//
// Storage model: full-replace sync, not incremental diffing. The client
// already holds the whole journal array as one piece of React state, so on
// every mutation it POSTs the entire array; the server upserts what's
// present and deletes what's gone. Simple and correct for a single person's
// low-volume trade log — NOT a conflict-resolution system for concurrent
// edits from two devices at once (last write wins).

export default async function handler(req) {
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

  const providedKey = req.headers.get("x-journal-key");
  if (providedKey !== accessKey) {
    return json({ error: "unauthorized" }, 401, ch);
  }

  async function d1(sql, params = []) {
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
      const entries = rows.map((r) => JSON.parse(r.data));
      return json({ available: true, entries }, 200, ch);
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (body.action !== "sync" || !Array.isArray(body.entries)) {
        return json({ error: "expected { action: 'sync', entries: [...] }" }, 400, ch);
      }
      // Cap payload size — this is a personal trade log, not a bulk import target.
      if (body.entries.length > 5000) {
        return json({ error: "too many entries" }, 413, ch);
      }

      const now = new Date().toISOString();
      const ids = body.entries.map((e) => String(e.id));

      // Delete anything server-side that's no longer in the client's array.
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        await d1(`DELETE FROM journal_entries WHERE id NOT IN (${placeholders})`, ids);
      } else {
        await d1("DELETE FROM journal_entries");
      }

      // Upsert everything the client has.
      for (const e of body.entries) {
        await d1(
          "INSERT INTO journal_entries (id, status, data, updated_at) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data, updated_at = excluded.updated_at",
          [String(e.id), String(e.status || "open"), JSON.stringify(e), now]
        );
      }

      return json({ available: true, count: body.entries.length }, 200, ch);
    }

    return json({ error: "method not allowed" }, 405, ch);
  } catch (err) {
    return json({ available: true, error: err.message || "sync failed" }, 502, ch);
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
