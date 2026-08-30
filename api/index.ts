// Vercel serverless entry point for the Express backend.
// Explicitly include the .ts extension so Vercel's function bundler resolves
// and packages the local TypeScript module. Without the extension, the
// deployed ESM runtime attempted to resolve /var/task/server and failed with
// ERR_MODULE_NOT_FOUND before the Express app could initialize.
import app from '../server.ts';

export default app;
