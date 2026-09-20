const assert = require('assert');
const { handler, _test } = require('../netlify/functions/cotizar-envio');

async function invoke(lat, lng, extra = {}) {
  const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ lat, lng, ...extra }) });
  return { statusCode: result.statusCode, body: JSON.parse(result.body) };
}

async function run() {
  const originalFetch = global.fetch;
  const originalKey = process.env.GOOGLE_ROUTES_API_KEY;
  try {
    const config = {
      deliveryEnabled: true, pickupEnabled: true, storeAddress: 'Local de prueba',
      storeLat: -34.830395, storeLng: -58.188225, freeRadiusKm: 1,
      standardShippingCost: 3000, maxRoundTripMinutes: 45,
      maxDirectDistanceKm: 35, quoteMaxAgeMinutes: 360,
      estimatedCourierSpeedKmh: 25, streetDistanceFactor: 1.3, version: 7
    };
    const firestoreResponse = () => ({
      ok: true,
      json: async () => ({ fields: { deliveryConfig: { mapValue: { fields: Object.fromEntries(
        Object.entries(config).map(([key, value]) => [key, typeof value === 'boolean'
          ? { booleanValue: value }
          : typeof value === 'number' ? { doubleValue: value } : { stringValue: value }])
      ) } } } })
    });
    global.fetch = async url => {
      if (String(url).includes('firestore.googleapis.com')) return firestoreResponse();
      throw new Error('No se esperaba consultar rutas en zona gratuita');
    };
    _test.resetCaches();
    const free = await invoke(-34.8304, -58.1882);
    assert.equal(free.statusCode, 200);
    assert.equal(free.body.shippingTier, 'free');
    assert.equal(free.body.shippingCost, 0);

    process.env.GOOGLE_ROUTES_API_KEY = 'test';
    let call = 0;
    global.fetch = async url => String(url).includes('firestore.googleapis.com') ? firestoreResponse() : ({
      ok: true,
      json: async () => ({ routes: [{ duration: (call++ ? 700 : 600) + 's', distanceMeters: 5000 }] })
    });
    _test.resetCaches();
    const standard = await invoke(-34.86, -58.23);
    assert.equal(standard.statusCode, 200);
    assert.equal(standard.body.eligible, true);
    assert.equal(standard.body.shippingTier, 'standard');
    assert.equal(standard.body.shippingCost, 3000);
    assert.equal(standard.body.roundTripSeconds, 1300);
    assert.equal(standard.body.configVersion, 7);

    _test.resetCaches();
    const stale = await invoke(-34.86, -58.23, { configVersion: 6 });
    assert.equal(stale.statusCode, 409);

    global.fetch = async url => String(url).includes('firestore.googleapis.com') ? firestoreResponse() : ({
      ok: true,
      json: async () => ({ routes: [{ duration: '1400s', distanceMeters: 9000 }] })
    });
    _test.resetCaches();
    const outside = await invoke(-34.89, -58.26);
    assert.equal(outside.statusCode, 200);
    assert.equal(outside.body.eligible, false);
    assert.equal(outside.body.shippingTier, 'out_of_coverage');
    assert.equal(outside.body.shippingCost, 0);

    config.deliveryEnabled = false;
    _test.resetCaches();
    const disabled = await invoke(-34.8304, -58.1882);
    assert.equal(disabled.statusCode, 200);
    assert.equal(disabled.body.eligible, false);
    assert.equal(disabled.body.deliveryEnabled, false);

    console.log('cotizar-envio: 5 escenarios correctos');
  } finally {
    global.fetch = originalFetch;
    if (originalKey == null) delete process.env.GOOGLE_ROUTES_API_KEY;
    else process.env.GOOGLE_ROUTES_API_KEY = originalKey;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
