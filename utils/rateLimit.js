/** Tiny in-memory limiter for login attempts (per key, sliding window). */
const hits = new Map();

function tooMany(key, max = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  hits.set(key, list);
  return list.length >= max;
}
function record(key) { hits.set(key, [...(hits.get(key) || []), Date.now()]); }
function reset(key) { hits.delete(key); }

module.exports = { tooMany, record, reset };
