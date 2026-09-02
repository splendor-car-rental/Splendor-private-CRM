import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const apiEntrypoint = readFileSync(new URL('../api/index.ts', import.meta.url), 'utf8');
const apiHandler = readFileSync(new URL('../api/handler.ts', import.meta.url), 'utf8');
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const vercelConfig = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
const premiumCss = readFileSync(new URL('../src/premium-sapphire.css', import.meta.url), 'utf8');

describe('production serverless entrypoint', () => {
  it('statically imports one Node ESM build artifact beside the Vercel entrypoint', () => {
    expect(apiEntrypoint).toContain("import bundledHandler from './api-handler.mjs'");
    expect(apiEntrypoint).not.toContain('createRequire(');
    expect(apiEntrypoint).not.toContain("from '../server.ts'");
    expect(apiEntrypoint).not.toContain("from '../server.js'");
    expect(apiEntrypoint).not.toContain("api-handler.cjs");
  });

  it('normalizes the Node/Vercel pathname before pre-Express route dispatch', () => {
    expect(apiEntrypoint).toContain('function ensureRequestPath(req: Request)');
    expect(apiEntrypoint).toContain("new URL(rawUrl, 'http://splendor.internal').pathname");
    expect(apiEntrypoint).toContain("Object.defineProperty(target, 'path'");
    expect(apiEntrypoint).toContain('dispatch(ensureRequestPath(req), res)');
  });

  it('builds the complete API handler as Node 22 ESM to support ESM-only runtime dependencies', () => {
    expect(packageJson).toContain('esbuild api/handler.ts --bundle');
    expect(packageJson).toContain('--target=node22 --format=esm');
    expect(packageJson).toContain('--outfile=api/api-handler.mjs');
    expect(apiHandler).toContain("import app from '../server.js';");
    expect(vercelConfig).toContain('"includeFiles": "{api/api-handler.mjs,dist/**}"');
  });
});

describe('production Arabic application shell', () => {
  it('does not permit arbitrary letter-by-letter Arabic wrapping', () => {
    expect(premiumCss).not.toContain('overflow-wrap: anywhere');
    expect(premiumCss).toContain('overflow-wrap: break-word');
  });

  it('keeps horizontal tab buttons readable instead of shrinking them', () => {
    expect(premiumCss).toContain('main .overflow-x-auto > .flex.min-w-max > button');
    expect(premiumCss).toContain('white-space: nowrap');
    expect(premiumCss).toContain('min-width: max-content');
  });

  it('uses the main pane as the explicit vertical wheel/touch scroll container', () => {
    expect(premiumCss).toContain('#root main');
    expect(premiumCss).toContain('overflow-y: auto');
    expect(premiumCss).toContain('touch-action: pan-y');
  });
});
