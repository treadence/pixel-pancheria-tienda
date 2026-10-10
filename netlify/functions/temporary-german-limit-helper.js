// Parche temporal: cinco alemanas adicionales, hasta medianoche argentina.
const EXPIRES_AT = Date.parse('2026-10-11T00:30:00-03:00');
function active(now = Date.now()) { return now < EXPIRES_AT; }
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
async function status(db, now = Date.now()) {
  if (!active(now)) return { active: false, remaining: null, expiresAt: EXPIRES_AT };
  const ref = db.doc('stock/temporaryShortages20261010');
  const startedAt = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) return Number(snap.data().startedAt);
    tx.set(ref, { startedAt: now, expiresAt: EXPIRES_AT, limit: 2 });
    return now;
  });
  const orders = db.collection('orders');
  const Timestamp = require('firebase-admin').firestore.Timestamp;
  const snapshots = await Promise.all([
    orders.where('at', '>=', Timestamp.fromMillis(startedAt)).where('at', '<', Timestamp.fromMillis(EXPIRES_AT)).get(),
    orders.where('at', '>=', startedAt).where('at', '<', EXPIRES_AT).get()
  ]);
  let sold = 0; let breadSold = 0;
  const seen = new Set();
  for (const snap of snapshots) for (const doc of snap.docs) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    const order = doc.data();
    if (['cancelled', 'canceled', 'pending_payment'].includes(order.status)) continue;
    sold += count(order.items, order.source || 'manual'); breadSold += countBread(order.items, order.source || 'manual');
  }
  return { active: true, startedAt, expiresAt: EXPIRES_AT, sold, breadSold, breadRemaining: Math.max(0,12-breadSold), remaining: Math.max(0, 2 - sold) };
}
module.exports = { active, count, countBread, status, EXPIRES_AT };
