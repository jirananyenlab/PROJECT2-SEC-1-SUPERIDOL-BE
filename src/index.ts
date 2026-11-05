import { createApp } from './app';
import { db } from './db';

await db.$connect();
const app = createApp().listen(Number(process.env.PORT ?? 5000));
console.log(`Math Raining API listening on port ${app.server?.port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.stop();
    await db.$disconnect();
    process.exit(0);
  });
}
