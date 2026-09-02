import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const docsIndex = readFileSync(new URL('../docs/README.md', import.meta.url), 'utf8');
const governancePolicy = readFileSync(new URL('../docs/governance/DOCUMENT_GOVERNANCE_POLICY.md', import.meta.url), 'utf8');
const adrPolicy = readFileSync(new URL('../docs/governance/ADR_POLICY.md', import.meta.url), 'utf8');
const legacyMap = readFileSync(new URL('../docs/governance/LEGACY_DECISION_MAP.md', import.meta.url), 'utf8');

function markdownFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...markdownFiles(path));
    else if (entry.endsWith('.md')) files.push(path);
  }
  return files;
}

describe('repository document governance', () => {
  it('declares GitHub repository content as the permanent source of truth', () => {
    expect(governancePolicy).toContain('single permanent source of truth');
    expect(governancePolicy).toContain('No conversation or Work artifact overrides an accepted repository decision');
    expect(docsIndex).toContain('The GitHub repository is the single permanent source of truth');
  });

  it('preserves the complete ADR status lifecycle and does not allocate a new ADR number yet', () => {
    for (const status of ['Proposed', 'Accepted', 'Deferred', 'Rejected', 'Superseded', 'Deprecated']) {
      expect(adrPolicy).toContain(status);
    }
    expect(adrPolicy).toContain('allocates **no ADR number**');
    expect(legacyMap).toContain('DECISION-01');
    expect(legacyMap).toContain('DECISION-12');
    expect(legacyMap).toContain('A new repository-wide ADR sequence is **not yet allocated**');
  });

  it('requires professional validation before accepting UAE tax decisions', () => {
    expect(governancePolicy).toContain('appropriate UAE tax-professional validation is mandatory');
    expect(governancePolicy).toContain('All new tax ADRs begin as **Proposed**');
    expect(adrPolicy).toContain('Tax ADRs start as Proposed');
    expect(docsIndex).toContain('not currently classified as VAT-return or Corporate-Tax filing-ready');
  });

  it('requires accepted tax documents to carry source and validator traceability once tax-compliance docs exist', () => {
    const taxRoot = new URL('../docs/tax-compliance/', import.meta.url);
    if (!existsSync(taxRoot)) return;

    for (const file of markdownFiles(taxRoot.pathname)) {
      const text = readFileSync(file, 'utf8');
      if (!/Status:\s*\*\*Accepted\*\*/i.test(text)) continue;
      expect(text, `${file} is Accepted without an official-source field`).toMatch(/Official source:/i);
      expect(text, `${file} is Accepted without a professional-validator field`).toMatch(/Professional validator:/i);
      expect(text, `${file} is Accepted without an effective-date field`).toMatch(/Effective date:/i);
    }
  });
});
