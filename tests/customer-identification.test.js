const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const status = require('../netlify/functions/customer-status');

assert(source.includes('id="identifyBar"'), 'Debe existir el acceso Identificate');
assert(source.includes('id="identifyOverlay"'), 'Debe existir el modal Identificate');
assert(
  !source.includes('setTimeout(() => window.openCustomerSetup(true), 700)'),
  'Un visitante nuevo no debe recibir el selector obligatorio de dirección al entrar'
);
assert(
  source.includes('const phone = window.cuenta && window.cuenta.telefono;'),
  'El carrito solo debe refrescar coins para una cuenta ya reconocida'
);
assert(
  source.includes("recognizedCustomer || customerAccess.exists === false"),
  'Un teléfono existente no debe adoptarse automáticamente en un navegador nuevo'
);
assert.strictEqual(status._test.normalizePhone('+54 9 11 1234-5678'), '5491112345678');

console.log('customer-identification: ingreso directo y recuperación protegida presentes');
