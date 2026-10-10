const assert = require('node:assert/strict');
const { countBread, count, active, EXPIRES_AT, status } = require('../netlify/functions/temporary-german-limit-helper');
assert.equal(count([{ qty: 3, sausages: [{ id: 'sg1', qty: 2 }, { id: 'sg2', qty: 1 }] }], 'web'), 2);
assert.equal(count([{ qty: 3, sausages: [{ name: 'Alemana' }] }], 'comandera'), 3);
assert.equal(count([{ qty: 2, comboPanchos: [{ qty: 1, sausages: [{ name: 'Alemana' }] }] }], 'comandera'), 2);
assert.equal(count([{ qty: 2, comboPanchos: [{ qty: 2, sausages: [{ id: 'sg1' }, { id: 'sg2' }] }] }], 'web'), 1);
assert.equal(count([{ qty: 3, sausages: [{ name: 'Viena' }] }], 'manual'), 0);
assert.equal(active(EXPIRES_AT - 1), true);
assert.equal(active(EXPIRES_AT), false);
assert.equal(new Date(EXPIRES_AT).toISOString(), '2026-10-11T03:30:00.000Z');
(async () => {
 assert.deepEqual(await status(null, EXPIRES_AT), { active:false, remaining:null, expiresAt:EXPIRES_AT });
 const docs = [
   { id:'web', data:() => ({ source:'web', items:[{ sausages:[{ id:'sg1', qty:2 }] }] }) },
   { id:'pos', data:() => ({ source:'comandera', items:[{ qty:3, sausages:[{name:'Alemana'}] }] }) },
   { id:'cancelled', data:() => ({ status:'cancelled', source:'web', items:[{sausages:[{id:'sg1',qty:10}]}] }) },
   { id:'unpaid', data:() => ({ status:'pending_payment', source:'web', items:[{sausages:[{id:'sg1',qty:10}]}] }) }
 ];
 const query = { where:() => query, get:async() => ({docs}) };
 let initialized;
 const db = {
   doc:() => ({}), collection:() => query,
   runTransaction:fn => fn({get:async()=>({exists:false}),set:(ref,data)=>{ initialized=data; }})
 };
 const result = await status(db, EXPIRES_AT-60000);
 assert.equal(result.sold,5);
 assert.equal(result.remaining,0);
 assert.equal(initialized.startedAt,EXPIRES_AT-60000);
 assert.equal(initialized.expiresAt,EXPIRES_AT);
 console.log('Límite temporal: unidades web, comandera, combos, cancelados, duplicados y vencimiento OK');
})().catch(error => {console.error(error);process.exitCode=1;});

assert.equal(countBread([{productId:'p4',qty:3},{productId:'a3',qty:2}]),3);
assert.equal(countBread([{qty:2,comboPanchos:[{id:'p1',qty:2}]}],'web'),2);
assert.equal(countBread([{qty:2,comboPanchos:[{id:'p1',qty:2}]}],'comandera'),4);
