import { verifyAccessToken, isMsg91Configured } from '../_msg91.js';
import {
  createPatientSessionToken,
  verifyPatientSessionToken,
  buildPatientSessionCookie,
  buildClearedPatientSessionCookie,
  isPatientSessionConfigured,
  parseCookies,
  getPatientSessionCookieName
} from '../../lib/patient-session.js';

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  for (const [header, value] of Object.entries(extraHeaders)) {
    res.setHeader(header, value);
  }

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

function normalizePhoneDigits(value) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^0+/, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function handleVerify(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!isMsg91Configured() || !isPatientSessionConfigured()) {
    sendJson(res, 503, { error: 'OTP verification is not configured. Please contact support.' });
    return;
  }

  let payload = {};

  try {
    payload = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid request body.' });
    return;
  }

  const phoneDigits = normalizePhoneDigits(payload?.phone);
  const accessToken = String(payload?.accessToken || '').trim();

  if (phoneDigits.length !== 10) {
    sendJson(res, 400, { error: 'Please enter a valid 10-digit phone number.' });
    return;
  }

  if (!accessToken) {
    sendJson(res, 400, { error: 'Missing verification token.' });
    return;
  }

  try {
    await verifyAccessToken(accessToken);
  } catch (error) {
    sendJson(res, 401, { error: error?.message || 'That code is incorrect. Please try again.' });
    return;
  }

  const token = await createPatientSessionToken(phoneDigits);
  sendJson(res, 200, { ok: true }, {
    'Set-Cookie': buildPatientSessionCookie(token)
  });
}

async function handleSession(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[getPatientSessionCookieName()];
  const phone = await verifyPatientSessionToken(token);

  if (!phone) {
    sendJson(res, 401, { error: 'Not signed in.' });
    return;
  }

  sendJson(res, 200, { phone });
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  sendJson(res, 200, { ok: true }, {
    'Set-Cookie': buildClearedPatientSessionCookie()
  });
}

export default async function handler(req, res) {
  const action = req.query?.action;

  if (action === 'verify') {
    await handleVerify(req, res);
    return;
  }

  if (action === 'session') {
    await handleSession(req, res);
    return;
  }

  if (action === 'logout') {
    await handleLogout(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
}
