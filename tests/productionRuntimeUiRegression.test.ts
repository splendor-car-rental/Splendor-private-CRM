import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const apiEntrypoint = readFileSync(new URL('../api/index.ts', import.meta.url), 'utf8');
const apiHandler = readFileSync(new URL('../src/server/vercelAppHandler.ts', import.meta.url), 'utf8');
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const vercelConfig = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
const premiumCss = readFileSync(new URL('../src/premium-sapphire.css', import.meta.url), 'utf8');
const scrollCss = readFileSync(new URL('../src/scroll-ownership.css', import.meta.url), 'utf8');
const mainEntry = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../src/components/auth/AuthScreens.tsx', import.meta.url), 'utf8');

describe('production serverless entrypoint', () => {
  it('statically imports one Node ESM build artifact beside the Vercel entrypoint', () => {
    expect(apiEntrypoint).toContain("import bundledHandler from '../dist/api-handler.mjs'");
    expect(apiEntrypoint).not.toContain('createRequire(');
    expect(apiEntrypoint).not.toContain("from '../server.ts'");
    expect(apiEntrypoint).not.toContain("from '../server.js'");
    expect(apiEntrypoint).not.toContain("api-handler.cjs");
  });

  it('normalizes the Node/Vercel pathname before pre-Express route dispatch', () => {
    expect(apiEntrypoint).toContain('function ensureRequestPath(req: Request)');
    expect(apiEntrypoint).toContain("new URL(rawUrl, 'http://splendor.internal').pathname");
    expect(apiEntrypoint).toContain("Object.defineProperty(target, 'path'");
    expect(apiEntrypoint).toContain('const normalized = ensureRequestPath(req)');
    expect(apiEntrypoint).toContain('dispatch(enforceOwnerBusinessPolicies(normalized), res)');
  });

  it('builds the complete API handler as Node 22 ESM to support ESM-only runtime dependencies', () => {
    expect(packageJson).toContain('esbuild src/server/vercelAppHandler.ts --bundle');
    expect(packageJson).toContain('--target=node22 --format=esm');
    expect(packageJson).toContain('--outfile=dist/api-handler.mjs');
    expect(apiHandler).toContain("import app from '../../server.js';");
    expect(vercelConfig).toContain('"includeFiles": "dist/**"');
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
    expect(app).toContain('data-testid="main-scroll-viewport"');
    expect(app).toContain('h-dvh min-h-0 overflow-hidden');
    expect(app).toContain('flex-1 min-h-0 w-full min-w-0 overflow-y-auto');
    expect(scrollCss).toContain('[data-testid="main-scroll-viewport"]');
    expect(scrollCss).toContain('touch-action: pan-y');
    expect(scrollCss).toContain('-webkit-overflow-scrolling: touch');
  });

  it('gives the sidebar its own bounded scroll viewport and locks the document behind the mobile drawer', () => {
    expect(sidebar).toContain('data-testid="sidebar-shell"');
    expect(sidebar).toContain('data-testid="sidebar-scroll-viewport"');
    expect(sidebar).toContain('flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y');
    expect(sidebar).toContain("html.style.overflow = 'hidden'");
    expect(sidebar).toContain("body.style.overflow = 'hidden'");
    expect(sidebar).toContain('previousHtmlOverflow');
    expect(sidebar).toContain('previousBodyOverflow');
    expect(scrollCss).toContain('[data-testid="sidebar-scroll-viewport"]');
    expect(scrollCss).toContain('height: 100dvh !important');
  });

  it('keeps the login form reachable on short screens instead of allowing the app-shell overflow rule to clip it', () => {
    expect(auth).toContain('data-testid="login-scroll-viewport"');
    expect(auth).toContain('h-full min-h-0 w-full overflow-y-auto overflow-x-hidden');
    expect(auth).not.toContain('my-auto');
    expect(scrollCss).toContain('#root > [data-testid="login-scroll-viewport"]');
    expect(scrollCss).toContain('overflow-y: auto !important');
    const premiumImport = mainEntry.indexOf("import './premium-sapphire.css'");
    const scrollImport = mainEntry.indexOf("import './scroll-ownership.css'");
    expect(premiumImport).toBeGreaterThan(-1);
    expect(scrollImport).toBeGreaterThan(premiumImport);
  });
});
