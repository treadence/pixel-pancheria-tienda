const GA4_DEFAULT_MEASUREMENT_ID = 'G-KF22RZJNS3';
const CLAIM_TTL_MS = 5 * 60 * 1000;

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildItems(order) {
  return (Array.isArray(order.items) ? order.items : []).map((item, index) => ({
    item_id: String(item.id || item.productId || item.itemId || `producto-${index + 1}`).slice(0, 100),
    item_name: String(item.name || 'Producto').slice(0, 100),
    price: cleanNumber(item.price || item.unitPrice || item.total),
    quantity: Math.max(1, Math.round(cleanNumber(item.qty || item.quantity) || 1))
  }));
}

function buildPurchasePayload(orderId, order) {
  const analytics = order.analytics || {};
  const params = {
    transaction_id: String(orderId),
    value: cleanNumber(order.total),
    currency: 'ARS',
    shipping: cleanNumber(order.shippingCost),
    payment_type: String(order.paymentCode || order.paidVia || order.payment || ''),
    engagement_time_msec: 1,
    items: buildItems(order)
  };
  if (analytics.sessionId) params.session_id = Number(analytics.sessionId) || String(analytics.sessionId);
  return {
    client_id: String(analytics.clientId || `server.${orderId}`),
    events: [{ name: 'purchase', params }]
  };
}

async function recordPaidPurchase({ db, orderId, fetchImpl = fetch, measurementId, apiSecret }) {
  if (!db) throw new Error('Firestore Admin no está disponible');
  if (!orderId) throw new Error('Falta orderId');
  measurementId = measurementId || process.env.GA4_MEASUREMENT_ID || GA4_DEFAULT_MEASUREMENT_ID;
  apiSecret = apiSecret || process.env.GA4_API_SECRET;
  if (!apiSecret) return { ok: false, reason: 'ga4_not_configured' };

  const ref = db.doc(`orders/${orderId}`);
  const now = Date.now();
  const claim = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return { proceed: false, reason: 'order_not_found' };
    const order = snapshot.data() || {};
    const source = String(order.source || 'web').toLowerCase();
    if (order.paid !== true) return { proceed: false, reason: 'not_paid' };
    if (['manual', 'local', 'comandera', 'peya'].includes(source)) return { proceed: false, reason: 'not_web_order' };
    if (order.analyticsPurchaseSentAt) return { proceed: false, reason: 'already_sent' };
    const claimedAt = Date.parse(order.analyticsPurchaseClaimedAt || '');
    if (Number.isFinite(claimedAt) && now - claimedAt < CLAIM_TTL_MS) {
      return { proceed: false, reason: 'in_progress' };
    }
    transaction.set(ref, {
      analyticsPurchaseClaimedAt: new Date(now).toISOString(),
      analyticsPurchaseLastError: null
    }, { merge: true });
    return { proceed: true, order };
  });

  if (!claim.proceed) return { ok: true, sent: false, reason: claim.reason };
  const payload = buildPurchasePayload(orderId, claim.order);
  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`GA4 respondió HTTP ${response.status}`);
    await ref.set({
      analyticsPurchaseSentAt: new Date().toISOString(),
      analyticsPurchaseTransactionId: String(orderId),
      analyticsPurchaseLastError: null
    }, { merge: true });
    return { ok: true, sent: true };
  } catch (error) {
    await ref.set({
      analyticsPurchaseClaimedAt: null,
      analyticsPurchaseLastError: String(error && error.message || error).slice(0, 300)
    }, { merge: true });
    throw error;
  }
}

module.exports = { buildPurchasePayload, recordPaidPurchase };
