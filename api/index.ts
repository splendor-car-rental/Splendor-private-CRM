// Vercel serverless function entry point.
//
// Everything the app's backend needs to do (auth checks, all /api/*
// business logic, Firestore access via firebase-admin) already lives in
// server.ts as a plain Express `app`. This file just re-exports that same
// app as the default export of a function under /api -- which is Vercel's
// convention for "this file is a serverless function". Vercel's Node.js
// runtime knows how to invoke an Express app directly as a request handler.
//
// vercel.json rewrites every /api/* request to this one function, and
// since every route in server.ts is already defined with its full
// "/api/..." path (e.g. app.get('/api/leads', ...)), no path-stripping or
// extra routing logic is needed here.
// NOTE: this specifier says ".js" even though the real file is "server.ts".
// That's intentional, not a typo -- this project runs as native ESM
// ("type": "module" in package.json), and Node's own ESM loader (unlike
// CommonJS require(), and unlike the Vite/esbuild dev tooling this repo
// otherwise uses) does NOT guess file extensions at runtime; every relative
// import needs one that resolves to an actual, existing file. Vercel's
// Node.js builder compiles this project's .ts files to .js before
// deploying, so ".js" is what will actually exist next to this file at
// runtime -- writing ".ts" here (or leaving the extension off, as this line
// used to) is what caused every request to crash with
// `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/server'` in
// production, since Node had no ".ts" file and no un-suffixed "server" file
// to find. This is the standard, documented convention for TypeScript
// projects using Node's native ESM module resolution.
export { default } from '../server.js';
