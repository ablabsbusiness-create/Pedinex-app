#!/usr/bin/env node
/**
 * One-command setup for the EMR template: asks for clinic branding, the
 * clinic-staff password, and (optionally) Firebase / MSG91 values, then:
 *
 *   - brands every page (same __TOKEN__ replacement as setup-template.js)
 *   - generates CLINIC_SESSION_SECRET / PATIENT_SESSION_SECRET for you
 *   - writes a ready-to-use .env
 *   - if the Firebase CLI is installed and logged in, offers to pull the
 *     web app config automatically instead of you copy-pasting 7 values
 *   - if the Firebase CLI is available, offers to deploy the Firestore /
 *     Storage security rules immediately
 *
 * Run it with `npm run quickstart`. Safe to re-run — it only overwrites
 * fields you answer; leaving something blank keeps the placeholder so
 * you can fill it in later (by hand, or by re-running this script).
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyReplacements } from './lib/replace-tokens.mjs';

const projectRoot = join(import.meta.dirname, '..');
const envPath = join(projectRoot, '.env');
const envExamplePath = join(projectRoot, '.env.example');

const BRANDING_QUESTIONS = [
  { key: 'CLINIC_NAME', prompt: 'Clinic name (e.g. "Sunrise Pediatric Clinic"): ' },
  { key: 'CLINIC_SHORT_NAME', prompt: 'Clinic short code for patient IDs, e.g. "SPC" (letters/numbers only): ' },
  { key: 'DOCTOR_NAME', prompt: 'Doctor name (e.g. "Dr. Jane Doe"): ' },
  { key: 'CLINIC_PHONE', prompt: 'Clinic phone number (e.g. "+911234567890"): ' },
  { key: 'CLINIC_ADDRESS', prompt: 'Clinic address (single line, e.g. "12 Main Street, Springfield"): ' },
  { key: 'CLINIC_EMAIL', prompt: 'Clinic contact email: ' },
  { key: 'CLINIC_DOMAIN', prompt: 'Clinic domain, no protocol (e.g. "example.com"): ' },
  { key: 'WHATSAPP_NUMBER', prompt: 'WhatsApp number for clinic alerts, digits only with country code (e.g. "911234567890"): ' }
];

const FIREBASE_CONFIG_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID'
];

function randomHex(bytes) {
  return randomBytes(bytes).toString('hex');
}

function randomPassword() {
  return randomBytes(9).toString('base64url');
}

function hasCommand(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [cmd], { stdio: 'ignore', shell: process.platform === 'win32' });
  return result.status === 0;
}

/** Best-effort parse of `firebase apps:sdkconfig web <appId>`'s JS-module output. */
function parseFirebaseSdkConfig(output) {
  const config = {};
  const fieldMap = {
    apiKey: 'VITE_FIREBASE_API_KEY',
    authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID',
    storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'VITE_FIREBASE_APP_ID',
    measurementId: 'VITE_FIREBASE_MEASUREMENT_ID'
  };

  for (const [jsKey, envKey] of Object.entries(fieldMap)) {
    const match = output.match(new RegExp(`${jsKey}:\\s*"([^"]*)"`));
    if (match) {
      config[envKey] = match[1];
    }
  }

  return config;
}

async function tryFetchFirebaseConfigViaCli(rl) {
  if (!hasCommand('firebase')) {
    return null;
  }

  const useCli = (await rl.question(
    '\nFirebase CLI detected. Do you already have a Firebase project + Web app\n' +
    'registered, and want this script to pull the config automatically instead\n' +
    'of pasting it by hand? (y/N): '
  )).trim().toLowerCase();

  if (useCli !== 'y' && useCli !== 'yes') {
    return null;
  }

  const projectId = (await rl.question('Firebase project ID: ')).trim();
  if (!projectId) {
    console.log('No project ID given, skipping auto-fetch.');
    return null;
  }

  const appsList = spawnSync('firebase', ['apps:list', 'web', '--project', projectId], {
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  });

  if (appsList.status !== 0) {
    console.log('Could not list Firebase web apps for that project (are you logged in with `firebase login`?).');
    console.log(appsList.stderr || appsList.stdout || '');
    return null;
  }

  console.log(appsList.stdout);
  const appId = (await rl.question('Paste the Web App ID to use from the list above: ')).trim();
  if (!appId) {
    console.log('No app ID given, skipping auto-fetch.');
    return null;
  }

  const sdkConfig = spawnSync('firebase', ['apps:sdkconfig', 'web', appId, '--project', projectId], {
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  });

  if (sdkConfig.status !== 0) {
    console.log('Could not fetch the SDK config automatically. Falling back to manual entry.');
    console.log(sdkConfig.stderr || sdkConfig.stdout || '');
    return null;
  }

  const parsed = parseFirebaseSdkConfig(sdkConfig.stdout);
  parsed.FIREBASE_PROJECT_ID = projectId;
  parsed.FIREBASE_STORAGE_BUCKET = parsed.VITE_FIREBASE_STORAGE_BUCKET;

  const gotAllCore = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']
    .every((key) => parsed[key]);

  if (!gotAllCore) {
    console.log('Could not parse all config fields automatically. You may need to fill some in by hand.');
  } else {
    console.log('Firebase config pulled automatically.');
  }

  return parsed;
}

async function promptFirebaseConfigManually(rl) {
  console.log('\nFirebase web app config (Firebase Console > Project settings > Your apps).');
  console.log('Press Enter to leave any of these blank and fill them in later.\n');

  const answers = {};
  for (const key of FIREBASE_CONFIG_KEYS) {
    // eslint-disable-next-line no-await-in-loop
    answers[key] = (await rl.question(`${key}: `)).trim();
  }

  answers.FIREBASE_PROJECT_ID = answers.VITE_FIREBASE_PROJECT_ID;
  answers.FIREBASE_STORAGE_BUCKET = answers.VITE_FIREBASE_STORAGE_BUCKET;

  const wantsServiceAccount = (await rl.question(
    '\nDo you have a Firebase service account key JSON ready to paste in? (y/N): '
  )).trim().toLowerCase();

  if (wantsServiceAccount === 'y' || wantsServiceAccount === 'yes') {
    answers.FIREBASE_SERVICE_ACCOUNT_KEY = (await rl.question(
      'Paste the service account JSON on one line (or base64-encoded): '
    )).trim();
  }

  return answers;
}

async function promptMsg91(rl) {
  const wantsPortal = (await rl.question(
    '\nUse the patient portal phone-OTP login (needs an MSG91 account)? (y/N): '
  )).trim().toLowerCase();

  if (wantsPortal !== 'y' && wantsPortal !== 'yes') {
    return {};
  }

  console.log('Sign up at https://msg91.com, create an OTP Widget, and paste the values below.');
  console.log('Leave blank to fill in later — the rest of the EMR works without this.\n');

  return {
    MSG91_AUTH_KEY: (await rl.question('MSG91_AUTH_KEY: ')).trim(),
    VITE_MSG91_WIDGET_ID: (await rl.question('VITE_MSG91_WIDGET_ID: ')).trim(),
    VITE_MSG91_TOKEN_AUTH: (await rl.question('VITE_MSG91_TOKEN_AUTH: ')).trim()
  };
}

function writeEnvFile(values) {
  const example = readFileSync(envExamplePath, 'utf-8');
  const lines = example.split(/\r?\n/).map((line) => {
    const eq = line.indexOf('=');
    if (line.startsWith('#') || eq === -1) {
      return line;
    }

    const key = line.slice(0, eq).trim();
    if (Object.prototype.hasOwnProperty.call(values, key) && values[key]) {
      return `${key}=${values[key]}`;
    }

    return line;
  });

  writeFileSync(envPath, lines.join('\n'), 'utf-8');
}

async function maybeDeployRules(rl, firebaseProjectId) {
  if (!hasCommand('firebase') || !firebaseProjectId) {
    return;
  }

  const deploy = (await rl.question(
    '\nDeploy firestore.rules / storage.rules to this Firebase project now via the\n' +
    'Firebase CLI? Requires `firebase login` to already be done. (y/N): '
  )).trim().toLowerCase();

  if (deploy !== 'y' && deploy !== 'yes') {
    return;
  }

  console.log('\nRunning: firebase deploy --only firestore:rules,storage:rules ...');
  const result = spawnSync(
    'firebase',
    ['deploy', '--only', 'firestore:rules,storage:rules', '--project', firebaseProjectId],
    { stdio: 'inherit', cwd: projectRoot, shell: process.platform === 'win32' }
  );

  if (result.status !== 0) {
    console.log('\nRule deploy failed or was skipped. You can publish the rules by hand later —');
    console.log('see README.md, or re-run: firebase deploy --only firestore:rules,storage:rules');
  } else {
    console.log('\nSecurity rules deployed.');
  }
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('EMR Template Quickstart');
  console.log('=======================');
  console.log('This walks through branding, secrets, and (optionally) Firebase / MSG91');
  console.log('config in one pass. Leave anything blank to fill in later.\n');

  const branding = {};
  for (const question of BRANDING_QUESTIONS) {
    // eslint-disable-next-line no-await-in-loop
    branding[question.key] = (await rl.question(question.prompt)).trim();
  }

  let firebaseValues = await tryFetchFirebaseConfigViaCli(rl);
  if (!firebaseValues) {
    firebaseValues = await promptFirebaseConfigManually(rl);
  }

  const passwordAnswer = (await rl.question(
    '\nClinic staff login password (press Enter to auto-generate one): '
  )).trim();
  const clinicPassword = passwordAnswer || randomPassword();

  const msg91Values = await promptMsg91(rl);

  const envValues = {
    ...firebaseValues,
    CLINIC_ACCESS_PASSWORD: clinicPassword,
    CLINIC_SESSION_SECRET: randomHex(32),
    PATIENT_SESSION_SECRET: randomHex(32),
    ...msg91Values
  };

  if (existsSync(envPath)) {
    const overwrite = (await rl.question('\n.env already exists. Overwrite it? (y/N): ')).trim().toLowerCase();
    if (overwrite !== 'y' && overwrite !== 'yes') {
      console.log('Leaving existing .env untouched.');
    } else {
      writeEnvFile(envValues);
      console.log('.env written.');
    }
  } else {
    writeEnvFile(envValues);
    console.log('\n.env written.');
  }

  if (!passwordAnswer) {
    console.log(`Generated clinic staff password: ${clinicPassword}`);
    console.log('(also saved in .env as CLINIC_ACCESS_PASSWORD — write it down for your staff)');
  }

  const skipFiles = new Set([import.meta.filename]);
  const { filesChanged, replacementsMade } = applyReplacements(projectRoot, branding, skipFiles);
  console.log(`\nBranding applied: replaced ${replacementsMade} placeholder occurrence(s) across ${filesChanged} file(s).`);

  await maybeDeployRules(rl, firebaseValues.FIREBASE_PROJECT_ID);

  rl.close();

  console.log('\nWhat\'s left');
  console.log('============');
  if (!firebaseValues.VITE_FIREBASE_API_KEY) {
    console.log('- Create a Firebase project (Firestore + Storage enabled) and fill in the');
    console.log('  VITE_FIREBASE_* values in .env — see README.md step 4.');
  }
  if (!firebaseValues.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.log('- Add FIREBASE_SERVICE_ACCOUNT_KEY to .env (Firebase Console > Project');
    console.log('  settings > Service accounts > Generate new private key).');
  }
  console.log('- If rules weren\'t deployed above, publish firebase/firestore.rules and');
  console.log('  firebase/storage.rules by hand (README.md step 5).');
  if (!msg91Values.MSG91_AUTH_KEY) {
    console.log('- Sign up at msg91.com if you want the patient portal OTP login.');
  }
  console.log('- Run `npm run dev` to start local development.');
  console.log('- Push this folder to Git, import it into Vercel (Root Directory = this');
  console.log('  folder), copy the same env vars into Vercel project settings, and deploy.');
  console.log('  (`npm run vercel:env` can push your .env into a linked Vercel project for you.)');
  console.log('\nSee README.md for the full walkthrough.\n');
}

main().catch((error) => {
  console.error('Quickstart failed:', error);
  process.exitCode = 1;
});
