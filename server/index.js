import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const { http, close } = createApp({
  dbFile: process.env.DATABASE_FILE || 'data/quizy.db',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  trustProxy: process.env.TRUST_PROXY === '1',
});

http.listen(port, () => console.log(`Quizy rulează pe http://localhost:${port}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await close();
    process.exit(0);
  });
}
