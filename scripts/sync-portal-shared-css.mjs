import { existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharedSource = resolve(repoRoot, 'shared', 'portal-shared.css');
const kidTarget = resolve(repoRoot, 'emr', 'kid', 'portal-shared.css');

if (!existsSync(sharedSource)) {
  console.log('No shared/portal-shared.css source found; skipping sync.');
  process.exit(0);
}

copyFileSync(sharedSource, kidTarget);
console.log('Synced portal-shared.css from shared/ into emr/kid/.');
