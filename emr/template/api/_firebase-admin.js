import admin from 'firebase-admin';

function parseServiceAccount() {
  const rawValue = String(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();

  if (!rawValue) {
    return null;
  }

  try {
    const decoded = rawValue.startsWith('{')
      ? rawValue
      : Buffer.from(rawValue, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);

    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }

    return parsed;
  } catch (error) {
    throw new Error(`Invalid Firebase service account JSON: ${error.message}`);
  }
}

export function getAdminApp() {
  if (admin.apps.length) {
    return admin.app();
  }

  const serviceAccount = parseServiceAccount();
  const projectId = String(process.env.FIREBASE_PROJECT_ID || serviceAccount?.project_id || '').trim();
  const storageBucket = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID is not configured.');
  }

  const appOptions = { projectId };
  if (storageBucket) {
    appOptions.storageBucket = storageBucket;
  }

  if (serviceAccount) {
    appOptions.credential = admin.credential.cert(serviceAccount);
  } else {
    appOptions.credential = admin.credential.applicationDefault();
  }

  return admin.initializeApp(appOptions);
}

export function getAdminDb() {
  return getAdminApp().firestore();
}

export function getAdminBucket() {
  return getAdminApp().storage().bucket();
}
