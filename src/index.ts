// Vercel discovers this entrypoint and serves the default Elysia export.
import 'elysia';
import { createApp } from './application.js';

const app = createApp();
export default app;
