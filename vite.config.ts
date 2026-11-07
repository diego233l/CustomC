import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: la app funciona servida en la raíz o en un subdirectorio.
  base: './',
  plugins: [react()],
  worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'assets/[name]-[hash].js' } } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
  server: { host: true },
});
