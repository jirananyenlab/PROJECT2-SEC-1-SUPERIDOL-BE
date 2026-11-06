import { afterAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/application.js';
import { db } from '../src/db.js';

const app = createApp();
const call = (path: string, method = 'GET', body?: unknown, token?: string) =>
  app.handle(new Request(`http://localhost${path}`, { method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));

test('profile access requires authentication', async () => {
  expect((await call('/usersProfile/someone')).status).toBe(401);
});
test('registration and pagination reject invalid payloads', async () => {
  expect((await call('/auth/register', 'POST', { email: 'bad', password: '1', userName: '' })).status).toBe(422);
  expect((await call('/usersProfile?_page=0')).status).toBe(422);
  expect((await call('/usersProfile?_per_page=101')).status).toBe(422);
});
test('legacy users endpoint does not expose credentials', async () => {
  expect((await call('/users')).status).toBe(404);
});

const integration = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;
integration('PostgreSQL API lifecycle', () => {
  const email = `integration-${crypto.randomUUID()}@example.com`;
  const password = 'SecurePass123';
  let id = '';
  let token = '';
  const ids: string[] = [];
  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  test('health connects to PostgreSQL', async () => {
    expect((await call('/health')).status).toBe(200);
  });
  test('registration atomically creates profile and hashes password', async () => {
    const res = await call('/auth/register', 'POST', { email, password, userName: 'Integration' });
    expect(res.status).toBe(201);
    const user = await res.json(); id = user.id; ids.push(id);
    expect(user.passwordHash).toBeUndefined();
    const record = await db.user.findUniqueOrThrow({ where: { id }, include: { profile: true } });
    expect(await Bun.password.verify(password, record.passwordHash)).toBe(true);
    expect(record.profile?.totalScore).toEqual(Array(8).fill(0));
    expect(record.profile?.customMode).toEqual([]);
  });
  test('normalized duplicate emails rejected', async () => {
    expect((await call('/auth/register', 'POST', { email: email.toUpperCase(), password, userName: 'Duplicate' })).status).toBe(409);
  });
  test('login verifies password and creates session', async () => {
    expect((await call('/auth/login', 'POST', { email, password: 'wrong' })).status).toBe(401);
    const res = await call('/auth/login', 'POST', { email, password });
    expect(res.status).toBe(200); token = (await res.json()).token;
    expect((await call(`/usersProfile/${id}`, 'GET', undefined, token)).status).toBe(200);
  });
  test('another account cannot read or modify profile or delete user', async () => {
    const second = await call('/auth/register', 'POST', { email: `other-${email}`, password, userName: 'Other' });
    const other = (await second.json()).id; ids.push(other);
    expect((await call(`/usersProfile/${other}`, 'GET', undefined, token)).status).toBe(403);
    expect((await call(`/usersProfile/${other}`, 'PATCH', { rankingHighScore: 1 }, token)).status).toBe(403);
    expect((await call(`/users/${other}`, 'DELETE', undefined, token)).status).toBe(403);
  });
  test('profile, settings, achievements, custom modes and results persist', async () => {
    const changes = {
      userName: 'Updated', rankingHighScore: 25,
      completeAchievement: [{ id: '1', name: 'Achievement', isComplete: true }],
      totalScore: [5, 0, 0, 0, 0, 0, 0, 0], totalTimePlay: [20, 0, 0, 0, 0, 0, 0, 0],
      profileConfig: { musicVolume: 19, effectVolume: 14, showAchievementBadge: ['1', null, null] },
      customMode: [{ nameLevel: 'Test', numberRange: 1, lengthExpression: 1, symbol: ['+'], dropSpeed: 0, health: 1, endScore: null }],
    };
    const res = await call(`/usersProfile/${id}`, 'PUT', changes, token);
    expect(res.status).toBe(200);
    const profile = await (await call(`/usersProfile/${id}`, 'GET', undefined, token)).json();
    for (const [key, value] of Object.entries(changes)) expect(profile[key]).toEqual(value);
    expect((await db.user.findUniqueOrThrow({ where: { id } })).userName).toBe('Updated');
    await call(`/usersProfile/${id}`, 'PATCH', { rankingHighScore: 2 }, token);
    expect((await db.profile.findUniqueOrThrow({ where: { id } })).rankingHighScore).toBe(25);
  });
  test('invalid settings and result data rejected', async () => {
    expect((await call(`/usersProfile/${id}`, 'PATCH', { totalScore: [-1] }, token)).status).toBe(422);
    expect((await call(`/usersProfile/${id}`, 'PATCH', { profileConfig: { musicVolume: 101 } }, token)).status).toBe(422);
    expect((await call(`/usersProfile/${id}`, 'PATCH', { id: 'different' }, token)).status).toBe(422);
  });
  test('leaderboard is paginated, ordered, and excludes private fields', async () => {
    const res = await call('/usersProfile?_page=1&_per_page=5&_sort=-rankingHighScore');
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.items).toBeGreaterThanOrEqual(2);
    expect(result.data.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < result.data.length; i++) expect(result.data[i - 1].rankingHighScore).toBeGreaterThanOrEqual(result.data[i].rankingHighScore);
    for (const item of result.data) expect(Object.keys(item).sort()).toEqual(['id', 'rankingHighScore', 'userName']);
  });
  test('logout revokes token and account deletion cascades', async () => {
    expect((await call('/auth/logout', 'POST', undefined, token)).status).toBe(200);
    expect((await call(`/usersProfile/${id}`, 'GET', undefined, token)).status).toBe(401);
    token = (await (await call('/auth/login', 'POST', { email, password })).json()).token;
    expect((await call(`/users/${id}`, 'DELETE', undefined, token)).status).toBe(200);
    expect(await db.profile.findUnique({ where: { id } })).toBeNull();
    expect(await db.session.count({ where: { userId: id } })).toBe(0);
  });
});
