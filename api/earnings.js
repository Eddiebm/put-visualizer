export const config = { runtime: "edge" };

// Checks Finnhub's earnings calendar to see if a company has an earnings
// announcement between today and the option expiration date.
// Returns { available, hasEarnings, date } where date is the earnings date if found.
export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z.\-]/g, "");
  const expiration = (searchParams.get("expiration") || "").replace(/[^0-9\-]/g, "");

  const token = process.env.FINNHUB_API_KEY;
  if (!token) return json({ available: false, reason: "no_key" });
  if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(expiration)) {
    return json({ error: "symbol and expiration (YYYY-MM-DD) required" }, 400);
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${expiration}&symbol=${symbol}&token=${token}`;
    const r = await fetch(url);
    if (!r.ok) return json({ available: false, status: r.status });

    const data = await r.json();
    const events = data?.earningsCalendar ?? [];
    const upcoming = events.filter(e => e.date >= today && e.date <= expiration);

    if (upcoming.length === 0) {
      return json({ available: true, hasEarnings: false }, 200, {
        "cache-control": "s-maxage=3600, stale-while-revalidate=7200",
      });
    }

    return json({ available: true, hasEarnings: true, date: upcoming[0].date, hour: upcoming[0].hour }, 200, {
      "cache-control": "s-maxage=3600, stale-while-revalidate=7200",
    });
  } catch {
    return json({ available: false });
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
