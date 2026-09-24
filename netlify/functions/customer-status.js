// Consulta mínima para la tienda: informa si un teléfono ya tiene cuenta y si
// está bloqueado. Nunca devuelve nombre, direcciones, coins ni beneficios.
const fbadmin = require('firebase-admin');

function initAdmin() {
  if (!fbadmin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT');
    fbadmin.initializeApp({ credential: fbadmin.credential.cert(JSON.parse(raw)) });
  }
  return fbadmin.firestore();
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'POST only' });
  let phone = '';
  try { phone = normalizePhone(JSON.parse(event.body || '{}').phone); } catch (error) {}
  if (!/^\d{8,15}$/.test(phone)) return response(400, { error: 'Teléfono inválido' });

  try {
    const snap = await initAdmin().doc('loyalty/' + phone).get();
    if (!snap.exists) return response(200, { exists: false, blocked: false });
    return response(200, { exists: true, blocked: snap.data().blocked === true });
  } catch (error) {
    console.error('customer-status:', error);
    return response(500, { error: 'No se pudo consultar la cuenta' });
  }
};

exports._test = { normalizePhone };
