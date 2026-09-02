import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Vercel serverless runtime packaging', () => {
  it('delegates the customer security guard through the generated Node ESM bundle', () => {
    const guard = read('api/customers-guard.ts');
    expect(guard).toContain("import bundledHandler from './api-handler.mjs'");
    expect(guard).not.toContain("import app from '../server.js'");
    expect(guard).toContain("value: '/api/customers'");
  });

  it('packages the generated API bundle with both Vercel entry functions that depend on it', () => {
    const config = JSON.parse(read('vercel.json'));
    expect(config.functions['api/index.ts']?.includeFiles).toContain('api/api-handler.mjs');
    expect(config.functions['api/customers-guard.ts']?.includeFiles).toContain('api/api-handler.mjs');
  });
});
