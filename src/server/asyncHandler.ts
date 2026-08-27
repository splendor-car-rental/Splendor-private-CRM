import type { NextFunction, Request, RequestHandler, Response } from 'express';

// This app runs Express 4.x, which does NOT automatically catch a rejected
// promise thrown by an `async` route handler (that only became automatic
// in Express 5). Before this remediation, 16 of 23 async routes had no
// try/catch at all -- an unexpected throw (a malformed request body, a
// Firestore error, anything) became an unhandled promise rejection: the
// request hung forever with no response, and depending on the Node
// process's default unhandled-rejection behavior, could take down the
// whole warm serverless instance for every other in-flight request on it.
//
// asyncHandler wraps a route handler so any rejection is forwarded to
// Express's own error-handling pipeline (`next(err)`) instead of being
// lost. Paired with the catch-all error middleware registered in
// server.ts, every async route now fails safely: a controlled JSON error
// response, never a hang or a crash.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
