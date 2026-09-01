import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const source = join(process.cwd(), 'docs', 'approved-forms');
const target = join(process.cwd(), 'dist', 'approved-forms');

if (!existsSync(source)) throw new Error(`Approved forms directory not found: ${source}`);
const pdfs = readdirSync(source).filter(name => name.toLowerCase().endsWith('.pdf'));
if (pdfs.length !== 16) throw new Error(`Expected exactly 16 approved PDF masters; found ${pdfs.length}.`);
for (const name of pdfs) {
  const size = statSync(join(source, name)).size;
  if (size <= 0) throw new Error(`Approved PDF master is empty: ${name}`);
}
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, force: true, preserveTimestamps: true });
console.log(`[approved-forms] copied ${pdfs.length} immutable masters to dist/approved-forms`);
