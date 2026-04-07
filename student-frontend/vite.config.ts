import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (
            id.includes('/react/') ||
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('scheduler')
          ) {
            return 'react-core'
          }

          if (
            id.includes('react-markdown') ||
            id.includes('remark-math') ||
            id.includes('rehype-katex') ||
            id.includes('/katex/')
          ) {
            return 'markdown'
          }

          if (id.includes('@supabase/')) {
            return 'supabase'
          }

          if (id.includes('framer-motion') || id.includes('lucide-react')) {
            return 'ui-vendor'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
      },
    },
  },
})
