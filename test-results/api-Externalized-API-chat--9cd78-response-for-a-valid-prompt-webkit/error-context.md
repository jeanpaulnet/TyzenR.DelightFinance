# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api.spec.ts >> Externalized API >> chat endpoint should return a response for a valid prompt
- Location: tests/api.spec.ts:26:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 500
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Externalized API', () => {
  4  |   test('health check should return ok', async ({ request }) => {
  5  |     const response = await request.get('/api/health');
  6  |     expect(response.ok()).toBeTruthy();
  7  |     
  8  |     const body = await response.json();
  9  |     expect(body).toMatchObject({
  10 |       status: 'ok',
  11 |       version: '1.8.0', // This is what I set in version 1.8.0 release notes
  12 |       externalApi: true
  13 |     });
  14 |   });
  15 | 
  16 |   test('chat endpoint requires a prompt', async ({ request }) => {
  17 |     const response = await request.post('/api/chat', {
  18 |       data: {}
  19 |     });
  20 |     
  21 |     expect(response.status()).toBe(400);
  22 |     const body = await response.json();
  23 |     expect(body.error).toBe("Missing 'prompt' in request body.");
  24 |   });
  25 | 
  26 |   test('chat endpoint should return a response for a valid prompt', async ({ request }) => {
  27 |     test.setTimeout(30000); // AI calls can be slow
  28 |     const response = await request.post('/api/chat', {
  29 |       data: {
  30 |         prompt: "Say 'Hello, I am working!'"
  31 |       }
  32 |     });
  33 |     
  34 |     const body = await response.json();
  35 |     if (response.status() !== 200) {
  36 |       console.error('Error Body:', body);
  37 |     }
> 38 |     expect(response.status()).toBe(200);
     |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  39 |     expect(body.text).toBeDefined();
  40 |     expect(typeof body.text).toBe('string');
  41 |     console.log('Gemini Response:', body.text);
  42 |   });
  43 | });
  44 | 
```