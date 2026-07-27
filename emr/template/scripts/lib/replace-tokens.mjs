/**
 * Shared `__TOKEN__` placeholder replacement used by setup-template.js,
 * apply-branding.js, and quickstart.js.
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel', '.impeccable', 'migration-logs']);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip'
]);

function walk(dir, skipFiles, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }

    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walk(fullPath, skipFiles, files);
      continue;
    }

    if (BINARY_EXTENSIONS.has(extname(entry).toLowerCase())) {
      continue;
    }

    if (skipFiles.has(fullPath)) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

/**
 * Replaces every `__KEY__` occurrence across `projectRoot` with
 * `answers[KEY]`, for every key that has a non-empty value. Keys with an
 * empty/missing value are left untouched in the files and reported back
 * in `skipped` so callers can tell the user what's still unfilled.
 */
export function applyReplacements(projectRoot, answers, skipFiles = new Set()) {
  const filledKeys = Object.keys(answers).filter((key) => answers[key]);

  if (filledKeys.length === 0) {
    return { filesChanged: 0, replacementsMade: 0, skipped: Object.keys(answers) };
  }

  const files = walk(projectRoot, skipFiles);
  const tokenPattern = new RegExp(filledKeys.map((key) => `__${key}__`).join('|'), 'g');

  let filesChanged = 0;
  let replacementsMade = 0;

  for (const filePath of files) {
    let content;

    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue; // Skip unreadable files.
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
