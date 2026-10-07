const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require('path').join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g,'\n');
const config = source.match(/const DEFAULT_FEATURE_CONFIG = Object.freeze\(\{[\s\S]*?\n    \}\);/)[0];
const getter = source.match(/window.getFeatureConfig = \(\) => .*?;/)[0];
const refresh = source.slice(source.indexOf('    function refreshMyOrderAccess(saved)'), source.indexOf('    function forgetTrackedOrder()'));
const bootStart = source.indexOf('    if (!__trackId) {\n      (function activeOrderAccess()');
const bootEnd = source.indexOf('    // Tracking de visitas/sesiones', bootStart);
assert(bootStart > 0 && bootEnd > bootStart);
assert(source.indexOf(getter) < bootStart,'Feature getter must be ready before restoring a saved order');
const copy = {innerHTML:''}; const classes = new Set();
const button = {style:{}, classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)},querySelector:()=>copy};
const window = {}; let reads = 0, remembered = '', forgotten = 0;
let saved = {id:'local-test-order',at:Date.now(),statusHint:'received'};
const context = vm.createContext({window,document:{getElementById:()=>button},localStorage:{getItem:key=>key==='pixel_pedido_activo'?JSON.stringify(saved):null},
  Date, __trackId:null, db:{},doc:(_db,name,id)=>({name,id}),getDoc:async ref=>{reads++;assert.strictEqual(ref.id,saved.id);return {exists:()=>true,data:()=>({status:'received'})};},
  trackNormStatus:value=>value, rememberTrackedOrder:id=>{remembered=id;},forgetTrackedOrder:()=>{forgotten++;}, showFeedbackPrompt:()=>{}
});
(async()=>{
  vm.runInContext(config+'\n'+getter+'\n'+refresh,context);
  // Run the real startup block before storeSettings exists, as on a returning browser.
  vm.runInContext(source.slice(bootStart,bootEnd),context); await Promise.resolve();
  assert.strictEqual(reads,1); assert.strictEqual(remembered,saved.id);
  assert(copy.innerHTML.includes('SEGUIR MI PEDIDO')); assert(classes.has('has-order'));
  window.storeSettings={featureConfig:{trackingShortcut:false}};
  vm.runInContext('refreshMyOrderAccess(null)',context); assert.strictEqual(button.style.display,'none');
  window.storeSettings.featureConfig.trackingShortcut=true;
  vm.runInContext('refreshMyOrderAccess(null)',context); assert.strictEqual(button.style.display,'');
  assert(!classes.has('has-order')); assert(copy.innerHTML.includes('SEGUIMIENTO DE PEDIDO'));
  saved.at=Date.now()-31*24*60*60*1000;
  vm.runInContext(source.slice(bootStart,bootEnd),context); assert.strictEqual(reads,1,'Expired saved order must not be queried'); assert.strictEqual(forgotten,1);
  console.log('saved-order-startup: returning customers start safely, read once, remote feature changes and expiration preserved');
})().catch(error=>{console.error(error);process.exitCode=1;});
