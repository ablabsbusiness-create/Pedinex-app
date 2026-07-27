#!/usr/bin/env node
/**
 * Non-interactive alternative to setup-template.js: reads
 * clinic-branding.env (copy clinic-branding.env.example to create it)
 * and replaces every `__TOKEN__` placeholder found across this
 * project's files with the matching value. Safe to re-run any time you
 * edit clinic-branding.env -- it only touches files that still contain
 * a `__TOKEN__` placeholder.
 *
 * Plain Node.js only -- no new dependencies.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyReplacements } from './lib/replace-tokens.mjs';

const projectRoot = join(import.meta.dirname, '..');
const brandingFile = join(projectRoot, 'clinic-branding.env');
const brandingExampleFile = join(projectRoot, 'clinic-branding.env.example');

function parseEnvFile(path) {
  const content = readFileSync(path, 'utf-8');
  const answers = {};

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
    answers[key] = value;
  }

  return answers;
}

function main() {
  if (!existsSync(brandingFile)) {
    console.error('clinic-branding.env not found.');
    console.error('Copy clinic-branding.env.example to clinic-branding.env, fill in your');
    console.error('clinic details, then run this script again.');
    process.exitCode = 1;
    return;
  }

  const answers = parseEnvFile(brandingFile);
  const skipFiles = new Set([import.meta.filename, brandingFile, brandingExampleFile]);
  const { filesChanged, replacementsMade, skipped } = applyReplacements(projectRoot, answers, skipFiles);

  console.log(`Replaced ${replacementsMade} placeholder occurrence(s) across ${filesChanged} file(s).`);

  if (skipped.length > 0) {
    console.log(`\nLeft blank in clinic-branding.env (unchanged in files): ${skipped.join(', ')}`);
  }

  console.log('\nDone. Re-run this any time you edit clinic-branding.env.');
}

main();
