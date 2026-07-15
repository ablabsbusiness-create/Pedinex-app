# PediaNex EMR (emr/kid)

This is the live, deployed clinic EMR for **PediaNex** — a Vite static
frontend plus Vercel serverless functions, backed by its own isolated
Firebase project (Firestore + Storage) and MSG91 (patient portal phone OTP).

- **Live URL:** <https://pedinex-app.vercel.app>
- **GitHub repo:** `ablabsbusiness-create/Pedinex-app` (public), branch `main`
- **Vercel project:** `pedinex-app` (team `ablabsbusiness-1207s-projects`),
  Root Directory = `emr/kid`
- **Firebase project:** isolated project ("PediaNex-Trial" at time of
  writing) — **not** shared with any other clinic's data

This app was originally copied from `emr/template` (the reusable base for
onboarding new clinics — see `../template/README.md`). Everything below
documents this specific deployment's setup and the tooling added on top.

## Clinic branding — one file to edit

Branding text across every page (`__CLINIC_NAME__`, `__DOCTOR_NAME__`, etc.)
is filled in from a single file: **`clinic-branding.env`**.

1. Edit `clinic-branding.env` (plain `KEY=value` lines — `CLINIC_NAME`,
   `CLINIC_SHORT_NAME`, `DOCTOR_NAME`, `CLINIC_PHONE`, `CLINIC_ADDRESS`,
   `CLINIC_EMAIL`, `CLINIC_DOMAIN`, `WHATSAPP_NUMBER`).
2. Run `node scripts/apply-branding.js` — or just double-click
   **`PediaNex - App apply-branding.bat`** on the Desktop, which does the
   same thing from this folder. It's safe to re-run any time; it only
   touches files that still contain a `__TOKEN__` placeholder for a value
   you've now filled in.
3. Commit, push, and let Vercel redeploy for it to go live.

`CLINIC_SHORT_NAME` is also used as the Firestore/Storage namespace
(`clinics/<short-name>/...`) and the patient-ID prefix — if you ever change
it, you also need to update `firebase/firestore.rules` and
`firebase/storage.rules` (see below) and republish them, since those are
scoped to the specific short name currently in use, not read dynamically
from `clinic-branding.env`.

## Firestore & Storage security rules

Rules live in `firebase/firestore.rules` and `firebase/storage.rules`,
scoped to whatever `CLINIC_SHORT_NAME` this app currently uses (`clinics/kid`
at time of writing — the app's internal namespace, independent of the
`CLINIC_SHORT_NAME` used for the patient-ID prefix). They allow read/write
within that namespace and deny everything else — the same "open within
namespace" model production clinics use elsewhere in this org.

**These files are not deployed automatically.** To publish them to Firebase:

- Double-click **`PediaNex - App deploy-rules.bat`** on the Desktop. First
  run opens Firebase's interactive project picker (`firebase use --add`) so
  you select the right Firebase project — after that, every run deploys
  straight away. Requires being logged into the Firebase account that owns
  the project (it'll prompt a browser login the first time).
- Or manually: Firebase Console → your project → **Firestore Database →
  Rules** → paste `firebase/firestore.rules` → Publish, then **Storage →
  Rules** → paste `firebase/storage.rules` → Publish.

Without published rules, the app fails with `Missing or insufficient
permissions` when loading patient records — this already happened once
during setup and was traced to the wrong (template) rules being pasted in
by mistake, see "Known issues already fixed" below.

⚠️ **Do not paste `emr/template/firebase/*.rules`** into this project's
Firebase console — those use the literal placeholder
`clinics/__CLINIC_SHORT_NAME__`, which will never match anything and denies
all access. Always use the rules in **this** folder's `firebase/` directory.

## Environment variables (set in Vercel, not committed)

This repo is **public**, so no real secrets live in this README or in any
committed `.env` file — only `.env.example` / `.env.vercel.example` are
checked in. The actual values are set in Vercel → Project Settings →
Environment Variables:

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
  `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`,
  `VITE_FIREBASE_MEASUREMENT_ID` — from the Firebase web app config.
- `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`,
  `FIREBASE_SERVICE_ACCOUNT_KEY` — used server-side by `/api` routes via the
  Firebase Admin SDK.
- `CLINIC_ACCESS_PASSWORD` — the staff login password for `/password`.
- `CLINIC_SESSION_SECRET`, `PATIENT_SESSION_SECRET` — long random secrets
  signing the staff and patient session cookies. Generate with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `VITE_MSG91_WIDGET_ID`, `VITE_MSG91_TOKEN_AUTH`, `MSG91_AUTH_KEY` — only if
  the patient portal's phone-OTP login (MSG91, not Firebase phone auth) is
  in use.

For local dev, copy `.env.example` to `.env` and fill in the same values.

## Local development

```bash
npm install
npm run dev
```

Starts Vite at `http://localhost:5173`. The staff login (`/api/auth/login`,
`/api/auth/logout`) is emulated by a Vite dev-server plugin and works out of
the box. `/api/otp` and `/api/patients` are real Vercel serverless functions
and only run when served by Vercel — use `vercel dev` instead of `vite dev`
if you need to exercise the OTP flow or patient-ID allocation locally.

## Deploying

Push to `main` on GitHub — Vercel auto-deploys from there (Root Directory
`emr/kid`, build command `npm run build`, output directory `dist`, all
already set in `vercel.json` / Vercel project settings).

Desktop `.bat` shortcuts for this repo:

- **`PediaNex - App push.bat`** — commits and pushes the whole repo.
- **`PediaNex - App apply-branding.bat`** — applies `clinic-branding.env`
  (see above).
- **`PediaNex - App deploy-rules.bat`** — publishes the Firestore/Storage
  rules (see above).

## Post-deploy checklist

- [ ] Staff login at `/password` works with `CLINIC_ACCESS_PASSWORD`.
- [ ] Patient records load on `/search` without a "Missing or insufficient
      permissions" error (confirms Firestore rules are published correctly).
- [ ] Patient portal login at `/portal` sends and verifies an OTP (if MSG91
      is configured).
- [ ] Add a test patient from `/new-patient` and confirm the patient ID uses
      the right prefix.
- [ ] Generate a prescription PDF from `/prescription-growth-chart-dashboard`
      and a certificate PDF from `/certificates`.
- [ ] Growth chart rendering (WHO / IAP curves) displays correctly for a test
      patient with a couple of measurements.
- [ ] No page still shows a raw `__TOKEN__` placeholder (check `/password`,
      `/search`, `/settings` at minimum).

## Known issues already fixed (for reference)

- **Middleware build failure** — `middleware.js`'s `config.matcher` had an
  empty string as its first entry instead of `/` (Vercel requires every
  matcher value to start with `/`). Fixed.
- **Raw `__CLINIC_NAME__` text in production** — this app was copied from
  `emr/template` without running the branding step first, so it briefly
  shipped with unfilled placeholders visible to real users. Fixed via the
  `clinic-branding.env` workflow above.
- **"Missing or insufficient permissions" loading patients** — the
  Firestore/Storage rules pasted into the Firebase console were the
  *template's* rules (`clinics/__CLINIC_SHORT_NAME__`, a literal, never-
  matching path) instead of this app's own rules (`clinics/kid`). Fixed by
  publishing the rules from this folder's `firebase/` directory instead.

## What's in this folder

- `/api` — serverless functions for staff auth, patient-portal OTP auth,
  and patient creation/ID allocation.
- `lib/` — shared session and Firebase-init helpers used by both the
  frontend and the API routes.
- `firebase/` — Firestore/Storage security rules for this deployment (see
  above). `firebase.json` points the Firebase CLI at them.
- `clinic-branding.env` / `clinic-branding.env.example` — the single-file
  branding config (see above). `scripts/apply-branding.js` applies it.
- `scripts/ensure-iap-assets.mjs`, `scripts/render_growth_charts.py` — used
  at build/dev time to prepare growth chart assets; leave as-is.
