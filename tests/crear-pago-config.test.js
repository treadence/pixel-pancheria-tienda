const assert = require('assert');
const { paymentConfig, checkoutConfig, orderMerchandiseTotal, DEFAULT_PAYMENT_CONFIG } = require('../netlify/functions/crear-pago')._test;

const fallback = paymentConfig(null);
assert.deepEqual(fallback, DEFAULT_PAYMENT_CONFIG);

const custom = paymentConfig({ businessConfig: {
  paymentTitle: 'Pedido nocturno',
  paymentDescriptor: 'Píxel! Panchería 2026 demasiado largo'
} });
assert.equal(custom.paymentTitle, 'Pedido nocturno');
assert.equal(custom.paymentDescriptor, 'PIXEL PANCHERIA 2026 D');
assert.ok(custom.paymentDescriptor.length <= 22);

const checkoutFallback = checkoutConfig(null);
assert.equal(checkoutFallback.payments.delivery.mercadopago, true);

const checkoutCustom = checkoutConfig({ checkoutConfig: {
  minimumOrder: 12500,
  payments: { delivery: { mercadopago: false }, pickup: { mercadopago: true } }
} });
assert.equal(checkoutCustom.minimumOrder, 12500);
assert.equal(checkoutCustom.payments.delivery.mercadopago, false);
assert.equal(orderMerchandiseTotal({ subtotal: 20000, promoSavings: 2000, coupon: { discount: 1500 }, redeemedReward: { discount: 500 } }), 16000);

console.log('crear-pago: configuración comercial validada');
