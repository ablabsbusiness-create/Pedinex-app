#!/usr/bin/env node
/**
 * Pushes every filled-in value from .env into a linked Vercel project's
 * "production" environment, using the Vercel CLI. Requires `vercel` to be
 * installed, logged in (`vercel login`), and this folder linked to a
 * project (`vercel link`).
 *
 * Skips keys that still look like placeholders (e.g. "your-api-key",
 * "change-this-password") so you don't accidentally push template
 * defaults into a real deployment. Existing values for a key in Vercel
 * are removed first so this is safe to re-run.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = join(import.meta.dirname, '..');
const envPath = join(projectRoot, '.env');
const ENVIRONMENT = process.argv[2] || 'production';

const PLACEHOLDER_MARKERS = ['your-', 'change-this', 'replace-with', 'paste-the'];

function isPlaceholder(value) {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

function parseEnvFile(path) {
  const content = readFileSync(path, 'utf-8');
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (value && !isPlaceholder(value)) {
      values[key] = value;
    }
  }

  return values;
}

function main() {
  if (!existsSync(envPath)) {
    console.error('.env not found. Run `npm run quickstart` first.');
    process.exitCode = 1;
    return;
  }

  const values = parseEnvFile(envPath);
  const keys = Object.keys(values);

  if (keys.length === 0) {
    console.log('No filled-in values found in .env — nothing to push.');
    return;
  }

  console.log(`Pushing ${keys.length} variable(s) to Vercel (${ENVIRONMENT})...`);

  for (const key of keys) {
    // Remove any existing value first (vercel env add fails if one exists).
    spawnSync('vercel', ['env', 'rm', key, ENVIRONMENT, '--yes'], {
      stdio: 'ignore',
      cwd: projectRoot,
      shell: process.platform === 'win32'
    });

    const result = spawnSync('vercel', ['env', 'add', key, ENVIRONMENT], {
      input: values[key],
      stdio: ['pipe', 'inherit', 'inherit'],
      cwd: projectRoot,
      shell: process.platform === 'win32'
    });

    if (result.status !== 0) {
      console.log(`Failed to set ${key} — you may need to \`vercel link\` this folder first, or set it by hand.`);
    }
  }

  console.log('\nDone. Re-run this any time your .env changes, or with a different target,');
  console.log('e.g. `npm run vercel:env -- preview`.');
}

main();
