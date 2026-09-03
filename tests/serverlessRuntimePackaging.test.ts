import { readdirSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Vercel serverless runtime packaging', () => {
  it('stays within the Vercel Hobby limit of 12 Serverless Functions', () => {
    const functionExtensions = new Set(['.js', '.mjs', '.cjs', '.ts']);
    const functions = readdirSync(resolve(process.cwd(), 'api'), { withFileTypes: true })
      .filter(entry => entry.isFile() && functionExtensions.has(extname(entry.name)))
      .map(entry => entry.name);

    expect(functions).toHaveLength(12);
    expect(functions).not.toContain('api-handler.mjs');
    expect(functions).not.toContain('handler.ts');
    expect(functions).not.toContain('tax-compliance.ts');
  });

  it('delegates the customer security guard through the generated Node ESM bundle', () => {
    const guard = read('api/customers-guard.ts');
    expect(guard).toContain("import bundledHandler from '../dist/api-handler.mjs'");
    expect(guard).not.toContain("import app from '../server.js'");
    expect(guard).toContain("value: '/api/customers'");
  });

  it('packages the generated API bundle with both Vercel entry functions that depend on it', () => {
    const config = JSON.parse(read('vercel.json'));
    expect(config.functions['api/index.ts']?.includeFiles).toContain('dist/**');
    expect(config.functions['api/customers-guard.ts']?.includeFiles).toContain('dist/**');
  });
});
