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

1. Copy the template to a new folder, then install and quickstart it:

   ```bash
   cp -r emr/template emr/<new-clinic-slug>
   cd emr/<new-clinic-slug>
   npm install
   npm run quickstart
   ```

   `quickstart` asks for the clinic's branding, staff login password, and
   Firebase / MSG91 config in one pass, generates the session secrets for
   you, and writes `.env` directly — no more manually running `npm run
   setup`, copying `.env.example`, or generating secrets by hand. If the
   Firebase CLI is installed and logged in, it can also pull the Firebase
   web app config automatically and deploy the security rules for you.

2. The only parts `quickstart` can't do for you:
   - **Create the Firebase project** at
     [console.firebase.google.com](https://console.firebase.google.com)
     (enable Authentication, Firestore, and Storage) — quickstart will ask
     for the project ID/app once it exists.
   - **Sign up for MSG91** (third-party account) if the clinic uses
     phone-OTP patient portal login — quickstart will ask for the widget
     credentials once you have them.
   - **Publishing the security rules**, if you skip the CLI-assisted step
     during quickstart — paste `firebase/firestore.rules` and
     `firebase/storage.rules` into the Firebase Console (Firestore
     Database > **Rules**, and Storage > **Rules**) and publish. Without
     these published, Firestore/Storage default to deny-all and the app
     can't read or write any data.

3. Run it locally:

   ```bash
   npm run dev
   ```

4. Deploy: create a **new** Vercel project, set the Root Directory to
   `emr/<new-clinic-slug>`, set build command `npm run build` and output
   directory `dist`, and add the env vars from `.env` in the Vercel project
   settings (or run `npm run vercel:env` after `vercel link` to push them
   automatically).

5. Post-deploy smoke test: log into the patient portal, add a test patient,
   generate a prescription/certificate PDF, and check the growth chart
   renders.

Full step-by-step detail (including which Firebase products to enable and
how auth is wired) lives in `emr/template/README.md` — copy that file along
with the rest of the template into the new clinic folder and follow it from
there.
