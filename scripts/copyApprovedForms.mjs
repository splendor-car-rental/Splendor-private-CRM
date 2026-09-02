import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const formsSource = join(process.cwd(), 'docs', 'approved-forms');
const formsTarget = join(process.cwd(), 'dist', 'approved-forms');
const sealSource = join(process.cwd(), 'public', 'assets', 'approved', 'splendor-official-seal.svg');
const sealTargetDir = join(process.cwd(), 'dist', 'assets', 'approved');
const sealTarget = join(sealTargetDir, 'splendor-official-seal.svg');

if (!existsSync(formsSource)) throw new Error(`Approved forms directory not found: ${formsSource}`);
const pdfs = readdirSync(formsSource).filter(name => name.toLowerCase().endsWith('.pdf'));
if (pdfs.length !== 16) throw new Error(`Expected exactly 16 approved PDF masters; found ${pdfs.length}.`);
for (const name of pdfs) {
  const size = statSync(join(formsSource, name)).size;
  if (size <= 0) throw new Error(`Approved PDF master is empty: ${name}`);
}

if (!existsSync(sealSource) || statSync(sealSource).size <= 0) {
  throw new Error(`Approved corporate seal is missing or empty: ${sealSource}`);
}

mkdirSync(formsTarget, { recursive: true });
cpSync(formsSource, formsTarget, { recursive: true, force: true, preserveTimestamps: true });
mkdirSync(sealTargetDir, { recursive: true });
cpSync(sealSource, sealTarget, { force: true, preserveTimestamps: true });

console.log(`[approved-assets] copied ${pdfs.length} immutable PDF masters and the approved corporate seal into dist`);
