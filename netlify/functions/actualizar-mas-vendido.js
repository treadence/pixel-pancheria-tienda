const fbadmin = require('firebase-admin');

function getDb() {
  if (!fbadmin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT');
    fbadmin.initializeApp({ credential: fbadmin.credential.cert(JSON.parse(raw)) });
  }
  return fbadmin.firestore();
}

function orderDateMs(order) {
  const value = order.date || order.at;
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function orderCategory(order) {
  if (['web', 'comandera', 'peya'].includes(order.categoryOverride)) return order.categoryOverride;
  return order.source === 'web' || order.source === 'firebase' || !order.source ? 'web' : order.source;
}

function isInternalTest(order) {
  return String(order.customer || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toLowerCase() === 'leandro alcaraz';
}

function localDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

exports.handler = async () => {
  try {
    const db = getDb();
    const snapshot = await db.collection('orders').get();
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const counts = {};

    snapshot.forEach(doc => {
      const order = doc.data();
      if (orderCategory(order) !== 'web' || isInternalTest(order)
          || order.status === 'cancelled' || order.status === 'pending_payment'
          || orderDateMs(order) < cutoff) return;
      (order.items || []).forEach(item => {
        const qty = Number(item.qty) || 1;
        const id = item.id || item.productId || '';
        if (/^p\d+$/.test(id)) counts[id] = (counts[id] || 0) + qty;
        (item.comboPanchos || []).forEach(pancho => {
          if (!/^p\d+$/.test(pancho.id || '')) return;
          counts[pancho.id] = (counts[pancho.id] || 0) + (Number(pancho.qty) || 1) * qty;
        });
      });
    });

    const winner = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const webBestSeller30d = winner
      ? { productId: winner[0], units: winner[1], day: localDayKey() }
      : null;
    await db.doc('settings/store').set({ webBestSeller30d }, { merge: true });
    return { statusCode: 200, body: JSON.stringify({ ok: true, webBestSeller30d }) };
  } catch (error) {
    console.error('Error actualizando más vendido:', error);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
