// Cotiza la cobertura de delivery desde Pixel Panchería hasta la dirección
// elegida por el cliente. El origen siempre es el local: la función no puede
// utilizarse como un servicio de rutas arbitrarias.

const STORE_LOCATION = { lat: -34.830395, lng: -58.188225 };
const FREE_RADIUS_KM = 1;
const STANDARD_SHIPPING_COST = 3000;
const MAX_ROUND_TRIP_SECONDS = 45 * 60;
const MAX_DIRECT_DISTANCE_KM = 35;
const CACHE_TTL_MS = 15 * 60 * 1000;
const quoteCache = new Map();

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

function quoteResult({ directKm, outbound, inbound }) {
  const outboundSeconds = outbound ? outbound.durationSeconds : 0;
  const returnSeconds = inbound ? inbound.durationSeconds : 0;
  const roundTripSeconds = outboundSeconds + returnSeconds;
  const free = directKm <= FREE_RADIUS_KM;
  const eligible = free || roundTripSeconds <= MAX_ROUND_TRIP_SECONDS;
  return {
    eligible,
    shippingTier: free ? 'free' : (eligible ? 'standard_3000' : 'out_of_coverage'),
    shippingCost: free ? 0 : (eligible ? STANDARD_SHIPPING_COST : 0),
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

  const directKm = haversineKm(STORE_LOCATION, destination);
  if (directKm <= FREE_RADIUS_KM) {
    return response(200, quoteResult({ directKm, outbound: null, inbound: null }));
  }

  // Una dirección a esta distancia en línea recta no puede completar un viaje
  // urbano de ida y vuelta en 45 minutos. Evita consultas costosas o abusivas.
  if (directKm > MAX_DIRECT_DISTANCE_KM) {
    return response(200, {
      ...quoteResult({
        directKm,
        outbound: { durationSeconds: MAX_ROUND_TRIP_SECONDS + 1, distanceMeters: 0 },
        inbound: { durationSeconds: 0, distanceMeters: 0 }
      }),
      routeKm: null
    });
  }

  const key = `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return response(200, cached.value);
  }

  const apiKey = process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  if (!apiKey) return response(503, { error: 'El cálculo de cobertura no está configurado' });

  try {
    const [outbound, inbound] = await Promise.all([
      route(STORE_LOCATION, destination, apiKey),
      route(destination, STORE_LOCATION, apiKey)
    ]);
    const value = quoteResult({ directKm, outbound, inbound });
    quoteCache.set(key, { cachedAt: Date.now(), value });
    return response(200, value);
  } catch (error) {
    return response(502, { error: 'No pudimos verificar la cobertura en este momento' });
  }
};

exports._test = {
  STORE_LOCATION,
  FREE_RADIUS_KM,
  MAX_ROUND_TRIP_SECONDS,
  haversineKm,
  seconds,
  quoteResult
};
