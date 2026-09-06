// Shared CORS + origin-guard helpers for Edge functions.
// Files starting with _ are not routed by Vercel.

// Allow our own Vercel deployment and localhost dev.
// Set ALLOWED_ORIGIN env var to restrict to a specific domain in production.
const EXPLICIT = process.env.ALLOWED_ORIGIN;

function isAllowed(origin: string): boolean {
  if (!origin) return true; // same-origin browser requests have no Origin header
  if (EXPLICIT) return origin === EXPLICIT;
  return (
    /^https:\/\/put-visualizer(-[a-z0-9]+)?\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin)
  );
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  if (origin && isAllowed(origin)) {
    return { "access-control-allow-origin": origin, vary: "Origin" };
  }
  return {};
}

// Returns a 403 Response if the Origin is present but not allowed.
// Returns null if the request should proceed.
export function rejectOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (origin && !isAllowed(origin)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}
