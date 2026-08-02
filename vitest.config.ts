import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// Test runner config — mirrors vite.config.ts's `@` alias so test imports
// resolve exactly like app imports. Default environment is `node` (pure
// logic tests); the form component test opts into jsdom via a docblock.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
