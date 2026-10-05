const assert = require('assert');
const { firestoreFailure } = require('../netlify/functions/system-health')._test;
assert.strictEqual(firestoreFailure({code:8}), 'quota_exceeded');
assert.strictEqual(firestoreFailure({code:'resource-exhausted'}), 'quota_exceeded');
assert.strictEqual(firestoreFailure({code:7}), 'permission_denied');
assert.strictEqual(firestoreFailure({code:16}), 'unauthenticated');
assert.strictEqual(firestoreFailure({code:14}), 'unavailable');
assert.strictEqual(firestoreFailure({message:'credential-secret'}), 'read_failed');
console.log('system-health: causas distinguibles sin exponer mensajes sensibles');
