# EMR Template

A reusable, standalone pediatric-style clinic EMR: patient portal with phone
OTP login, growth charts (WHO / IAP standards), prescriptions, vaccination
records, and printable certificates. It runs on Vite (static frontend) plus a
handful of Vercel serverless functions, backed by Firebase (Firestore +
Storage) and MSG91 (patient portal OTP).

This copy still contains `__TOKEN__` placeholders instead of real clinic
branding. Follow the steps below in order to turn it into a working clinic
deployment.

## Quickstart (recommended)

```bash
npm install
npm run quickstart
```

`quickstart` walks you through everything in one pass: clinic branding, the
staff login password, session secrets (generated for you — no separate
`node -e` command needed), and Firebase / MSG91 config. If you have the
[Firebase CLI](https://firebase.google.com/docs/cli) installed and already
logged in, it can also pull your Firebase web app config automatically and
deploy the security rules for you, instead of copy-pasting values out of the
console. It writes `.env` directly, so there's no separate "copy
`.env.example`" step.

What it can't do for you: creating the Firebase project itself (still a few
clicks in the console — see step 4 below) and signing up for MSG91 (a
third-party account, step 7). Everything else in this README is either
handled by `quickstart` or is here for people who want to do it step by step
instead (`npm run setup` / `npm run apply-branding` for branding only, see
step 3).

## 1. Copy this folder

Copy this `template` folder to its own location — either a new folder in this
same repo (e.g. `emr/<new-clinic-slug>`) or push it out as its own standalone
project/repo. Do this before running `npm install`, so `node_modules` isn't
duplicated into the copy.

## 2. Install dependencies

```bash
npm install
```

## 3. Fill in clinic branding

```bash
npm run setup
```

This prompts for the clinic name, short code (used as the patient-ID prefix,
e.g. `SPC0001`), doctor name, phone, address, email, domain, and WhatsApp
number, then replaces every `__TOKEN__` placeholder across the project with
your answers. You can re-run it any time to catch anything you left blank.

**Alternative — one file instead of prompts:** copy
`clinic-branding.env.example` to `clinic-branding.env`, fill in the same
values there, and run:

```bash
npm run apply-branding
```

This does the same placeholder replacement but reads from that single file
instead of asking questions — useful if you want to see/edit every value in
one place, or re-apply after changing one later. Both approaches are
interchangeable; use whichever is more convenient.

(`npm run quickstart` does this step for you too, along with everything
through step 6 below, in one pass.)

## 4. Create a Firebase project

1. Go to <https://console.firebase.google.com> and create a new project.
2. Enable **Authentication** — the clinic-staff login itself is a simple
   shared-password session (see step 5), so you don't need to configure a
   Firebase Auth provider unless you plan to extend the app; enabling the
   Authentication product in the console is still recommended so Firestore
   security rules and other Firebase tooling behave as expected.
3. Enable **Firestore Database** (Native mode, choose a region close to your
   clinic). This stores patients, prescriptions, vaccination records, and
   certificates.
4. Enable **Storage**. This stores prescription and certificate PDFs.
5. Register a **Web app** (Project settings > General > Your apps > Web) and
   copy the `firebaseConfig` values shown — you'll need these in step 5.
6. Generate a **service account key** (Project settings > Service accounts >
   Generate new private key) — the serverless API routes in `/api` use the
   Firebase Admin SDK to create patients and this key is how they
   authenticate. Keep this file secret; never commit it.

## 5. Deploy Firestore and Storage security rules

This template ships with security rules in `firebase/firestore.rules` and
`firebase/storage.rules`. They scope every read/write to this clinic's own
`clinics/__CLINIC_SHORT_NAME__` namespace and deny everything else — the same
model the original clinic deployment uses, just for a single tenant instead
of an allowlist of clinics. If you already ran `npm run setup` (step 3), the
`__CLINIC_SHORT_NAME__` placeholder in both files is already replaced with
your clinic's short code; if not, re-run `npm run setup` or edit the two
files by hand before deploying them.

**`firebase/firestore.rules`:**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /clinics/__CLINIC_SHORT_NAME__ {
      allow read, write: if true;
    }

    match /clinics/__CLINIC_SHORT_NAME__/{document=**} {
      allow read, write: if true;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**`firebase/storage.rules`:**

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /clinics/__CLINIC_SHORT_NAME__/{allPaths=**} {
      allow read, write: if true;
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Deploy them from the Firebase Console (simplest, no extra tooling):

1. **Firestore rules**: Firebase Console > Firestore Database > **Rules**
   tab > paste the contents of `firebase/firestore.rules` > **Publish**.
2. **Storage rules**: Firebase Console > Storage > **Rules** tab > paste the
   contents of `firebase/storage.rules` > **Publish**.

Or, if you use the [Firebase CLI](https://firebase.google.com/docs/cli):

```bash
firebase deploy --only firestore:rules,storage:rules --project <your-firebase-project-id>
```

(This uses the `firebase.json` already included in this folder, and needs
`firebase login` first — the Console method above needs neither. `npm run
quickstart` can run this command for you at the end of setup if you have the
CLI installed.)

Without these rules published, Firestore/Storage fall back to their default
"all access denied" mode and the app won't be able to read or write any
data.

## 6. Create your `.env` file

```bash
cp .env.example .env
```

Fill in:

- All `VITE_FIREBASE_*` values from the web app config in step 4.5.
- `FIREBASE_PROJECT_ID` / `FIREBASE_STORAGE_BUCKET` — same project as above.
- `FIREBASE_SERVICE_ACCOUNT_KEY` — paste the service account JSON from step
  4.6 (either the raw JSON on one line, or base64-encode it first).
- `CLINIC_ACCESS_PASSWORD` — the shared password your clinic staff will use
  to log in to the EMR. Pick a real value.
- `CLINIC_SESSION_SECRET` and `PATIENT_SESSION_SECRET` — long random secrets
  used to sign the staff and patient-portal session cookies. Generate each
  with:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

  Run it twice and use a different value for each secret.

(`npm run quickstart` does all of this for you — it writes `.env` directly
and generates both secrets automatically.)

## 7. Set up MSG91 (patient portal phone OTP login)

The patient portal (`portal.html`) authenticates parents with a phone-number
OTP, verified through MSG91's widget flow (not Firebase phone auth).

1. Sign up at <https://msg91.com> and verify a sender ID.
2. In the MSG91 dashboard, go to **OTP > Widgets** and create a new OTP
   widget (SMS channel, 4-digit code). Note the **Widget ID** and
   **Token Auth** values shown for the widget.
3. Go to **API > Auth Key** and copy your account's **Auth Key**.
4. Add these to your `.env`:
   - `VITE_MSG91_WIDGET_ID` — the widget ID from step 2.
   - `VITE_MSG91_TOKEN_AUTH` — the token auth value from step 2.
   - `MSG91_AUTH_KEY` — the auth key from step 3 (used server-side in
     `/api/otp/[action].js` to verify the OTP token — keep this secret, do
     not prefix it with `VITE_`).

If you don't need the patient portal, you can skip this section — the rest
of the EMR (staff login, patients, prescriptions, growth charts, vaccination,
certificates) does not depend on MSG91.

## 8. Local development

```bash
npm run dev
```

This starts Vite at `http://localhost:5173`. Note: the staff login
(`/api/auth/login`, `/api/auth/logout`) is emulated by a Vite dev-server
plugin (see `vite.config.js`) and works out of the box. The other API routes
under `/api/otp` and `/api/patients` are Vercel serverless functions and only
run when served by Vercel — use `vercel dev` (from the Vercel CLI) instead of
`vite dev` if you need to exercise the patient portal OTP flow or the
"create/next patient ID" endpoints locally.

## 9. Deploy to Vercel

1. Push this folder to a Git repository (or use the Vercel CLI directly).
2. Create a new Vercel project and import the repository.
3. In the project's **Settings > General**, set **Root Directory** to the
   path of this folder (e.g. `emr/<new-clinic-slug>`).
4. In **Settings > Environment Variables**, add every variable from your
   `.env` file (all the `VITE_FIREBASE_*` values, `FIREBASE_PROJECT_ID`,
   `FIREBASE_STORAGE_BUCKET`, `FIREBASE_SERVICE_ACCOUNT_KEY`,
   `CLINIC_ACCESS_PASSWORD`, `CLINIC_SESSION_SECRET`,
   `PATIENT_SESSION_SECRET`, and the MSG91 variables if you're using the
   patient portal). Or run `npm run vercel:env` after `vercel link` to push
   your `.env` values into the linked project automatically.
5. Build command: `npm run build`. Output directory: `dist`. (Both are also
   already set in `vercel.json`.)
6. Deploy.

## 10. Post-deploy checklist

After the first deploy, verify:

- [ ] Staff login at `/password` works with `CLINIC_ACCESS_PASSWORD`.
- [ ] Patient portal login at `/portal` sends and verifies an OTP (if MSG91
      is configured).
- [ ] Add a test patient from `/new-patient` and confirm it gets a patient ID
      with your clinic's short-name prefix.
- [ ] Generate a prescription and download/print the PDF from
      `/prescription-growth-chart-dashboard`.
- [ ] Generate a certificate PDF from `/certificates`.
- [ ] Growth chart rendering (WHO / IAP curves) displays correctly for a test
      patient with a couple of measurements.

## Notes on what's in this template

- `/api` contains the serverless functions for staff auth, patient-portal
  OTP auth, and patient creation/ID allocation. `lib/` contains the shared
  session and Firebase-init helpers used by both the frontend and the API
  routes.
- `firebase/firestore.rules` and `firebase/storage.rules` are the security
  rules from step 5, scoped to this clinic's own `clinics/__CLINIC_SHORT_NAME__`
  namespace. They are not deployed automatically unless you use `npm run
  quickstart` with the Firebase CLI available — otherwise you publish them
  to your Firebase project by hand or via the Firebase CLI.
- `scripts/quickstart.js` is the one-command setup from the top of this
  README. `scripts/setup-template.js` / `scripts/apply-branding.js` are the
  branding-only alternatives from step 3, and share their placeholder-
  replacement logic with `scripts/lib/replace-tokens.mjs`.
  `scripts/push-vercel-env.js` pushes `.env` into a linked Vercel project
  (step 9). `scripts/ensure-iap-assets.mjs` and
  `scripts/render_growth_charts.py` are used at build/dev time to prepare
  growth chart assets — leave these as-is.
- The original copy of this app (`emr/kid`) shipped with a set of one-off
  data-migration scripts (CSV import, legacy ID reassignment, dedupe, etc.)
  tied to that clinic's existing patient data and production Firebase
  project. Those were intentionally left out of this template since they
  don't apply to a fresh deployment; if you're migrating existing patient
  data from another system, you'll need to write your own import script
  against this app's Firestore schema (see `new-patient.html` and
  `api/patients/create.js` for the patient record shape).
