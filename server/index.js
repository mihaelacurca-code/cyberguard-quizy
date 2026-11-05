import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const { http, close } = createApp({
  dbFile: process.env.DATABASE_FILE || 'data/quizy.db',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  trustProxy: process.env.TRUST_PROXY === '1',
});

const host = process.env.HOST || '0.0.0.0';
http.listen(port, host, () => console.log(`Quizy rulează pe http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await close();
    process.exit(0);
  });
}
