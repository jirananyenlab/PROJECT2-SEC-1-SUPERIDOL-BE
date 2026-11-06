import { expect, test } from 'bun:test';
import { createApp } from '../src/application.js';

const origin = 'https://math-raining.vercel.app';

test('deployed frontend can preflight login and authenticated API requests', async () => {
  const app = createApp();
  for (const path of ['/auth/login', '/usersProfile/0']) {
    const response = await app.handle(new Request(`http://localhost${path}`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization' },
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
  }
});

test('deployed frontend can read authentication errors', async () => {
  const response = await createApp().handle(new Request('http://localhost/usersProfile/0', {
    headers: { Origin: origin },
  }));
  expect(response.status).toBe(401);
  expect(response.headers.get('access-control-allow-origin')).toBe(origin);
});

test('untrusted origin is not permitted', async () => {
  const response = await createApp().handle(new Request('http://localhost/auth/login', {
    method: 'OPTIONS',
    headers: { Origin: 'https://math-raining.vercel.app.evil.example',
      'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  }));
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
});
