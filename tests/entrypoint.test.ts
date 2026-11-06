import { expect, test } from 'bun:test';
import app from '../src/index.js';

test('Vercel entrypoint exports an app without opening a port', async () => {
  expect(app.server).toBeNull();
  const response = await app.handle(new Request('http://localhost/'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ service: 'math-raining-api', status: 'ok', health: '/health' });
});
