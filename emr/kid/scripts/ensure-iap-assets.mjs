import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// This template ships with pre-generated growth-chart PNG assets in
// assets/iap-official-png and assets/who-official-png, so no build-time
// generation is required (the original emr/kid app could regenerate these
// from a Python script at the monorepo root, but that script hardcodes its
// output directory to emr/kid and would be unsafe to reuse from a
// standalone copy of this app). This script just verifies the assets are
// present and fails loudly if they were accidentally excluded from a copy.

const appDir = resolve(import.meta.dirname, '..');
const outputDir = resolve(appDir, 'assets', 'iap-official-png');
const whoOutputDir = resolve(appDir, 'assets', 'who-official-png');

let missing = false;

if (!existsSync(outputDir)) {
  console.error(`Missing growth chart assets: ${outputDir}`);
  missing = true;
}

if (!existsSync(whoOutputDir)) {
  console.error(`Missing growth chart assets: ${whoOutputDir}`);
  missing = true;
}

if (missing) {
  console.error(
    'Pre-generated IAP/WHO growth chart PNG assets are missing. ' +
    'Make sure assets/iap-official-png and assets/who-official-png were copied ' +
    'into this project.'
  );
  process.exit(1);
}

console.log('Growth chart assets found.');
