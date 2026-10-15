import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173, open: false },
  // O Three.js sozinho passa de 500 kB; o aviso padrão não se aplica aqui.
  build: { chunkSizeWarningLimit: 900 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
