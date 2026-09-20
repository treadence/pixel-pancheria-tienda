const assert = require('assert');
const { paymentConfig, DEFAULT_PAYMENT_CONFIG } = require('../netlify/functions/crear-pago')._test;

const fallback = paymentConfig(null);
assert.deepEqual(fallback, DEFAULT_PAYMENT_CONFIG);

const custom = paymentConfig({ businessConfig: {
  paymentTitle: 'Pedido nocturno',
  paymentDescriptor: 'Píxel! Panchería 2026 demasiado largo'
} });
assert.equal(custom.paymentTitle, 'Pedido nocturno');
assert.equal(custom.paymentDescriptor, 'PIXEL PANCHERIA 2026 D');
assert.ok(custom.paymentDescriptor.length <= 22);

console.log('crear-pago: configuración comercial validada');
