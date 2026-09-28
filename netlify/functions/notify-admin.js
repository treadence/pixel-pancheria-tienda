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

function deviceAccepts(device, eventType) {
  const preferences = (device && device.preferences) || {};
  return Boolean(device && device.token && device.enabled !== false && preferences[eventType] !== false);
}

async function notifyOrder(orderId, requestedEventType) {
  const db = initAdmin();
  const ref = db.doc('orders/' + orderId);
  const claimed = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const order = snap.data();
    if (!['received', 'pending'].includes(order.status) || order.adminPushSentAt) return null;
    const lastAttempt = order.adminPushAttemptAt && order.adminPushAttemptAt.toMillis ? order.adminPushAttemptAt.toMillis() : 0;
    if (lastAttempt && Date.now() - lastAttempt < 2 * 60 * 1000) return null;
    tx.set(ref, {
      adminPushAttemptAt: fbadmin.firestore.FieldValue.serverTimestamp(),
      adminPushLastError: fbadmin.firestore.FieldValue.delete()
    }, { merge: true });
    return order;
  });
  if (!claimed) return { sent: false, reason: 'pedido inexistente, ya avisado o intento reciente' };

  const eventType = requestedEventType || (claimed.awaitingTransfer ? 'transferPending' : claimed.paidVia === 'mercadopago' ? 'paymentApproved' : 'newOrder');
  const tokensSnap = await db.collection('adminPushTokens').get();
  const devices = tokensSnap.docs
    .map(doc => ({ ref: doc.ref, ...doc.data() }))
    .filter(device => deviceAccepts(device, eventType));
  const tokens = [...new Set(devices.map(device => device.token))].slice(0, 500);
  if (!tokens.length) {
    await ref.set({ adminPushLastError: 'no hay celulares registrados', adminPushFailureCount: 0 }, { merge: true });
    return { sent: false, reason: 'no hay celulares registrados' };
  }

  const total = Number(claimed.total) || 0;
  const titles = {
    newOrder: '🌭 ¡Nuevo pedido!',
    paymentApproved: '💳 ¡Pago aprobado!',
    transferPending: '📲 Transferencia pendiente'
  };
  const title = titles[eventType] || titles.newOrder;
  const body = `${claimed.customer || 'Cliente'} · $${total.toLocaleString('es-AR')} · ${claimed.delivery || 'Pedido web'}`;
  const result = await fbadmin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: {
      title,
      body,
      icon: '/icon-192.png',
      url: '/index.html',
      orderId: String(orderId)
    },
    webpush: {
      headers: { Urgency: 'high', TTL: '3600' },
      notification: {
        title,
        body,
        icon: '/icon-192.png',
        badge: '/notification-badge-96.png',
        vibrate: [200, 100, 200],
        data: { url: '/index.html', orderId: String(orderId) }
      },
      fcmOptions: { link: '/index.html' }
    }
  });
  const failureCodes = result.responses
    .map(response => response.error && response.error.code)
    .filter(Boolean);
  const invalidCodes = new Set([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered'
  ]);
  const invalidTokens = new Set(result.responses
    .map((response, index) => invalidCodes.has(response.error && response.error.code) ? tokens[index] : null)
    .filter(Boolean));
  if (invalidTokens.size) {
    const batch = db.batch();
    devices.filter(device => invalidTokens.has(device.token)).forEach(device => batch.delete(device.ref));
    await batch.commit();
  }
  const diagnostic = {
    adminPushSuccessCount: result.successCount,
    adminPushFailureCount: result.failureCount,
    adminPushFailureCodes: [...new Set(failureCodes)].slice(0, 10)
  };
  if (result.successCount > 0) diagnostic.adminPushSentAt = fbadmin.firestore.FieldValue.serverTimestamp();
  else diagnostic.adminPushLastError = failureCodes[0] || 'FCM no confirmó la entrega';
  await ref.set(diagnostic, { merge: true });
  return {
    sent: result.successCount > 0,
    successCount: result.successCount,
    failureCount: result.failureCount,
    failureCodes: [...new Set(failureCodes)]
  };
}

exports.notifyOrder = notifyOrder;
exports._test = { deviceAccepts };
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'POST only' });
  let orderId = '';
  try { orderId = String(JSON.parse(event.body || '{}').orderId || ''); } catch (e) {}
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) return response(400, { error: 'orderId inválido' });
  try { return response(200, await notifyOrder(orderId)); }
  catch (e) { console.error('notify-admin:', e); return response(500, { error: 'No se pudo enviar el aviso' }); }
};
