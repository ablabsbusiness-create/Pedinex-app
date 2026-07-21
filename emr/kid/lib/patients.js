import { collection, doc, getDocs, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { db } from './firebase-init.js';

const CLINIC_FIREBASE_NAMESPACE = 'clinics/kid';
const PATIENTS_COLLECTION_PATH = `${CLINIC_FIREBASE_NAMESPACE}/patients`;

export function getNormalizedPatientId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/#@#\d+$/i, '');
}

export function isSyntheticPatientId(value) {
  return /#@#\d+$/i.test(String(value || '').trim());
}

export function normalizePatientPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getPatientDisplayName(patient) {
  return (
    patient.childName
    || [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ').trim()
    || patient.patientId
    || 'Unknown child'
  );
}

function isUsablePatientId(value) {
  const patientId = getNormalizedPatientId(value);
  return Boolean(patientId)
    && patientId !== '-'
    && patientId !== 'ID NOT SAVED'
    && patientId !== 'UNKNOWN';
}

function mergeUniqueByJson(values) {
  const seen = new Set();
  const merged = [];
  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(value);
  }
  return merged;
}

function scorePatientForMerge(patient) {
  const measurementHistoryCount = Array.isArray(patient?.measurementHistory) ? patient.measurementHistory.length : 0;
  const historyBonus = patient?.lastMeasurementRecord ? 1 : 0;
  const fieldCount = [
    patient?.childName,
    patient?.firstName,
    patient?.middleName,
    patient?.lastName,
    patient?.parentName,
    patient?.phone,
    patient?.mobileNumber,
    patient?.dob,
    patient?.gender,
    patient?.email,
    patient?.bloodGroup,
    patient?.abhaId,
    patient?.tags
  ].filter((value) => String(value || '').trim()).length;
  const syntheticPenalty = isSyntheticPatientId(patient?.patientId) || isSyntheticPatientId(patient?.id) ? -5 : 0;

  return (measurementHistoryCount * 100) + (historyBonus * 20) + fieldCount + syntheticPenalty;
}

export function mergePatientRecords(existing, incoming) {
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }

  const preferred = scorePatientForMerge(incoming) > scorePatientForMerge(existing) ? incoming : existing;
  const merged = { ...preferred };

  for (const source of [existing, incoming]) {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      if (key === 'measurementHistory') {
        continue;
      }
      if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
        merged[key] = value;
      }
    }
  }

  merged.measurementHistory = mergeUniqueByJson([
    ...(Array.isArray(existing.measurementHistory) ? existing.measurementHistory : []),
    ...(Array.isArray(incoming.measurementHistory) ? incoming.measurementHistory : [])
  ]);
  merged.lastMeasurementRecord = merged.lastMeasurementRecord || existing.lastMeasurementRecord || incoming.lastMeasurementRecord || null;

  const existingId = getNormalizedPatientId(existing.patientId || existing.id || '');
  const incomingId = getNormalizedPatientId(incoming.patientId || incoming.id || '');
  const preferredId = !isSyntheticPatientId(existing.patientId || existing.id || '') && existingId
    ? existingId
    : (!isSyntheticPatientId(incoming.patientId || incoming.id || '') && incomingId
      ? incomingId
      : existingId || incomingId);

  if (preferredId) {
    merged.patientId = preferredId;
    merged.id = preferredId;
  }

  return merged;
}

export function getPatientDuplicateKey(patient) {
  const displayName = normalizeSearchText(getPatientDisplayName(patient));
  const phone = normalizePatientPhone(patient?.phone || patient?.mobileNumber || patient?.mobile || '');
  return displayName && phone ? `${displayName}|${phone}` : '';
}

export function findDuplicatePatientGroups(patientRecords) {
  const groupsByKey = new Map();

  patientRecords.forEach((patient) => {
    if (patient.status === 'pending' || patient.status === 'rejected' || patient.status === 'merged') {
      return;
    }

    const duplicateKey = getPatientDuplicateKey(patient);
    if (!duplicateKey) {
      return;
    }

    const patientId = getNormalizedPatientId(patient.patientId);
    if (!isUsablePatientId(patientId)) {
      return;
    }

    const group = groupsByKey.get(duplicateKey) || new Map();
    group.set(patientId, patient);
    groupsByKey.set(duplicateKey, group);
  });

  return [...groupsByKey.values()]
    .filter((group) => group.size > 1)
    .map((group) => [...group.values()]);
}

export async function fetchAllPatients() {
  if (!db) {
    return [];
  }

  const snapshot = await getDocs(collection(db, PATIENTS_COLLECTION_PATH));
  return snapshot.docs.map((patientDoc) => ({ id: patientDoc.id, ...patientDoc.data() }));
}

export async function mergeDuplicatePatientGroup(group) {
  if (!db || group.length < 2) {
    return;
  }

  const merged = group.reduce((acc, patient) => acc ? mergePatientRecords(acc, patient) : patient, null);
  const survivorId = getNormalizedPatientId(merged.patientId);
  if (!survivorId) {
    throw new Error('Unable to determine a surviving patient ID for this merge.');
  }

  const survivorRecord = { ...merged, patientId: survivorId };
  delete survivorRecord.id;

  await setDoc(doc(db, PATIENTS_COLLECTION_PATH, survivorId), {
    ...survivorRecord,
    updatedAt: serverTimestamp()
  }, { merge: true });

  const losers = group
    .map((patient) => getNormalizedPatientId(patient.patientId))
    .filter((patientId) => patientId && patientId !== survivorId);

  for (const loserId of losers) {
    await setDoc(doc(db, PATIENTS_COLLECTION_PATH, loserId), {
      status: 'merged',
      mergedIntoPatientId: survivorId,
      mergedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  return { survivorId, loserIds: losers };
}
