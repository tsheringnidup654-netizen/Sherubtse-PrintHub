/** Express 4 does not catch rejected promises - wrap every async controller so errors reach the error handler. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Wrap all functions of a controller object. */
const wrapAll = (ctrl) => Object.fromEntries(Object.entries(ctrl).map(([k, fn]) => [k, wrap(fn)]));

module.exports = { wrap, wrapAll };
