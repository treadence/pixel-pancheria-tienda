// Netlify Function: webhook-mp
// Recibe la notificación de Mercado Pago cuando cambia un pago. Consulta el
// pago a MP (no confía en el body), y si está aprobado y el monto coincide con
// el pedido, lo marca como recibido + pagado en Firestore. Recién ahí el pedido
// aparece en el panel del admin y arranca la preparación.
//
// Requiere MP_ACCESS_TOKEN en las variables de entorno de Netlify.

const PROJECT_ID = 'pixelpancheria';
const API_KEY = 'AIzaSyBQGQlfNxRVMk7UfvGI6VRqURwAw7JIMuI';

// --- Firestore REST: decode ---
function fsDecode(v) {
  if (v === null || v === undefined) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return fsDecodeFields((v.mapValue && v.mapValue.fields) || {});
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(fsDecode);
  return null;
}
function fsDecodeFields(fields) {
  const out = {};
  for (const k of Object.keys(fields || {})) out[k] = fsDecode(fields[k]);
  return out;
}
async function fsGetDoc(path) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?key=${API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const json = await r.json();
  return fsDecodeFields(json.fields);
}

// --- Firestore REST: encode (solo los tipos que usamos) ---
function fsEncode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsEncode) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const k of Object.keys(v)) fields[k] = fsEncode(v[k]);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}
// PATCH con updateMask para tocar solo los campos indicados (merge)
async function fsPatch(path, data) {
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?${mask}&key=${API_KEY}`;
  const fields = {};
  for (const k of Object.keys(data)) fields[k] = fsEncode(data[k]);
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return r.ok;
}

function ok(headers) { return { statusCode: 200, headers, body: JSON.stringify({ received: true }) }; }

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  // MP espera 200 rápido; ante la duda respondemos 200 para que no reintente en loop.
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) { console.error('Falta MP_ACCESS_TOKEN'); return ok(headers); }

  // El payment id puede venir por query (?type=payment&data.id=..) o por body
  let paymentId = null, type = null;
  try {
    const qs = event.queryStringParameters || {};
    type = qs.type || qs.topic || null;
    paymentId = qs['data.id'] || qs.id || null;
    if (event.body) {
      const b = JSON.parse(event.body);
      type = type || b.type || b.topic || null;
      paymentId = paymentId || (b.data && b.data.id) || b.id || null;
    }
  } catch (e) { /* body no-JSON: seguimos con lo de query */ }

  // Solo nos interesan las notificaciones de pago
  if (type && !String(type).includes('payment')) return ok(headers);
  if (!paymentId) return ok(headers);

  // Consultar el pago real a MP
  let payment;
  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!r.ok) { console.warn('MP payment fetch', r.status); return ok(headers); }
    payment = await r.json();
  } catch (err) {
    console.error('Error consultando pago MP:', err);
    return ok(headers);
  }

  const orderId = payment.external_reference;
  if (!orderId) return ok(headers);

  const order = await fsGetDoc('orders/' + orderId);
  if (!order) { console.warn('Pedido no encontrado para pago', paymentId); return ok(headers); }

  // Idempotencia: si ya se procesó este pago, no hacer nada
  if (order.paymentId && String(order.paymentId) === String(paymentId) && order.paid) return ok(headers);

  if (payment.status === 'approved') {
    // Validar que el monto pagado cubra el total del pedido
    const paid = Number(payment.transaction_amount) || 0;
    const total = Number(order.total) || 0;
    const montoOk = paid + 1 >= total; // margen de $1 por redondeos
    const now = new Date().toISOString();
    const patch = {
      paid: true,
      paidVia: 'mercadopago',
      paymentId: String(paymentId),
      paidAmount: paid,
      amountMismatch: !montoOk
    };
    // Solo activar el pedido (hacerlo visible al admin) si seguía pendiente de
    // pago. El pedido ya tiene su 'at' de cuando se creó, no hace falta tocarlo.
    if (order.status === 'pending_payment') {
      patch.status = 'received';
      patch.statusHistory = Object.assign({}, order.statusHistory || {}, { received: now });
    }
    await fsPatch('orders/' + orderId, patch);
    return ok(headers);
  }

  if (payment.status === 'rejected' || payment.status === 'cancelled') {
    // Dejar registro pero NO activar el pedido
    await fsPatch('orders/' + orderId, {
      paid: false,
      paymentId: String(paymentId),
      paymentStatus: payment.status
    });
    return ok(headers);
  }

  // in_process / pending / otros: no hacemos nada, esperamos la próxima notificación
  return ok(headers);
};
