const request = require('supertest');

// Note: In the actual demo environment, this will require the generated server file.
// We expect the agent to write server.js which exports the Express app.
let app;
try {
  app = require('../server.js');
} catch (e) {
  console.log("Waiting for Agent to create server.js...");
}

describe('ONDC Beckn Protocol Validation', () => {
  if (!app) return;

  it('should return a valid /search catalog matching the Grocery Schema', async () => {
    // 1. We act as the ONDC Gateway sending a search intent
    const response = await request(app)
      .post('/search')
      .set('Authorization', 'Signature keyId="mock-gateway",algorithm="ed25519",headers="(created) (expires) digest",signature="mock_valid_signature"')
      .send({
        context: {
          domain: "nic2004:52110",
          action: "search"
        },
        message: {
          intent: {
            item: { descriptor: { name: "Milk" } }
          }
        }
      });

    expect(response.status).toBe(200);
    
    // 2. Validate strict schema requirements
    const catalog = response.body.message.catalog;
    expect(catalog).toBeDefined();
    
    const provider = catalog['bpp/providers'][0];
    expect(provider).toBeDefined();

    // 🔴 THE TRAP: We strictly enforce FSSAI license for grocery.
    // If the agent mapped the CSV but forgot to inject a dummy FSSAI, this test will FAIL.
    expect(provider.fssai_license_no).toBeDefined();
    expect(provider.fssai_license_no.length).toBeGreaterThan(10);
    
    // 3. Verify item mapping
    expect(provider.items.length).toBeGreaterThan(0);
    expect(provider.items[0].price.value).toBeDefined();
  });
});
