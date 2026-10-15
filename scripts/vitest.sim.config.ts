import { defineConfig } from 'vitest/config';

// Configuração para simulações longas (IA contra IA), fora da suíte normal de testes.
export default defineConfig({
  test: { include: ['scripts/**/*.test.ts'], environment: 'node', testTimeout: 600000 },
});
