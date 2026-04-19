import { test, expect } from '@playwright/test';

test.describe('Externalized API', () => {
  test('health check should return ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body).toMatchObject({
      status: 'ok',
      version: '1.8.0', // This is what I set in version 1.8.0 release notes
      externalApi: true
    });
  });

  test('chat endpoint requires a prompt', async ({ request }) => {
    const response = await request.post('/api/chat', {
      data: {}
    });
    
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing 'prompt' in request body.");
  });

  test('chat endpoint should return a response for a valid prompt', async ({ request }) => {
    test.setTimeout(30000); // AI calls can be slow
    const response = await request.post('/api/chat', {
      data: {
        prompt: "Say 'Hello, I am working!'"
      }
    });
    
    const body = await response.json();
    if (response.status() !== 200) {
      console.error('Error Body:', body);
    }
    expect(response.status()).toBe(200);
    expect(body.text).toBeDefined();
    expect(typeof body.text).toBe('string');
    console.log('Gemini Response:', body.text);
  });
});
