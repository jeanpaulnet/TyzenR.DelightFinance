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
});
