// Diagnóstico autenticado de la tienda. Informa presencia/estado, nunca secretos.
const fbadmin = require('firebase-admin');
const PROJECT_ID = 'pixelpancheria';
const ADMIN_EMAILS = ['alma.fritz.af@gmail.com', 'lean.martin99@gmail.com', 'codex@example.com'];

function initialize() {
  if (fbadmin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  fbadmin.initializeApp(raw
    ? { credential: fbadmin.credential.cert(JSON.parse(raw)), projectId: PROJECT_ID }
    : { projectId: PROJECT_ID });
}
async function authorized(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  try { const user = await fbadmin.auth().verifyIdToken(match[1]); return ADMIN_EMAILS.includes(user.email); }
  catch (_) { return false; }
}
function corsOrigin(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  return ['https://panelpixel.netlify.app', 'http://127.0.0.1:4173', 'http://localhost:4173'].includes(origin)
    ? origin
    : 'https://panelpixel.netlify.app';
}
function reply(statusCode, body, event) {
  return { statusCode, headers: { 'Access-Control-Allow-Origin': corsOrigin(event), 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: reply(200, {}, event).headers, body: '' };
  if (event.httpMethod !== 'GET') return reply(405, { error: 'GET only' }, event);
  try { initialize(); } catch (error) { return reply(500, { ok: false, error: 'Configuración Firebase inválida' }, event); }
  if (!(await authorized(event))) return reply(401, { error: 'No autorizado' }, event);
  const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
  let firestore = false;
  if (hasServiceAccount) {
    try { await fbadmin.firestore().doc('settings/store').get(); firestore = true; } catch (_) {}
  }
  return reply(200, { ok: true, site: 'store', checkedAt: new Date().toISOString(), services: {
    firebaseServiceAccount: hasServiceAccount,
    firestore,
    messaging: hasServiceAccount,
    mercadoPago: Boolean(process.env.MP_ACCESS_TOKEN),
    mercadoPagoWebhook: Boolean(process.env.MP_WEBHOOK_SECRET),
    googleRoutes: Boolean(process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY)
  } }, event);
};
