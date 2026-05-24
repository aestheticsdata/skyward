import path from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    // Mirror of tsconfig "paths". Keep the two in sync.
    alias: {
      '@constants': path.resolve(root, './src/constants'),
      '@types': path.resolve(root, './src/types'),
      '@game': path.resolve(root, './src/game'),
      '@entities': path.resolve(root, './src/entities'),
      '@systems': path.resolve(root, './src/systems'),
      '@world': path.resolve(root, './src/world'),
      '@': path.resolve(root, './src'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
  },
});
