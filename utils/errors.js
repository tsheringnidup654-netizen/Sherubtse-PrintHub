/** Small helper so controllers/models can signal an HTTP-level problem. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true; // safe to show the message to the user
  }
}

const httpError = (status, message) => new HttpError(status, message);

/** Wrap async route handlers so rejected promises reach the error middleware. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, httpError, wrap };
