const assert = require('assert');
const { deviceAccepts } = require('../netlify/functions/notify-admin')._test;

assert.equal(deviceAccepts({ token: 'a' }, 'newOrder'), true);
assert.equal(deviceAccepts({ token: 'a', enabled: false }, 'newOrder'), false);
assert.equal(deviceAccepts({ token: 'a', preferences: { newOrder: false } }, 'newOrder'), false);
assert.equal(deviceAccepts({ token: 'a', preferences: { newOrder: false } }, 'paymentApproved'), true);
assert.equal(deviceAccepts({ preferences: { newOrder: true } }, 'newOrder'), false);

console.log('notify-admin: preferencias por dispositivo validadas');
