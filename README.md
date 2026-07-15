# Pedinex EMR Monorepo

This repo hosts one or more standalone clinic EMR apps. Each clinic lives in
its own folder under `emr/` and is deployed as its **own** Vercel project
(own Root Directory, own env vars, own Firebase project).

## Structure

- `emr/kid` — the live EMR app for this clinic (Vite + Firebase, patient
  portal, growth charts, prescriptions, vaccinations, certificates).
- `emr/template` — a de-branded, reusable base copy of `emr/kid`. Use this
  whenever a **new** doctor/clinic needs their own EMR instance.

Nothing at the repo root needs installing — each `emr/<name>` folder has its
own `package.json` and is built/deployed independently.

## Working on the existing clinic (`emr/kid`)

```bash
cd emr/kid
npm install
npm run dev
```

Local dev needs a `.env` file (copy `.env.example` and fill in the Firebase
values + `CLINIC_ACCESS_PASSWORD` / `CLINIC_SESSION_SECRET`) if one isn't
already present. See `emr/kid/README.md` for the full deploy checklist
(Vercel Root Directory, required env vars, build command).

## Onboarding a brand-new clinic (from `emr/template`)

1. Copy the template to a new folder, e.g.:

   ```bash
   cp -r emr/template emr/<new-clinic-slug>
   cd emr/<new-clinic-slug>
   npm install
   ```

2. Fill in the clinic's branding (replaces `__CLINIC_NAME__`,
   `__DOCTOR_NAME__`, etc. placeholders across the app):

   ```bash
   npm run setup
   ```

3. Create a new Firebase project at
   [console.firebase.google.com](https://console.firebase.google.com):
   enable Authentication, Firestore, and Storage, then copy the web app
   config values.

4. Create `.env` from `.env.example` in the new folder and fill in:
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
     `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
     `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`,
     `VITE_FIREBASE_MEASUREMENT_ID`
   - `CLINIC_ACCESS_PASSWORD` (the real clinic login password)
   - `CLINIC_SESSION_SECRET` — generate one with:

     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - MSG91 OTP vars if the clinic uses phone-OTP patient login (see
     `emr/<new-clinic-slug>/README.md` for details, only needed if MSG91
     is actually wired up).

5. Run it locally:

   ```bash
   npm run dev
   ```

6. Deploy: create a **new** Vercel project, set the Root Directory to
   `emr/<new-clinic-slug>`, set build command `npm run build` and output
   directory `dist`, and add all the env vars from step 4 in the Vercel
   project settings.

7. Post-deploy smoke test: log into the patient portal, add a test patient,
   generate a prescription/certificate PDF, and check the growth chart
   renders.

Full step-by-step detail (including which Firebase products to enable and
how auth is wired) lives in `emr/template/README.md` — copy that file along
with the rest of the template into the new clinic folder and follow it from
there.
