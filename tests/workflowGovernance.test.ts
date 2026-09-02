import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const retiredWorkflowPaths = [
  '../.github/workflows/pr47-finance-contextual-documents.yml',
  '../.github/workflows/pr47-wire-approved-composer.yml'
];

describe('retired self-mutating workflow safety', () => {
  for (const relativePath of retiredWorkflowPaths) {
    it(`${relativePath} is manual and read-only`, () => {
      const workflow = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(workflow).toContain('workflow_dispatch');
      expect(workflow).toContain('contents: read');
      expect(workflow).not.toContain('contents: write');
      expect(workflow).not.toContain('git push');
      expect(workflow).not.toContain('git commit');
      expect(workflow).not.toContain('actions/checkout');
    });
  }
});
