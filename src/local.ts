// Port listeners and process shutdown hooks are only used for local development.
import app from './index.js';
import { db } from './db.js';

await db.$connect();
app.listen(Number(process.env.PORT ?? 5000));
console.log(`Math Raining API listening on port ${app.server?.port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.stop();
    await db.$disconnect();
    process.exit(0);
  });
}
