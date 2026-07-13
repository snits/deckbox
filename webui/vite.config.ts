import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import os from 'node:os'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Serve deck card art referenced by absolute paths in deck YAML through
    // Vite's /@fs/ route. Home dir covers the project and any deck under it;
    // dev server only — production build is unaffected.
    fs: { allow: [os.homedir()] },
  },
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    restoreMocks: true,
  },
})
