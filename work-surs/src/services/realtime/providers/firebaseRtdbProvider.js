// ========================================================
// 📡 مزود المزامنة اللحظية: Firebase Realtime Database
// ========================================================

export async function writeToRealtimeDb(env, path, data, method = 'PUT') {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) {
    throw new Error('Firebase Realtime Database is not configured.');
  }

  const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
  const endpoint = new URL(`${base}/${path}.json`);
  endpoint.searchParams.set('auth', env.FIREBASE_DB_SECRET);
  const response = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(
      `Firebase Realtime Database returned ${response.status}${details ? `: ${details}` : ''}.`
    );
  }
}
