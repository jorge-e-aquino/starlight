import { defineConfig } from 'vite';
import calendarHandler from './api/calendar.js';

// GitHub Pages serves a project site from /<repo>/, not from the domain root, so
// asset URLs need that prefix baked in at build time. Set by the deploy workflow;
// locally it stays '/' so the dev server is unaffected.
const base = process.env.BASE_PATH || '/';

// Vercel serves /api/calendar in production. Mirror that one read-only route
// during local development so the same review flow can be exercised here.
function calendarDevRoute() {
  return {
    name: 'starlight-calendar-dev-route',
    configureServer(server) {
      server.middlewares.use('/api/calendar', async (req, res) => {
        const chunks = [];
        let size = 0;
        try {
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 2_000_000) { res.statusCode = 413; res.end(JSON.stringify({ error: 'Calendar request is too large.' })); return; }
            chunks.push(chunk);
          }
          req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        } catch { req.body = {}; }
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (value) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res; };
        res.send = (value) => { res.end(value); return res; };
        await calendarHandler(req, res);
      });
    }
  };
}

export default defineConfig({
  base,
  plugins: [calendarDevRoute()],
  server: { port: 5178, open: true },
  build: { outDir: 'dist' }
});
