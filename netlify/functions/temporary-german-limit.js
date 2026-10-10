const fbadmin = require('firebase-admin');
const { active, status } = require('./temporary-german-limit-helper');
exports.handler = async event => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: '{}' };
  if (!active()) return { statusCode: 200, headers, body: JSON.stringify({ active: false }) };
  try {
    if (!fbadmin.apps.length) fbadmin.initializeApp({ credential: fbadmin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    return { statusCode: 200, headers, body: JSON.stringify(await status(fbadmin.firestore())) };
  } catch (error) {
    console.error('Límite temporal de alemanas:', error.message);
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'No se pudo verificar el stock de alemanas' }) };
  }
};
