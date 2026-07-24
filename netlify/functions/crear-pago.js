// Netlify Function: crear-pago
// Crea una preferencia de Mercado Pago (Checkout Pro) para un pedido que la
// tienda ya guardó en Firestore con status 'pending_payment'.
// El monto se toma del pedido LEÍDO de Firestore (no del body) para que no se
// pueda pedir un checkout por un monto distinto al del pedido guardado.
//
// Requiere la variable de entorno MP_ACCESS_TOKEN (Access Token de producción
// de tu app de Mercado Pago) configurada en Netlify.

const { MercadoPagoConfig, Preference } = require('mercadopago');

const PROJECT_ID = 'pixelpancheria';
const API_KEY = 'AIzaSyBQGQlfNxRVMk7UfvGI6VRqURwAw7JIMuI';

// --- Decodificador REST de Firestore → objeto JS plano ---
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

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta MP_ACCESS_TOKEN' }) };

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const orderId = body.orderId;
  if (!orderId || !/^[A-Za-z0-9_-]{1,64}$/.test(String(orderId))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'orderId inválido' }) };
  }

  const order = await fsGetDoc('orders/' + orderId);
  if (!order) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Pedido no encontrado' }) };
  if (order.status !== 'pending_payment') {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'El pedido no está pendiente de pago' }) };
  }

  const total = Math.round(Number(order.total) || 0);
  if (!(total > 0)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Total inválido' }) };

  // URL pública del sitio (funciona en el dominio netlify y en custom domain)
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const host = event.headers.host;
  const baseUrl = `${proto}://${host}`;
  const backUrl = `${baseUrl}/?pedido=${orderId}`;

  const nItems = Array.isArray(order.items) ? order.items.length : 0;
  const client = new MercadoPagoConfig({ accessToken: token });

  try {
    const pref = await new Preference(client).create({
      body: {
        // Un solo ítem con el total del pedido: evita descuadres por redondeo de
        // combos/descuentos/envío (la suma de ítems podría no dar exacto el total).
        items: [{
          id: orderId,
          title: 'Pedido Pixel Panchería',
          description: `${nItems} producto(s) · ${order.customer || ''}`.trim(),
          quantity: 1,
          unit_price: total,
          currency_id: 'ARS'
        }],
        external_reference: orderId,
        statement_descriptor: 'PIXEL PANCHERIA',
        back_urls: { success: backUrl, pending: backUrl, failure: backUrl },
        auto_return: 'approved',
        notification_url: `${baseUrl}/.netlify/functions/webhook-mp`,
        metadata: { order_id: orderId }
      }
    });
    return { statusCode: 200, headers, body: JSON.stringify({ init_point: pref.init_point, preferenceId: pref.id }) };
  } catch (err) {
    console.error('Error creando preferencia MP:', err);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo crear el pago: ' + (err.message || 'error') }) };
  }
};
