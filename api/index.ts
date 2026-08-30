// Vercel serverless entry point for the Express backend.
//
// Import the TypeScript source directly so Vercel's Node.js builder bundles
// the complete Express application and its local TypeScript dependencies.
// The previous '../server.js' re-export assumed a compiled server.js file
// existed beside server.ts at runtime; the repository build actually emits
// dist/server.cjs instead, which caused production API invocations to fail.
import app from '../server';

export default app;
