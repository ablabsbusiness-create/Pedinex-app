import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
import { db, storage } from './firebase-init.js';

const CLINIC_FIREBASE_NAMESPACE = 'clinics/kid';
const CLINIC_STORAGE_PREFIX = CLINIC_FIREBASE_NAMESPACE;

export const FILE_CATEGORIES = {
  investigationReport: 'investigationReports',
  attachment: 'attachments'
};

const FIREBASE_FILE_COLLECTIONS = {
  investigationReports: `${CLINIC_FIREBASE_NAMESPACE}/investigationReports`,
  attachments: `${CLINIC_FIREBASE_NAMESPACE}/attachments`
};

function getCollectionPath(category) {
  const collectionPath = FIREBASE_FILE_COLLECTIONS[category];
  if (!collectionPath) {
    throw new Error(`Unknown file category: ${category}`);
  }
  return collectionPath;
}

export async function getPatientFiles(patientId, category) {
  if (!db || !patientId) {
    return [];
  }

  const filesQuery = query(
    collection(db, getCollectionPath(category)),
    where('patientId', '==', patientId)
  );

  const snapshot = await getDocs(filesQuery);
  const files = snapshot.docs.map((fileDoc) => ({ id: fileDoc.id, ...fileDoc.data() }));
  files.sort((left, right) => {
    const leftTime = left.createdAtIso ? new Date(left.createdAtIso).getTime() : 0;
    const rightTime = right.createdAtIso ? new Date(right.createdAtIso).getTime() : 0;
    return rightTime - leftTime;
  });
  return files;
}

export async function uploadPatientFile(patientId, category, file, title) {
  if (!db || !storage) {
    throw new Error('Online records are not configured.');
  }
  if (!patientId) {
    throw new Error('A patient is required to upload a file.');
  }
  if (!file) {
    throw new Error('Choose a file to upload.');
  }

  const fileId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `file-${Date.now()}`;
  const safeName = String(file.name || 'file').replace(/[^a-z0-9.\-_]+/gi, '-');
  const storagePath = `${CLINIC_STORAGE_PREFIX}/${category}/${patientId}/${fileId}-${safeName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });
  const downloadURL = await getDownloadURL(storageRef);

  const record = {
    patientId,
    title: title || file.name || 'Untitled file',
    fileName: file.name || safeName,
    fileType: file.type || '',
    fileSize: file.size || 0,
    storagePath,
    downloadURL,
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString()
  };

  await setDoc(doc(db, getCollectionPath(category), fileId), record);
  return { id: fileId, ...record };
}

export async function deletePatientFile(category, fileId, storagePath) {
  if (!db) {
    throw new Error('Online records are not configured.');
  }

  if (storagePath && storage) {
    try {
      await deleteObject(ref(storage, storagePath));
    } catch (error) {
      console.warn(`Unable to delete stored file: ${error.message}`);
    }
  }

  await deleteDoc(doc(db, getCollectionPath(category), fileId));
}
