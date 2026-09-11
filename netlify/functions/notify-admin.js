// Avisa por Firebase Cloud Messaging a los celulares registrados en el admin.
// El texto se arma en servidor y cada pedido se notifica una sola vez.
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
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function notifyOrder(orderId) {
  const db = initAdmin();
  const ref = db.doc('orders/' + orderId);
  const claimed = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const order = snap.data();
    if (!['received', 'pending'].includes(order.status) || order.adminPushSentAt) return null;
    tx.set(ref, { adminPushSentAt: fbadmin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return order;
  });
  if (!claimed) return { sent: false, reason: 'pedido inexistente, no recibido o ya avisado' };

  const tokensSnap = await db.collection('adminPushTokens').get();
  const tokens = [...new Set(tokensSnap.docs.map(d => d.data().token).filter(Boolean))].slice(0, 500);
  if (!tokens.length) return { sent: false, reason: 'no hay celulares registrados' };

  const total = Number(claimed.total) || 0;
  const result = await fbadmin.messaging().sendEachForMulticast({
    tokens,
    data: {
      title: '🌭 ¡Nuevo pedido!',
      body: `${claimed.customer || 'Cliente'} · $${total.toLocaleString('es-AR')} · ${claimed.delivery || 'Pedido web'}`,
      icon: '/icon-192.png',
      url: '/index.html',
      orderId: String(orderId)
    },
    webpush: {
      headers: { Urgency: 'high', TTL: '3600' },
      fcmOptions: { link: '/index.html' }
    }
  });
  return { sent: result.successCount > 0, successCount: result.successCount, failureCount: result.failureCount };
}

exports.notifyOrder = notifyOrder;
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'POST only' });
  let orderId = '';
  try { orderId = String(JSON.parse(event.body || '{}').orderId || ''); } catch (e) {}
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) return response(400, { error: 'orderId inválido' });
  try { return response(200, await notifyOrder(orderId)); }
  catch (e) { console.error('notify-admin:', e); return response(500, { error: 'No se pudo enviar el aviso' }); }
};
