const PATIENT_SESSION_COOKIE_NAME = 'kid_patient_session';
export const PATIENT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function getPatientSessionCookieName() {
  return PATIENT_SESSION_COOKIE_NAME;
}

function getCryptoApi() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is not available in this runtime.');
  }
  return globalThis.crypto;
}

function getSessionSecret() {
  return String(process.env.PATIENT_SESSION_SECRET || '').trim();
}

export function isPatientSessionConfigured() {
  return Boolean(getSessionSecret());
}

export function parseCookies(cookieHeader = '') {
  const cookies = {};

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    cookies[key] = value;
  }

  return cookies;
}

function bytesToBase64Url(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');

  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }

  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function importSigningKey() {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('PATIENT_SESSION_SECRET is missing.');
  }

  return getCryptoApi().subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signValue(value) {
  const key = await importSigningKey();
  const signature = await getCryptoApi().subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(signature));
}

export async function createPatientSessionToken(phoneDigits) {
  const payload = {
    phone: phoneDigits,
    exp: Date.now() + (PATIENT_SESSION_TTL_SECONDS * 1000)
  };

  const encodedPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyPatientSessionToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = await signValue(encodedPayload);
  if (providedSignature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload)));
    if (Number(payload?.exp) <= Date.now()) {
      return null;
    }
    return String(payload?.phone || '') || null;
  } catch {
    return null;
  }
}

export function buildPatientSessionCookie(token) {
  const cookieParts = [
    `${PATIENT_SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${PATIENT_SESSION_TTL_SECONDS}`
  ];

  if (process.env.NODE_ENV === 'production') {
    cookieParts.push('Secure');
  }

  return cookieParts.join('; ');
}

export function buildClearedPatientSessionCookie() {
  const cookieParts = [
    `${PATIENT_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0'
  ];

  if (process.env.NODE_ENV === 'production') {
    cookieParts.push('Secure');
  }

  return cookieParts.join('; ');
}
