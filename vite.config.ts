import { defineConfig } from 'vitest/config'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './',
  // Inline all JS/CSS into dist/index.html: the build output is a single
  // standalone file that runs from file:// with a double-click (inline module
  // scripts don't trip file:// CORS the way src= module scripts do).
  plugins: [viteSingleFile()],
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
