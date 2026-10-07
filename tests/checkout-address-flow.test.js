const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require('path').join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return source.slice(a, b);
}
function harness() {
  const elements = Object.fromEntries(['fPay','totalBreakdown','sendBtn','ctaTotal','cashChangeField','deliveryFields','pickupInfo','dmDelivery','dmPickup','fAddress','zoneStatus'].map(id => [id, {value:'',style:{},classList:{toggle(){}},innerHTML:'',textContent:'',disabled:false}]));
  elements.fPay.value = 'mercadopago';
  elements.fPay.selectedOptions = [{dataset:{surcharge:'0'}}];
  const config = {version:1,deliveryEnabled:true,pickupEnabled:true};
  let calls = 0;
  const pending = [];
  const saved = [];
  const window = {deliveryMode:'delivery',COINS_ENABLED:false,cuenta:null,getDeliveryConfig:()=>config,
    getCheckoutConfig:()=>({minimumOrder:0,cashChangeEnabled:true}),rewardDiscount:()=>0};
  const context = vm.createContext({window,document:{getElementById:id=>elements[id]||null},Date,Number,Promise,WeakMap,
    SHIPPING_QUOTE_MAX_AGE_MS:3600000,selectedLocation:null,selectedDirId:null,activeCoupon:null,
    cart:{item:{item:{id:'test'},qty:1}},cartItemSubtotal:()=>10000,promoDiscountForItem:()=>0,calcDiscount:()=>0,
    getLoyaltyConfig:()=>({coinsPerPeso:100}),getDefaultDir:()=>window.cuenta?.direcciones[0]||null,
    getDirById:id=>window.cuenta?.direcciones.find(d=>d.id===id),showMapAndStatus:()=>{},renderSavedAddresses:()=>{},
    saveCuentaLocal:()=>{},addDireccion:loc=>saved.push({...loc}),sendGa4Event:()=>{},
    fetch:()=>{calls++;return new Promise((resolve,reject)=>pending.push({resolve,reject}));}});
  vm.runInContext(section('    function locationFromSavedAddress(', '    // Inicializar autocompletado'),context);
  vm.runInContext(section('    function updateZoneStatus()', '    // Si el cliente borra todo'),context);
  vm.runInContext(section('    window.applyDeliveryModeAvailability =', '    function updateCartTotals()'),context);
  vm.runInContext(section('    function updateCartTotals()', '    // ============== CUENTA + COINS'),context);
  vm.runInContext(section('    window.selectSavedDireccion =', '    window.nuevaDireccion ='),context);
  window.getSelectedLocation=()=>context.selectedLocation;
  window.updateCartPaymentOptions=()=>{};
  return {context,window,elements,config,pending,saved,calls:()=>calls,
    resolve:(index,extra={})=>pending[index].resolve({ok:true,json:async()=>({eligible:true,shippingTier:'standard',shippingCost:3000,configVersion:1,quotedAt:new Date().toISOString(),...extra})})};
}
async function run() {
  assert(!source.includes('id="customerSetupOverlay"'));
  assert(!source.includes('id="customerDeliveryBar"'));
  const init = section('    // Init\n    loadCuenta();','    // Aplicar cupón');
  assert(!init.includes('quoteDeliveryLocation'), 'El menú no cotiza domicilios al iniciar');
  const h = harness();
  h.window.setDeliveryMode('delivery');
  assert.equal(h.calls(),0); assert.equal(h.elements.sendBtn.disabled,true);
  h.window.cuenta={direcciones:[{id:'a',lat:-34.8,lng:-58.2,address:'Prueba 1'}]};
  h.window.setDeliveryMode('delivery');
  assert.equal(h.calls(),1); assert.equal(h.elements.sendBtn.disabled,true);
  h.window.setDeliveryMode('delivery'); assert.equal(h.calls(),1,'No duplicar cotización pendiente');
  h.resolve(0); await vm.runInContext('refreshCheckoutShipping()',h.context);
  assert.equal(h.elements.sendBtn.disabled,false); assert.equal(h.elements.ctaTotal.textContent,'$13.000');
  assert.equal(h.saved[0].address,'Prueba 1');
  h.window.setDeliveryMode('pickup'); assert.equal(h.calls(),1);
  assert.equal(h.elements.sendBtn.disabled,false); assert.equal(h.elements.ctaTotal.textContent,'$10.000');
  h.window.setDeliveryMode('delivery'); assert.equal(h.calls(),1,'Reutilizar cotización vigente');
  h.context.selectedLocation.quoteAt='2020-01-01T00:00:00Z';
  h.window.setDeliveryMode('delivery'); assert.equal(h.calls(),2); assert.equal(h.elements.sendBtn.disabled,true);
  h.resolve(1,{eligible:false,shippingTier:'out_of_coverage',shippingCost:0});
  await vm.runInContext('refreshCheckoutShipping()',h.context);
  assert.equal(h.elements.sendBtn.disabled,true);
  h.window.setDeliveryMode('pickup'); assert.equal(h.elements.sendBtn.disabled,false);
  h.context.selectedLocation=null; h.window.cuenta=null; h.window.setDeliveryMode('delivery');
  h.context.selectedLocation={lat:1,lng:1,address:'Falla'};
  const failed=vm.runInContext('refreshCheckoutShipping()',h.context);
  h.pending[2].reject(new Error('Servicio no disponible')); await failed;
  assert.equal(h.elements.sendBtn.disabled,true); assert(h.elements.zoneStatus.innerHTML.includes('NO PUDIMOS'));
  const retry=vm.runInContext('refreshCheckoutShipping()',h.context); h.resolve(3,{shippingTier:'free',shippingCost:0}); await retry;
  assert.equal(h.elements.sendBtn.disabled,false); assert.equal(h.context.selectedLocation.quoteError,null);
  const r=harness(); r.window.cuenta={direcciones:[{id:'a',lat:1,lng:1,address:'A'},{id:'b',lat:2,lng:2,address:'B'}]};
  r.window.selectSavedDireccion('a'); const first=vm.runInContext('refreshCheckoutShipping()',r.context);
  r.window.selectSavedDireccion('b'); const second=vm.runInContext('refreshCheckoutShipping()',r.context);
  r.resolve(0); await first; assert.equal(r.saved.length,0,'Una respuesta vieja no guarda otra dirección');
  r.resolve(1); await second; assert.equal(r.saved[0].address,'B'); assert.equal(r.context.selectedLocation.address,'B');
  r.window.selectSavedDireccion('a'); const removed=vm.runInContext('refreshCheckoutShipping()',r.context);
  r.context.selectedLocation=null; r.pending[2].reject(new Error('Falla anterior')); await removed;
  assert.equal(r.context.selectedLocation,null,'Borrar la dirección durante la consulta no rompe el checkout');
  r.config.deliveryEnabled=false; r.window.setDeliveryMode('delivery'); assert.equal(r.window.deliveryMode,'pickup');
  r.config.pickupEnabled=false; r.window.updateCartTotals(); assert.equal(r.elements.sendBtn.disabled,true);
  console.log('checkout-address-flow: menú directo, dirección guardada, totales, retiro, vigencia, cobertura, fallo/reintento y cambios concurrentes correctos');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
