// Shared constant-time secret comparison for Edge functions.
// Files starting with _ are not routed by Vercel.

// `a !== b` on two strings short-circuits at the first differing byte, so
// how long a wrong guess takes leaks how many leading characters it got
// right — a classic timing side channel against a shared-secret header
// (x-journal-key, x-ai-key). This app has no rate limiting in front of
// these endpoints, so that channel is realistically exploitable given
// enough requests, not just theoretical.
//
// Hashing both sides first (SHA-256, always 32 bytes) means the compare
// loop below always does the same amount of work regardless of the
// secrets' lengths or content, and the `|=` accumulator never
// short-circuits — no early return on the first mismatch.
async function sha256(s: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return new Uint8Array(digest);
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}
