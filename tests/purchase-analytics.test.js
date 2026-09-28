const assert = require('assert');
const { buildPurchasePayload } = require('../netlify/functions/purchase-analytics');

const payload = buildPurchasePayload('pedido-123', {
  total: 12500,
  shippingCost: 1500,
  paymentCode: 'transferencia',
  analytics: { clientId: '123.456', sessionId: '789' },
  items: [{ productId: 'neo', name: 'Neo', unitPrice: 5500, qty: 2 }]
});

assert.strictEqual(payload.client_id, '123.456');
assert.strictEqual(payload.events[0].name, 'purchase');
assert.strictEqual(payload.events[0].params.transaction_id, 'pedido-123');
assert.strictEqual(payload.events[0].params.value, 12500);
assert.strictEqual(payload.events[0].params.shipping, 1500);
assert.strictEqual(payload.events[0].params.session_id, 789);
assert.deepStrictEqual(payload.events[0].params.items[0], {
  item_id: 'neo', item_name: 'Neo', price: 5500, quantity: 2
});

const fallback = buildPurchasePayload('pedido-sin-cookie', { paid: true, total: '4000', items: [] });
assert.strictEqual(fallback.client_id, 'server.pedido-sin-cookie');
assert.strictEqual(fallback.events[0].params.value, 4000);

console.log('purchase-analytics: payload GA4 e identidad fallback validados');
