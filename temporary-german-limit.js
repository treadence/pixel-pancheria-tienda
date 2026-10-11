// Parche temporal hasta el 11/10 a las 00:30 (Argentina).
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
  function missingNotice(id, description = '') {
    if (!window.temporaryGermanLimit.affected(id)) return '';
    const desc = String(window.productsOverlay?.[id]?.desc || description || (id === 'p4' ? 'Pan casero, salchicha, queso azul, cebolla caramelizada y champis' : 'Pan casero, salchicha, cheddar y panceta'));
    const missing = [];
    if (id === 'p4' || /cebolla/i.test(desc)) missing.push('cebolla');
    if (id === 'p5' || /panceta/i.test(desc)) missing.push('panceta');
    const ingredients = desc.split(/,| y /i).map(x=>x.trim()).filter(x=>x && !/cebolla|panceta|\bpan\b|salchicha/i.test(x)).map(x=>x.replace(/\bchampis\b/gi,'champiñones'));
    const remaining = ingredients.length > 1 ? ingredients.slice(0,-1).join(', ') + ' y ' + ingredients.at(-1) : ingredients.join('');
    const escape = value => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return '<span class="temporary-missing" role="note"><strong>Nos quedamos sin ' + missing.join(' ni ') + ' :(</strong><span>Aun así lo podés pedir solo con ' + escape(remaining.toLowerCase()) + '.</span><span>20% de descuento aplicado.</span></span>';
  }
  function viennaSavings(line) {
    if (!active()) return 0;
    const sausages = line.sausages || [];
    const total = sausages.reduce((sum,s) => sum + (Number(s.qty) || 1),0);
    const vienna = sausages.filter(s => s.id === 'sg2').reduce((sum,s) => sum + (Number(s.qty) || 1),0);
    if (total) return Math.round(500 * vienna * line.qty / total);
    const selections = Object.values(line.comboSausages || {});
    const panchos = (line.comboPanchos || []).reduce((sum,p)=>sum + p.qty,0);
    const perCombo = line.item?.combo?.panchos || 0;
    return panchos && perCombo ? Math.round(500 * selections.filter(id=>id==='sg2').length * perCombo * line.qty / panchos) : 0;
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
  window.temporaryGermanLimit = { available, refresh, check, count, countBread, active, viennaSavings, missingNotice, breadAvailable: () => !active() || breadRemaining > 0, blocked: id => active() && ['a1','a2','a3','b1','to5','to7','add_panceta'].includes(id), affected: id => active() && (['p4','p5'].includes(id) || /cebolla|panceta/i.test(String(window.productsOverlay?.[id]?.desc || '')) && !/^a/.test(id)) };
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
