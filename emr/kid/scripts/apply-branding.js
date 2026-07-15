#!/usr/bin/env node
/**
 * Reads clinic-branding.env (one place to edit) and replaces every
 * `__TOKEN__` placeholder found across this project's files with the
 * matching value. Safe to re-run any time you edit clinic-branding.env
 * -- it only touches files that still contain a `__TOKEN__` placeholder.
 *
 * Plain Node.js only -- no new dependencies.
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const projectRoot = join(import.meta.dirname, '..');
const branddingFile = join(projectRoot, 'clinic-branding.env');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel', '.impeccable', 'migration-logs']);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip'
]);

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

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }

    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (BINARY_EXTENSIONS.has(extname(entry).toLowerCase())) {
      continue;
    }

    if (fullPath === import.meta.filename || fullPath === branddingFile) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function applyReplacements(answers) {
  const filledKeys = Object.keys(answers).filter((key) => answers[key]);

  if (filledKeys.length === 0) {
    return { filesChanged: 0, replacementsMade: 0, skipped: Object.keys(answers) };
  }

  const files = walk(projectRoot);
  const tokenPattern = new RegExp(filledKeys.map((key) => `__${key}__`).join('|'), 'g');

  let filesChanged = 0;
  let replacementsMade = 0;

  for (const filePath of files) {
    let content;

    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    if (!content.includes('__') || !tokenPattern.test(content)) {
      continue;
    }

    tokenPattern.lastIndex = 0;

    const updated = content.replace(tokenPattern, (match) => {
      const key = match.slice(2, -2);
      replacementsMade += 1;
      return answers[key] ?? match;
    });

    if (updated !== content) {
      writeFileSync(filePath, updated, 'utf-8');
      filesChanged += 1;
    }
  }

  const skipped = Object.keys(answers).filter((key) => !answers[key]);
  return { filesChanged, replacementsMade, skipped };
}

function main() {
  const answers = parseEnvFile(branddingFile);
  const { filesChanged, replacementsMade, skipped } = applyReplacements(answers);

  console.log(`Replaced ${replacementsMade} placeholder occurrence(s) across ${filesChanged} file(s).`);

  if (skipped.length > 0) {
    console.log(`\nLeft blank in clinic-branding.env (unchanged in files): ${skipped.join(', ')}`);
  }

  console.log('\nDone. Re-run this any time you edit clinic-branding.env.');
}

main();
