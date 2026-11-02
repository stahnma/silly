// A token bucket per id (a GitHub account), in memory: each may make up to
// `capacity` requests at once, refilling at `perHour` an hour. With more than
// one machine each keeps its own count, which only makes the limit looser.

export const createRateLimit = ({ capacity = 60, perHour = 60, now = () => Date.now() } = {}) => {
  const buckets = new Map();
  const refillMs = (60 * 60 * 1000) / perHour;

  return {
    limits: { capacity, perHour },
    // {ok: true} and one request used, or {ok: false, retryAfter} in seconds.
    take(id) {
      const t = now();
      const bucket = buckets.get(id) || { tokens: capacity, at: t };
      bucket.tokens = Math.min(capacity, bucket.tokens + (t - bucket.at) / refillMs);
      bucket.at = t;
      buckets.set(id, bucket);
      if (bucket.tokens < 1) {
        return { ok: false, retryAfter: Math.ceil(((1 - bucket.tokens) * refillMs) / 1000) };
      }
      bucket.tokens -= 1;
      return { ok: true };
    },
  };
};
