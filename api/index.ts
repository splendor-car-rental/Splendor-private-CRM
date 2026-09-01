import { createRequire } from 'node:module';
import type { Request, Response } from 'express';

/**
 * Vercel executes this tiny stable entrypoint. The full application handler
 * is bundled by esbuild during the project build into one CommonJS file so
 * Node never has to resolve the repository's extensionless TypeScript import
 * graph at runtime.
 *
 * Vercel supports importing build-time generated files from Functions. Using
 * createRequire keeps TypeScript typechecking independent of the generated
 * artifact while the literal path remains traceable by the deployment build.
 */
const require = createRequire(import.meta.url);
const bundled = require('../dist/api-handler.cjs') as {
  default?: (req: Request, res: Response) => unknown;
};

const handler = (bundled.default || bundled) as unknown as (req: Request, res: Response) => unknown;

export default handler;
