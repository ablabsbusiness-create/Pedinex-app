import admin from 'firebase-admin';
import { getAdminDb } from '../_firebase-admin.js';

const CLINIC_NAMESPACE = 'clinics/main';
const PATIENT_ID_PREFIX = '__CLINIC_SHORT_NAME__';
const PATIENT_ID_WIDTH = 4;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

function clean(value) {
  return String(value ?? '').trim();
}

function normalizePhone(value) {
  const digits = clean(value).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function isValidDob(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(value))) {
    return false;
  }

  const [year, month, day] = clean(value).split('-').map((part) => Number.parseInt(part, 10));
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day;
}

function formatPatientId(serial) {
  return `${PATIENT_ID_PREFIX}${String(serial).padStart(PATIENT_ID_WIDTH, '0')}`;
}

function patientPayloadFromBody(body) {
  const patient = body?.patient && typeof body.patient === 'object' ? body.patient : body;
  const childName = clean(patient.childName);
  const gender = clean(patient.gender);
  const dob = clean(patient.dob);
  const phone = normalizePhone(patient.mobileNumber || patient.phone);

  if (!childName) {
    throw new Error('Child name is required.');
  }

  if (!gender) {
    throw new Error('Gender is required.');
  }

  if (!isValidDob(dob)) {
    throw new Error('A valid date of birth is required.');
  }

  if (!phone) {
    throw new Error('Phone number is required.');
  }

  return {
    childName,
    parentName: clean(patient.parentName),
    gender,
    dob,
    phone,
    mobileNumber: phone,
    email: clean(patient.email),
    bloodGroup: clean(patient.bloodGroup)
  };
}

async function allocatePatientId(db) {
  const counterRef = db.doc(`${CLINIC_NAMESPACE}/counters/patientIds`);
  const patientsRef = db.collection(`${CLINIC_NAMESPACE}/patients`);

  return db.runTransaction(async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    let nextSerial = Number(counterSnapshot.data()?.nextSerial || 1);

    if (!Number.isFinite(nextSerial) || nextSerial < 1) {
      nextSerial = 1;
    }

    for (let attempts = 0; attempts < 20000; attempts += 1) {
      const patientId = formatPatientId(nextSerial);
      const patientRef = patientsRef.doc(patientId);
      const patientSnapshot = await transaction.get(patientRef);

      if (!patientSnapshot.exists) {
        transaction.set(counterRef, {
          prefix: PATIENT_ID_PREFIX,
          nextSerial: nextSerial + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return { patientId, patientRef };
      }

      nextSerial += 1;
    }

    throw new Error(`Could not allocate an unused ${PATIENT_ID_PREFIX} patient ID.`);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  let body = {};

  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid request body.' });
    return;
  }

  let patientRecord = {};

  try {
    patientRecord = patientPayloadFromBody(body);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  try {
    const db = getAdminDb();
    const { patientId, patientRef } = await allocatePatientId(db);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const savedRecord = {
      ...patientRecord,
      patientId,
      idSystem: PATIENT_ID_PREFIX,
      idAssignedBy: 'backend-transaction',
      createdAt: now,
      updatedAt: now
    };

    await patientRef.set(savedRecord, { merge: false });
    sendJson(res, 201, { ok: true, patientId, patient: { ...patientRecord, patientId } });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Unable to create patient.' });
  }
}
