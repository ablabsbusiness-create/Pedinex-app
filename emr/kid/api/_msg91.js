const MSG91_VERIFY_TOKEN_URL = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';

function getAuthKey() {
  const key = String(process.env.MSG91_AUTH_KEY || '').trim();
  if (!key) {
    throw new Error('MSG91_AUTH_KEY is not configured.');
  }
  return key;
}

export function isMsg91Configured() {
  return Boolean(process.env.MSG91_AUTH_KEY);
}

export async function verifyAccessToken(accessToken) {
  const response = await fetch(MSG91_VERIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authkey: getAuthKey(),
      'access-token': accessToken
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.type === 'error') {
    throw new Error(data?.message || 'That code is incorrect. Please try again.');
  }
  return data;
}
