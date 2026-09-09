import { defineConfig } from 'vite';

// GitHub Pages serves a project site from /<repo>/, not from the domain root, so
// asset URLs need that prefix baked in at build time. Set by the deploy workflow;
// locally it stays '/' so the dev server is unaffected.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  server: { port: 5178, open: true },
  build: { outDir: 'dist' }
});
