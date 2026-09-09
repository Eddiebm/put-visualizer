// Shared Cloudflare D1 HTTP API helper for Edge functions. Files starting
// with _ are not routed by Vercel.
//
// Extracted from journal.ts's own d1() (which still has its own private
// copy — this file is used by the newer scan-cache/cron-scan endpoints so
// they don't duplicate this a third time, not a forced refactor of
// journal.ts's already-shipped, already-tested code for its own sake).

export interface D1Creds {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export function d1CredsFromEnv(): D1Creds | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  return accountId && databaseId && apiToken ? { accountId, databaseId, apiToken } : null;
}

export async function d1Query(
  creds: D1Creds,
  sql: string,
  params: unknown[] = []
): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/d1/database/${creds.databaseId}/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${creds.apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await r.json();
  if (!r.ok || !data.success) {
    throw new Error(data?.errors?.[0]?.message || `D1 query failed (${r.status})`);
  }
  return data.result?.[0]?.results ?? [];
}
