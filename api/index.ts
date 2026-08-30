// Vercel serverless function entry point.
// The backend is implemented as the Express app exported by server.ts.
// Import the TypeScript source directly so Vercel's Node builder bundles the
// complete dependency graph into this function instead of leaving a runtime
// ESM import for /server.js that may not exist in the deployed function.
export { default } from '../server.ts';
