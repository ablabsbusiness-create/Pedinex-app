#!/usr/bin/env node
/**
 * Interactive setup script for the EMR template.
 *
 * Prompts for clinic branding details and replaces every `__TOKEN__`
 * placeholder found in this project's files with the supplied value.
 *
 * Plain Node.js only — no new dependencies (uses `readline` and `fs`).
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const projectRoot = join(import.meta.dirname, '..');

// Directories to never walk into.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel']);

// Binary / asset file extensions to never open as text.
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip'
]);

const QUESTIONS = [
  { key: 'CLINIC_NAME', prompt: 'Clinic name (e.g. "Sunrise Pediatric Clinic"): ' },
  { key: 'CLINIC_SHORT_NAME', prompt: 'Clinic short code for patient IDs, e.g. "SPC" (letters/numbers only): ' },
  { key: 'DOCTOR_NAME', prompt: 'Doctor name (e.g. "Dr. Jane Doe"): ' },
  { key: 'CLINIC_PHONE', prompt: 'Clinic phone number (e.g. "+911234567890"): ' },
  { key: 'CLINIC_ADDRESS', prompt: 'Clinic address (single line, e.g. "12 Main Street, Springfield"): ' },
  { key: 'CLINIC_EMAIL', prompt: 'Clinic contact email: ' },
  { key: 'CLINIC_DOMAIN', prompt: 'Clinic domain, no protocol (e.g. "example.com"): ' },
  { key: 'WHATSAPP_NUMBER', prompt: 'WhatsApp number for clinic alerts, digits only with country code (e.g. "911234567890"): ' }
];

async function promptAnswers() {
  const rl = createInterface({ input: stdin, output: stdout });
  const answers = {};

  console.log('\nEMR Template Setup');
  console.log('===================');
  console.log('Answer the following questions to brand this copy of the template.');
  console.log('You can leave any answer blank and fill it in later by re-running this script.\n');

  for (const question of QUESTIONS) {
    // eslint-disable-next-line no-await-in-loop
    const answer = await rl.question(question.prompt);
    answers[question.key] = answer.trim();
  }

  rl.close();
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

    // Never rewrite this script itself mid-run.
    if (fullPath === import.meta.filename) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function applyReplacements(answers) {
  const files = walk(projectRoot);
  const tokenPattern = new RegExp(
    Object.keys(answers)
      .map((key) => `__${key}__`)
      .join('|'),
    'g'
  );

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

  return { filesChanged, replacementsMade };
}

function printNextSteps() {
  console.log('\nNext steps');
  console.log('==========');
  console.log('1. Create a new Firebase project at https://console.firebase.google.com');
  console.log('   - Enable Authentication (used for the clinic-staff password login session).');
  console.log('   - Enable Firestore (Native mode) for patient records, prescriptions, vaccinations.');
  console.log('   - Enable Storage for prescription/certificate PDFs.');
  console.log('   - Register a Web App and copy the firebaseConfig values.');
  console.log('2. Copy .env.example to .env and fill in the VITE_FIREBASE_* values plus');
  console.log('   CLINIC_ACCESS_PASSWORD and CLINIC_SESSION_SECRET.');
  console.log('   Generate a session secret with:');
  console.log('     node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.log('3. If you use the patient portal OTP login, sign up at https://msg91.com,');
  console.log('   create a Widget under OTP > Widgets, and add MSG91_AUTH_KEY,');
  console.log('   VITE_MSG91_WIDGET_ID, and VITE_MSG91_TOKEN_AUTH to your .env / Vercel project.');
  console.log('4. Run `npm run dev` to start local development.');
  console.log('5. Create a new Vercel project, set the Root Directory to this folder, and set');
  console.log('   all the same environment variables in the Vercel project settings.');
  console.log('6. Deploy, then test: patient portal login, adding a test patient, generating a');
  console.log('   prescription/certificate PDF, and growth chart rendering.');
  console.log('\nSee README.md for the full walkthrough.\n');
}

async function main() {
  const answers = await promptAnswers();
  const { filesChanged, replacementsMade } = applyReplacements(answers);

  console.log(`\nDone. Replaced ${replacementsMade} placeholder occurrence(s) across ${filesChanged} file(s).`);
  printNextSteps();
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exitCode = 1;
});
