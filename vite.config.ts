import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@x402/extensions': new URL(
        './src/lib/x402-browser-extensions.ts',
        import.meta.url,
      ).pathname,
    },
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart(),
    viteReact(),
  ],
  // Workaround for https://github.com/TanStack/router/issues/5738
  optimizeDeps: {
    include: ['@clerk/tanstack-react-start', 'cookie'],
  },
})
