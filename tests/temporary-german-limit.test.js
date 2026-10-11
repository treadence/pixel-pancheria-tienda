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

// Precios temporales: porcentajes, Viena por unidad, combos y vencimiento.
{
 const fs = require('node:fs'), vm = require('node:vm');
 let now = Date.parse('2026-10-10T23:00:00-03:00');
 const context = { Date: class extends Date { static now(){ return now; } }, window:{}, document:{visibilityState:'hidden'}, setInterval:()=>1, clearInterval(){}, console, alert(){}, fetch:async()=>({ok:true,json:async()=>({active:true,remaining:2,breadRemaining:12})}) };
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../temporary-german-limit.js'),'utf8'),context);
 const limit = context.window.temporaryGermanLimit;
 assert.equal(limit.viennaSavings({qty:3,sausages:[{id:'sg2',qty:2},{id:'sg1',qty:1}]}),1000);
 assert.equal(limit.viennaSavings({qty:6,sausages:[{id:'sg2',qty:2},{id:'sg1',qty:1}]}),2000);
 assert.equal(limit.viennaSavings({qty:2,item:{combo:{panchos:2}},comboPanchos:[{id:'p1',qty:2}],comboSausages:{p1_0:'sg2',p1_1:'sg1'}}),1000);
 const html = fs.readFileSync(require('node:path').join(__dirname,'../../tienda/index.html'),'utf8');
 for (const name of ['getProductDiscount','promoDiscountForItem']) {
   const start = html.indexOf('function '+name+'('), end = html.indexOf('\n    window.'+name,start);
   vm.runInNewContext(html.slice(start,end),context);
 }
 context.cartItemSubtotal = c => c.item.price*c.qty;
 assert.equal(context.getProductDiscount('p4'),20);
 assert.equal(context.getProductDiscount('b2'),10);
 assert.equal(context.promoDiscountForItem({item:{id:'p4',price:6500},qty:1,sausages:[{id:'sg2',qty:1}]}),1800);
 assert.equal(context.promoDiscountForItem({item:{id:'c2',price:16000,combo:{panchos:2}},qty:1,comboPanchos:[{id:'p4',qty:2}],comboSausages:{p4_0:'sg2',p4_1:'sg1'}}),3700);
 now=Date.parse('2026-10-11T00:30:00-03:00');
 assert.equal(limit.viennaSavings({qty:1,sausages:[{id:'sg2'}]}),0);
 assert.equal(context.getProductDiscount('p4'),0);
 console.log('Promos temporales: 20%/10%, Viena adicional, combos, cantidades y vencimiento OK');
}
