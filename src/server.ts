import { createApp } from './app';
import { env } from './config/env';
import { closePool } from './db/pool';

const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`Core Log API listening on port ${env.port}`);
  console.log(`🚀 Server running on http://localhost:${env.port}`);
});

async function shutdown() {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
