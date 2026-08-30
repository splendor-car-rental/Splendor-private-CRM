// Vercel serverless function entry point.
// The backend is implemented as the Express app exported by server.ts.
// Import the TypeScript source directly so Vercel's Node builder bundles the
// complete dependency graph into this function instead of leaving a runtime
// ESM import for /server.js that may not exist in the deployed function.
// TypeScript's noEmit check rejects .ts import specifiers by default; Vercel
// needs the source specifier here so its builder can bundle the dependency.
// @ts-ignore TS5097 -- intentional Vercel bundling entrypoint.
export { default } from '../server.ts';
