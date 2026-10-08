// Tiny in-memory limiter for the public forms (per IP). Fine for one server process.
const hits = new Map();

module.exports = function rateLimit({ max, windowMs }) {
  return (req, res, next) => {
    const key = `${req.path}|${req.ip}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).page('error', { pageTitle: 'Too many attempts', message: 'Please wait a few minutes and try again.' }, 'site');
    recent.push(now);
    hits.set(key, recent);
    next();
  };
};
