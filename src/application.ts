import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';

const credentials = t.Object({
  email: t.String({ format: 'email', maxLength: 254 }),
  password: t.String({ minLength: 1, maxLength: 128 }),
});
const userName = t.String({ minLength: 1, maxLength: 50, pattern: '\\S' });
const jsonObject = t.Record(t.String(), t.Any());
const profileBody = t.Object({
  id: t.Optional(t.String()),
  userName: t.Optional(userName),
  rankingHighScore: t.Optional(t.Integer({ minimum: 0, maximum: 2147483647 })),
  completeAchievement: t.Optional(t.Array(jsonObject, { maxItems: 200 })),
  profileConfig: t.Optional(t.Object({
    effectVolume: t.Number({ minimum: 0, maximum: 100 }),
    musicVolume: t.Number({ minimum: 0, maximum: 100 }),
    showAchievementBadge: t.Array(t.Union([t.String(), t.Null()]), { minItems: 3, maxItems: 3 }),
  })),
  totalScore: t.Optional(t.Array(t.Integer({ minimum: 0, maximum: 2147483647 }), { minItems: 8, maxItems: 8 })),
  totalTimePlay: t.Optional(t.Array(t.Integer({ minimum: 0, maximum: 2147483647 }), { minItems: 8, maxItems: 8 })),
  customLevel: t.Optional(t.Array(jsonObject, { maxItems: 100 })),
  customMode: t.Optional(t.Array(t.Object({
    nameLevel: t.String({ minLength: 1, maxLength: 100 }),
    numberRange: t.Number({ minimum: 0, maximum: 1000000 }),
    lengthExpression: t.Integer({ minimum: 1, maximum: 100 }),
    symbol: t.Array(t.Union([t.Literal('+'), t.Literal('-'), t.Literal('*'), t.Literal('/')]), { minItems: 1, maxItems: 4 }),
    dropSpeed: t.Number({ minimum: 0, maximum: 10000 }),
    health: t.Number({ minimum: 1, maximum: 1000000 }),
    endScore: t.Union([t.Number({ minimum: 0, maximum: 1000000 }), t.Null()]),
  }), { maxItems: 100 })),
  descrition: t.Optional(t.String({ maxLength: 1000 })),
});

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const normalizeEmail = (email: string) => email.trim().toLowerCase();
class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function requireUser(headers: Record<string, string | undefined>, id?: string) {
  const token = headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new ApiError(401, 'Please sign in');
  const session = await db.session.findUnique({ where: { tokenHash: hash(token) } });
  if (!session || session.expiresAt <= new Date()) throw new ApiError(401, 'Session expired');
  if (id && id !== session.userId) throw new ApiError(403, 'Access denied');
  return session;
}

export function createApp() {
  // Bounded per-email login throttling, without trusting forwarded IP headers.
  const attempts = new Map<string, { count: number; until: number }>();
  const app = new Elysia({ normalize: false, serve: { maxRequestBodySize: 1024 * 1024 } })
    .use(cors({
      origin: [...new Set([
        'https://math-raining.vercel.app',
        ...(process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173').split(','),
      ].map(value => value.trim().replace(/\/+$/, '')).filter(Boolean))],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }))
    .onError(({ error, code, set }) => {
      if (error instanceof ApiError) {
        set.status = error.status;
        return { message: error.message };
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') { set.status = 409; return { message: 'Email already registered' }; }
        if (error.code === 'P2025') { set.status = 404; return { message: 'User not found' }; }
      }
      if (code === 'VALIDATION' || code === 'PARSE') {
        set.status = 422; return { message: 'Invalid request data' };
      }
      if (code === 'NOT_FOUND') { set.status = 404; return { message: 'Route not found' }; }
      set.status = 500;
      console.error('API request failed', code);
      return { message: 'Internal server error' };
    })
    .get('/', () => ({ service: 'math-raining-api', status: 'ok', health: '/health' }))
    .get('/health', async ({ set }) => {
      try { await db.$queryRaw`SELECT 1`; return { status: 'ok' }; }
      catch { set.status = 503; return { status: 'unavailable' }; }
    })
    .post('/auth/register', async ({ body, set }) => {
      const passwordHash = await Bun.password.hash(body.password, { algorithm: 'argon2id' });
      const user = await db.user.create({ data: {
        email: normalizeEmail(body.email), userName: body.userName.trim(), passwordHash,
        profile: { create: { userName: body.userName.trim() } },
      }, select: { id: true, email: true, userName: true } });
      set.status = 201;
      return user;
    }, { body: t.Object({
      email: t.String({ format: 'email', maxLength: 254 }),
      password: t.String({ minLength: 8, maxLength: 128 }), userName,
    }) })
    .post('/auth/login', async ({ body }) => {
      const email = normalizeEmail(body.email);
      const now = Date.now();
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      const attempt = attempts.get(email) ?? { count: 0, until: now + 15 * 60 * 1000 };
      if (attempt.count >= 10) throw new ApiError(429, 'Too many login attempts; try again later');
      if (attempts.size >= 10000 && !attempts.has(email)) throw new ApiError(429, 'Try again later');
      attempt.count++;
      attempts.set(email, attempt);
      const user = await db.user.findUnique({ where: { email } });
      if (!user || !await Bun.password.verify(body.password, user.passwordHash)) {
        throw new ApiError(401, 'Invalid email or password');
      }
      attempts.delete(email);
      const token = randomBytes(32).toString('hex');
      await db.session.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
      await db.session.create({ data: {
        tokenHash: hash(token), userId: user.id, expiresAt: new Date(now + 7 * 86400000),
      } });
      return { token, user: { id: user.id, email: user.email, userName: user.userName } };
    }, { body: credentials })
    .post('/auth/logout', async ({ headers }) => {
      const session = await requireUser(headers);
      await db.session.delete({ where: { tokenHash: session.tokenHash } });
      return { message: 'Signed out' };
    })
    .get('/usersProfile', async ({ query }) => {
      const page = Number(query._page ?? 1);
      const perPage = Number(query._per_page ?? 5);
      const [items, data] = await db.$transaction([
        db.profile.count(),
        db.profile.findMany({ skip: (page - 1) * perPage, take: perPage,
          orderBy: [{ rankingHighScore: 'desc' }, { id: 'asc' }],
          select: { id: true, userName: true, rankingHighScore: true },
        }),
      ]);
      const pages = Math.ceil(items / perPage);
      return { data, items, pages, first: 1, prev: page > 1 ? page - 1 : null,
        next: page < pages ? page + 1 : null, last: pages };
    }, { query: t.Object({
      _page: t.Optional(t.Numeric({ minimum: 1, maximum: 100000, multipleOf: 1 })),
      _per_page: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
      _sort: t.Optional(t.Literal('-rankingHighScore')),
    }) })
    .get('/usersProfile/:id', async ({ headers, params }) => {
      await requireUser(headers, params.id);
      const profile = await db.profile.findUnique({ where: { id: params.id } });
      if (!profile) throw new ApiError(404, 'Profile not found');
      return profile;
    })
    .delete('/users/:id', async ({ headers, params }) => {
      await requireUser(headers, params.id);
      await db.user.delete({ where: { id: params.id } });
      return { message: 'Account deleted' };
    });

  const update = async ({ headers, params, body }: {
    headers: Record<string, string | undefined>; params: { id: string };
    body: typeof profileBody.static;
  }) => {
    await requireUser(headers, params.id);
    if (body.id && body.id !== params.id) throw new ApiError(422, 'Profile ID cannot change');
    const { id, rankingHighScore, ...rest } = body;
    return db.$transaction(async tx => {
      const data = { ...rest, ...(rest.userName ? { userName: rest.userName.trim() } : {}) } as Prisma.ProfileUpdateInput;
      if (rest.userName) await tx.user.update({ where: { id: params.id }, data: { userName: rest.userName.trim() } });
      // Conditional update prevents an older game result from lowering the high score.
      if (rankingHighScore !== undefined) await tx.profile.updateMany({
        where: { id: params.id, rankingHighScore: { lt: rankingHighScore } }, data: { rankingHighScore },
      });
      return tx.profile.update({ where: { id: params.id }, data });
    });
  };
  return app.patch('/usersProfile/:id', update, { body: profileBody })
    .put('/usersProfile/:id', update, { body: profileBody });
}
