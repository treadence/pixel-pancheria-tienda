// Cotiza la cobertura de delivery desde Pixel Panchería hasta la dirección
// elegida por el cliente. El origen siempre es el local: la función no puede
// utilizarse como un servicio de rutas arbitrarias.

const PROJECT_ID = 'pixelpancheria';
const API_KEY = 'AIzaSyBQGQlfNxRVMk7UfvGI6VRqURwAw7JIMuI';
const DEFAULT_CONFIG = Object.freeze({
  deliveryEnabled: true,
  pickupEnabled: true,
  storeAddress: 'Calle 410 747, Juan María Gutiérrez',
  storeLat: -34.830395,
  storeLng: -58.188225,
  freeRadiusKm: 1,
  standardShippingCost: 3000,
  maxRoundTripMinutes: 45,
  maxDirectDistanceKm: 35,
  quoteMaxAgeMinutes: 360,
  estimatedCourierSpeedKmh: 25,
  streetDistanceFactor: 1.3,
  version: 1
});
const CACHE_TTL_MS = 15 * 60 * 1000;
const quoteCache = new Map();
let configCache = null;

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

function validPoint(point) {
  const lat = Number(point && point.lat);
  const lng = Number(point && point.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function fsDecode(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return fsDecodeFields((v.mapValue && v.mapValue.fields) || {});
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(fsDecode);
  return null;
}

function fsDecodeFields(fields) {
  const out = {};
  Object.keys(fields || {}).forEach(key => { out[key] = fsDecode(fields[key]); });
  return out;
}

function numberInRange(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function sanitizeConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    deliveryEnabled: source.deliveryEnabled !== false,
    pickupEnabled: source.pickupEnabled !== false,
    storeAddress: String(source.storeAddress || DEFAULT_CONFIG.storeAddress).slice(0, 200),
    storeLat: numberInRange(source.storeLat, DEFAULT_CONFIG.storeLat, -90, 90),
    storeLng: numberInRange(source.storeLng, DEFAULT_CONFIG.storeLng, -180, 180),
    freeRadiusKm: numberInRange(source.freeRadiusKm, DEFAULT_CONFIG.freeRadiusKm, 0, 50),
    standardShippingCost: numberInRange(source.standardShippingCost, DEFAULT_CONFIG.standardShippingCost, 0, 1000000),
    maxRoundTripMinutes: numberInRange(source.maxRoundTripMinutes, DEFAULT_CONFIG.maxRoundTripMinutes, 1, 600),
    maxDirectDistanceKm: numberInRange(source.maxDirectDistanceKm, DEFAULT_CONFIG.maxDirectDistanceKm, 1, 200),
    quoteMaxAgeMinutes: numberInRange(source.quoteMaxAgeMinutes, DEFAULT_CONFIG.quoteMaxAgeMinutes, 1, 1440),
    estimatedCourierSpeedKmh: numberInRange(source.estimatedCourierSpeedKmh, DEFAULT_CONFIG.estimatedCourierSpeedKmh, 1, 120),
    streetDistanceFactor: numberInRange(source.streetDistanceFactor, DEFAULT_CONFIG.streetDistanceFactor, 1, 3),
    version: numberInRange(source.version, DEFAULT_CONFIG.version, 1, Number.MAX_SAFE_INTEGER)
  };
}

async function loadDeliveryConfig(expectedVersion) {
  if (configCache && Date.now() - configCache.at < 30000
      && (!expectedVersion || Number(configCache.value.version) === Number(expectedVersion))) return configCache.value;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/settings/store?key=${API_KEY}`;
    const result = await fetch(url);
    if (!result.ok) throw new Error('settings no disponible');
    const data = await result.json();
    const store = fsDecodeFields(data.fields || {});
    const value = sanitizeConfig(store.deliveryConfig);
    configCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    if (expectedVersion && Number(expectedVersion) !== Number(DEFAULT_CONFIG.version)) throw error;
    console.warn('[delivery-config] usando valores seguros de respaldo:', error.message);
    return sanitizeConfig(DEFAULT_CONFIG);
  }
}

function haversineKm(a, b) {
  const toRad = value => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function seconds(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(String(value || ''));
  return match ? Math.round(Number(match[1])) : 0;
}

function waypoint(point) {
  return { location: { latLng: { latitude: Number(point.lat), longitude: Number(point.lng) } } };
}

async function route(from, to, apiKey) {
  const googleResponse = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters'
    },
    body: JSON.stringify({
      origin: waypoint(from),
      destination: waypoint(to),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      languageCode: 'es-AR',
      units: 'METRIC'
    })
  });
  const data = await googleResponse.json().catch(() => null);
  const first = data && data.routes && data.routes[0];
  const durationSeconds = seconds(first && first.duration);
  if (!googleResponse.ok || !first || !durationSeconds) {
    throw new Error((data && data.error && data.error.message) || 'Google Routes no devolvió una ruta válida');
  }
  return {
    durationSeconds,
    distanceMeters: Math.max(0, Number(first.distanceMeters) || 0)
  };
}

function quoteResult({ directKm, outbound, inbound, config }) {
  const outboundSeconds = outbound ? outbound.durationSeconds : 0;
  const returnSeconds = inbound ? inbound.durationSeconds : 0;
  const roundTripSeconds = outboundSeconds + returnSeconds;
  const free = directKm <= config.freeRadiusKm;
  const eligible = config.deliveryEnabled && (free || roundTripSeconds <= config.maxRoundTripMinutes * 60);
  return {
    eligible,
    deliveryEnabled: config.deliveryEnabled,
    pickupEnabled: config.pickupEnabled,
    configVersion: config.version,
    quoteMaxAgeMinutes: config.quoteMaxAgeMinutes,
    shippingTier: eligible && free ? 'free' : (eligible ? 'standard' : 'out_of_coverage'),
    shippingCost: eligible && free ? 0 : (eligible ? config.standardShippingCost : 0),
    directKm: Number(directKm.toFixed(3)),
    outboundSeconds,
    returnSeconds,
    roundTripSeconds,
    routeKm: outbound && inbound
      ? Number(((outbound.distanceMeters + inbound.distanceMeters) / 1000).toFixed(3))
      : null,
    quotedAt: new Date().toISOString()
  };
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'POST only' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (error) { return response(400, { error: 'JSON inválido' }); }

  const destination = { lat: Number(body.lat), lng: Number(body.lng) };
  if (!validPoint(destination)) return response(400, { error: 'Ubicación inválida' });

  let config;
  try { config = await loadDeliveryConfig(body.configVersion); }
  catch (error) { return response(503, { error: 'No pudimos validar la tarifa vigente. Probá nuevamente.' }); }
  if (body.configVersion && Number(body.configVersion) !== Number(config.version)) {
    return response(409, { error: 'La configuración de delivery cambió. Actualizá la página y volvé a cotizar.' });
  }
  if (!config.deliveryEnabled) {
    return response(200, quoteResult({ directKm: 0, outbound: null, inbound: null, config }));
  }
  const storeLocation = { lat: config.storeLat, lng: config.storeLng };

  const directKm = haversineKm(storeLocation, destination);
  if (directKm <= config.freeRadiusKm) {
    return response(200, quoteResult({ directKm, outbound: null, inbound: null, config }));
  }

  // Una dirección a esta distancia en línea recta no puede completar un viaje
  // urbano de ida y vuelta en 45 minutos. Evita consultas costosas o abusivas.
  if (directKm > config.maxDirectDistanceKm) {
    return response(200, {
      ...quoteResult({
        directKm,
        outbound: { durationSeconds: config.maxRoundTripMinutes * 60 + 1, distanceMeters: 0 },
        inbound: { durationSeconds: 0, distanceMeters: 0 },
        config
      }),
      routeKm: null
    });
  }

  const key = `${config.version}:${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return response(200, cached.value);
  }

  const apiKey = process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  if (!apiKey) return response(503, { error: 'El cálculo de cobertura no está configurado' });

  try {
    const [outbound, inbound] = await Promise.all([
      route(storeLocation, destination, apiKey),
      route(destination, storeLocation, apiKey)
    ]);
    const value = quoteResult({ directKm, outbound, inbound, config });
    quoteCache.set(key, { cachedAt: Date.now(), value });
    return response(200, value);
  } catch (error) {
    return response(502, { error: 'No pudimos verificar la cobertura en este momento' });
  }
};

exports._test = {
  DEFAULT_CONFIG,
  sanitizeConfig,
  haversineKm,
  seconds,
  quoteResult,
  resetCaches() { configCache = null; quoteCache.clear(); }
};
