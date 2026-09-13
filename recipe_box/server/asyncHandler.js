'use strict';

/**
 * Wraps an async Express route handler so a rejected promise reaches the
 * app's error-handling middleware (via next(err)) instead of becoming an
 * unhandled rejection.
 *
 * This matters more than it might look: Express 4 (what this app uses)
 * does NOT catch rejected promises from async handlers on its own —
 * that's an Express 5 feature. A throw inside an async function (even a
 * synchronous one, like a database call failing) becomes a rejected
 * promise; without something to catch it, Node treats it as an unhandled
 * rejection, which terminates the entire process by default on modern
 * Node — taking down every other request in flight, not just the one
 * that failed. That's a much worse failure mode than a single request
 * returning a 500.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
