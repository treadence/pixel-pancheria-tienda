// Se desactiva solo el 10/10 a las 00:00 (Argentina), sin otro despliegue.
(() => {
  const expiresAt = Date.parse('2026-10-11T00:30:00-03:00');
  let remaining = null; let breadRemaining = null;
  let inflight;
  const active = () => Date.now() < expiresAt;
  const available = id => id !== 'sg1' || !active() || remaining > 0;
  function count(items, source = 'web') {
  return (items || []).reduce((total, item) => {
    const qty = Math.max(0, Number(item.qty) || 1);
    const german = (item.sausages || []).filter(s => s.id === 'sg1' || /alemana/i.test(String(s.name || s)));
    // Web guarda cantidades absolutas; comandera/PeYa guardan opciones por unidad.
    const own = german.reduce((sum, s) => sum + Math.max(0, Number(s.qty) || 1), 0) * (source === 'web' ? 1 : qty);
    return total + own + count(item.comboPanchos, source) * (source === 'web' ? 1 : qty);
  }, 0);
}

function countBread(items, source = 'web') {
 return (items || []).reduce((sum,item)=> {
 const qty=Math.max(0,Number(item.qty)||1), id=String(item.productId||item.id||'');
 const pancho=/^p\d+$/.test(id) || (item.sausages||[]).length>0 && !item.comboPanchos && !/^a/.test(id);
 return sum+(item.comboPanchos ? countBread(item.comboPanchos,source)*(source==='web'?1:qty) : pancho?qty:0);
 },0);
}
  async function refresh() {
    if (!active()) { remaining = null; return; }
    if (inflight) return inflight;
    inflight = (async () => {
      const response = await fetch('/.netlify/functions/temporary-german-limit', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo verificar el stock de alemanas. Reintentá.');
      const data = await response.json();
      const previous = remaining;
      remaining = data.active ? data.remaining : null; breadRemaining = data.active ? data.breadRemaining : null; window.updateStockInUI?.(); window.updateStoreStatus?.();
      if (previous !== remaining) {
        if (window.currentProduct && typeof window.renderProductModal === 'function') window.renderProductModal();
      }
    })().finally(() => { inflight = null; });
    return inflight;
  }
  async function check(order) {
    if (!active()) return true;
    const invalid = items => (items || []).some(item => window.temporaryGermanLimit.blocked(item.productId || item.id) || ['toppings','paidOptions'].some(key => (item[key] || []).some(x => window.temporaryGermanLimit.blocked(x.id || x))) || invalid(item.comboPanchos) || invalid(item.comboBebidas));
    if (invalid(order.items)) { alert('El pedido contiene productos o adicionales agotados. Actualizá el carrito.'); return false; }
    const requested = count(order.items, order.source || 'manual');

    try {
      await refresh();
      if (!active()) return true; if (breadRemaining === null || breadRemaining <= 0 || countBread(order.items,order.source || 'manual') > breadRemaining) { alert('Sin pan suficiente. Disponibles: ' + (breadRemaining || 0)); return false; } if (requested <= remaining) return true;
      alert('Quedan ' + remaining + ' salchichas alemanas. Cambiá el pedido para continuar.');
    } catch (error) { alert(error.message); }
    return false;
  }
  window.temporaryGermanLimit = { available, refresh, check, count, countBread, active, breadAvailable: () => !active() || breadRemaining > 0, blocked: id => active() && ['a1','a2','a3','b1','to5','to7','add_panceta'].includes(id), affected: id => active() && (['p4','p5'].includes(id) || /cebolla|panceta/i.test(String(window.productsOverlay?.[id]?.desc || '')) && !/^a/.test(id)) };
  if (active()) {
    refresh().catch(console.warn);
    const timer = setInterval(() => {
      if (!active()) {
        clearInterval(timer);
        remaining = null;
        if (window.currentProduct && typeof window.renderProductModal === 'function') window.renderProductModal();
        return;
      }
      if (document.visibilityState === 'visible') refresh().catch(console.warn);
    }, 30000);
  }
})();
