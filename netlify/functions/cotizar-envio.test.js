const assert = require('assert');
const { handler } = require('./cotizar-envio');

async function invoke(lat, lng) {
  const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ lat, lng }) });
  return { statusCode: result.statusCode, body: JSON.parse(result.body) };
}

async function run() {
  const originalFetch = global.fetch;
  const originalKey = process.env.GOOGLE_ROUTES_API_KEY;
  try {
    const free = await invoke(-34.8304, -58.1882);
    assert.equal(free.statusCode, 200);
    assert.equal(free.body.shippingTier, 'free');
    assert.equal(free.body.shippingCost, 0);

    process.env.GOOGLE_ROUTES_API_KEY = 'test';
    let call = 0;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ routes: [{ duration: (call++ ? 700 : 600) + 's', distanceMeters: 5000 }] })
    });
    const standard = await invoke(-34.86, -58.23);
    assert.equal(standard.statusCode, 200);
    assert.equal(standard.body.eligible, true);
    assert.equal(standard.body.shippingTier, 'standard_3000');
    assert.equal(standard.body.shippingCost, 3000);
    assert.equal(standard.body.roundTripSeconds, 1300);

    global.fetch = async () => ({
      ok: true,
      json: async () => ({ routes: [{ duration: '1400s', distanceMeters: 9000 }] })
    });
    const outside = await invoke(-34.89, -58.26);
    assert.equal(outside.statusCode, 200);
    assert.equal(outside.body.eligible, false);
    assert.equal(outside.body.shippingTier, 'out_of_coverage');
    assert.equal(outside.body.shippingCost, 0);

    console.log('cotizar-envio: 3 escenarios correctos');
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
