/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// JSX compilé par esbuild (runtime automatique de React), sans plugin supplémentaire.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@supabase/supabase-js', '@tanstack/react-query', 'date-fns'],
        },
      },
      onwarn(warning, warn) {
        // React Query marque ses fichiers « use client » : sans effet hors React Server Components.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
