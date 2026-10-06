const assert = require('assert');
const { isAutomationActive, openingGrace } = require('../netlify/functions/automation-hours');
// UTC + 3 horas respecto de Argentina; cubrir los dos límites y medianoche.
for (const [iso, active] of [
 ['2026-10-06T04:59:59Z', true], ['2026-10-06T05:00:00Z', false],
 ['2026-10-06T21:59:59Z', false], ['2026-10-06T22:00:00Z', true],
 ['2026-10-07T03:00:00Z', true]
]) assert.strictEqual(isAutomationActive(new Date(iso)), active, iso);
assert.strictEqual(openingGrace(20, new Date('2026-10-06T22:19:59Z')), true);
assert.strictEqual(openingGrace(20, new Date('2026-10-06T22:20:00Z')), false);
(async () => {
 const handlers = ["actualizar-mas-vendido"].map(name => require('../netlify/functions/' + name).handler);
 const RealDate = Date;
 global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-06T15:00:00Z'])); } };
 try {
  for (const handler of handlers) {
   const response = await handler();
   assert.strictEqual(response.statusCode, 200);
   assert.strictEqual(JSON.parse(response.body).skipped, true);
  }
 } finally { global.Date = RealDate; }
 console.log('automation-hours: límites Argentina y handlers pausados antes de inicializar Firestore');
})().catch(error => { console.error(error); process.exitCode = 1; });
