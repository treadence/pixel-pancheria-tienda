const assert = require('node:assert/strict');
const { countBread, count, active, EXPIRES_AT, status } = require('../netlify/functions/temporary-german-limit-helper');
assert.equal(count([{ qty: 3, sausages: [{ id: 'sg1', qty: 2 }, { id: 'sg2', qty: 1 }] }], 'web'), 2);
assert.equal(count([{ qty: 3, sausages: [{ name: 'Alemana' }] }], 'comandera'), 3);
assert.equal(count([{ qty: 2, comboPanchos: [{ qty: 1, sausages: [{ name: 'Alemana' }] }] }], 'comandera'), 2);
assert.equal(count([{ qty: 2, comboPanchos: [{ qty: 2, sausages: [{ id: 'sg1' }, { id: 'sg2' }] }] }], 'web'), 1);
assert.equal(count([{ qty: 3, sausages: [{ name: 'Viena' }] }], 'manual'), 0);
assert.equal(EXPIRES_AT, null);
assert.equal(active(), false);
// El parche apagado no debe leer ni escribir stock/pedidos.
status(new Proxy({}, {get(){throw new Error('Acceso a base de datos con parche apagado');}})).then(result => {
 assert.equal(result.active,false);
 assert.equal(result.remaining,null);
 console.log('Parche apagado: sin consultas ni cambios de stock OK');
}).catch(error=>{console.error(error);process.exitCode=1;});

assert.equal(countBread([{productId:'p4',qty:3},{productId:'a3',qty:2}]),3);
assert.equal(countBread([{qty:2,comboPanchos:[{id:'p1',qty:2}]}],'web'),2);
assert.equal(countBread([{qty:2,comboPanchos:[{id:'p1',qty:2}]}],'comandera'),4);

// Navegador: sin descuentos, restricciones temporales ni sondeo.
{
 const vm=require('vm'),fs=require('fs');let requests=0,timers=0;
 const context={window:{},fetch(){requests++;throw new Error('sondeo inesperado');},setInterval(){timers++;}};
 vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../temporary-german-limit.js'),'utf8'),context);
 const limit=context.window.temporaryGermanLimit;
 assert.equal(limit.active(),false);
 assert.equal(limit.blocked('b1'),false);
 assert.equal(limit.affected('p4'),false);
 assert.equal(limit.available('sg1'),true);
 assert.equal(limit.breadAvailable(),true);
 assert.equal(limit.viennaSavings({qty:1,sausages:[{id:'sg2'}]}),0);
 assert.equal(requests,0);assert.equal(timers,0);
}
