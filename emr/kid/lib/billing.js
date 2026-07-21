import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { db } from './firebase-init.js';

const CLINIC_FIREBASE_NAMESPACE = 'clinics/kid';
const BILLING_COUNTERS_DOC_PATH = [CLINIC_FIREBASE_NAMESPACE, 'clinicSettings', 'billingCounters'];
const BILLING_ITEM_DEFAULTS_DOC_PATH = [CLINIC_FIREBASE_NAMESPACE, 'clinicSettings', 'billingItemDefaults'];
const BILL_NO_PREFIX = 'Doc';
const RECEIPT_NO_PREFIX = 'A';
const BILL_NO_SEQUENCE_START = 1000000;
const RECEIPT_NO_SEQUENCE_START = 1000;

export const FIREBASE_BILLING_COLLECTIONS = {
  bills: `${CLINIC_FIREBASE_NAMESPACE}/bills`
};

export const ITEM_PRESET_OPTIONS = [
  'Consultation Fee',
  'Lab Test',
  'Vaccination',
  'Follow-up',
  'Procedure',
  'Other'
];

export const PAYMENT_METHOD_OPTIONS = [
  'Cash',
  'Credit Card',
  'Debit Card',
  'Cheque',
  'e-Wallet',
  'Bank Transfer',
  'UPI'
];

export function getCurrentFinancialYear(referenceDate = new Date()) {
  const month = referenceDate.getMonth();
  const year = referenceDate.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export async function getPatientBills(patientId) {
  if (!db || !patientId) {
    return [];
  }

  const billsQuery = query(
    collection(db, FIREBASE_BILLING_COLLECTIONS.bills),
    where('patientId', '==', patientId)
  );

  const snapshot = await getDocs(billsQuery);
  const bills = snapshot.docs.map((billDoc) => ({ id: billDoc.id, ...billDoc.data() }));
  bills.sort((left, right) => {
    const leftTime = left.createdAtIso ? new Date(left.createdAtIso).getTime() : 0;
    const rightTime = right.createdAtIso ? new Date(right.createdAtIso).getTime() : 0;
    return rightTime - leftTime;
  });
  return bills;
}

export function computeBillDue(bill) {
  const total = Number(bill?.total) || 0;
  const amountPaid = Number(bill?.amountPaid) || 0;
  return Math.max(0, total - amountPaid);
}

export function computePatientDue(bills = []) {
  return bills.reduce((sum, bill) => sum + computeBillDue(bill), 0);
}

export function computeItemsTotal(items = []) {
  return items.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
}

export async function getBillingItemDefaultAmounts() {
  if (!db) {
    return {};
  }

  const defaultsRef = doc(db, ...BILLING_ITEM_DEFAULTS_DOC_PATH);
  const snapshot = await getDoc(defaultsRef);
  return snapshot.exists() ? (snapshot.data().amounts || {}) : {};
}

export async function saveBillingItemDefaultAmount(description, amount) {
  const cleanDescription = String(description || '').trim();
  const cleanAmount = Number(amount) || 0;
  if (!db || !cleanDescription || cleanAmount <= 0) {
    return;
  }

  const defaultsRef = doc(db, ...BILLING_ITEM_DEFAULTS_DOC_PATH);
  await setDoc(defaultsRef, { amounts: { [cleanDescription]: cleanAmount } }, { merge: true });
}

async function allocateBillingNumbers(financialYear) {
  if (!db) {
    throw new Error('Firestore is not configured.');
  }

  const countersRef = doc(db, ...BILLING_COUNTERS_DOC_PATH);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(countersRef);
    const data = snapshot.exists() ? snapshot.data() : {};

    const sameYear = data.currentFinancialYear === financialYear;
    const nextBillSequence = sameYear && Number.isFinite(data.billNoSequence)
      ? data.billNoSequence + 1
      : BILL_NO_SEQUENCE_START;
    const nextReceiptSequence = Number.isFinite(data.receiptNoSequence)
      ? data.receiptNoSequence + 1
      : RECEIPT_NO_SEQUENCE_START;

    transaction.set(countersRef, {
      billNoSequence: nextBillSequence,
      receiptNoSequence: nextReceiptSequence,
      currentFinancialYear: financialYear
    }, { merge: true });

    return {
      billNo: `${BILL_NO_PREFIX}/${financialYear}/${nextBillSequence}`,
      receiptNo: `${RECEIPT_NO_PREFIX}${nextReceiptSequence}`
    };
  });
}

export async function saveBill(patientId, items, paymentMethod, amountPaid) {
  if (!db) {
    throw new Error('Firestore is not configured.');
  }
  if (!patientId) {
    throw new Error('A patient is required to save a bill.');
  }

  const cleanItems = (items || [])
    .map((item) => ({
      description: String(item?.description || '').trim(),
      amount: Number(item?.amount) || 0
    }))
    .filter((item) => item.amount > 0);

  if (!cleanItems.length) {
    throw new Error('Add at least one bill item with an amount.');
  }

  const total = computeItemsTotal(cleanItems);
  const paidAmount = Math.min(Math.max(0, Number(amountPaid) || 0), total);
  const financialYear = getCurrentFinancialYear();
  const { billNo, receiptNo } = await allocateBillingNumbers(financialYear);

  const billRef = doc(collection(db, FIREBASE_BILLING_COLLECTIONS.bills));
  const billRecord = {
    patientId,
    billNo,
    receiptNo,
    items: cleanItems,
    total,
    paymentMethod: paymentMethod || PAYMENT_METHOD_OPTIONS[0],
    amountPaid: paidAmount,
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString()
  };

  await setDoc(billRef, billRecord);
  return { id: billRef.id, ...billRecord };
}

export async function updateBill(billId, items, paymentMethod, amountPaid) {
  if (!db) {
    throw new Error('Firestore is not configured.');
  }
  if (!billId) {
    throw new Error('A bill is required to save changes.');
  }

  const cleanItems = (items || [])
    .map((item) => ({
      description: String(item?.description || '').trim(),
      amount: Number(item?.amount) || 0
    }))
    .filter((item) => item.amount > 0);

  if (!cleanItems.length) {
    throw new Error('Add at least one bill item with an amount.');
  }

  const total = computeItemsTotal(cleanItems);
  const paidAmount = Math.min(Math.max(0, Number(amountPaid) || 0), total);

  const billRef = doc(db, FIREBASE_BILLING_COLLECTIONS.bills, billId);
  const updates = {
    items: cleanItems,
    total,
    paymentMethod: paymentMethod || PAYMENT_METHOD_OPTIONS[0],
    amountPaid: paidAmount
  };

  await updateDoc(billRef, updates);
  return updates;
}
