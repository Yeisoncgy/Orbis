import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Ruta real (con la letra de unidad canónica): en Windows "c:" y "C:" duplican React en el bundle
const raiz = realpathSync.native(dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  root: join(raiz, 'app'),
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    outDir: join(raiz, 'dist', 'app'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
  server: {
    host: '127.0.0.1',
    port: 5180,
    proxy: { '/api': 'http://127.0.0.1:4810' },
  },
});
