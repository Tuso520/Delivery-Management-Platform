import { writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

function buildInfoPlugin(): Plugin {
  const releaseId = process.env.VITE_RELEASE_ID?.trim() || 'development'

  return {
    name: 'delivery-build-info',
    apply: 'build',
    closeBundle() {
      writeFileSync(
        resolve(__dirname, 'dist/build-info.json'),
        `${JSON.stringify({
          releaseId,
          builtAt: new Date().toISOString(),
        }, null, 2)}\n`,
        'utf8',
      )
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    buildInfoPlugin(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
      '/storage': {
        target: process.env.VITE_STORAGE_PROXY_TARGET || 'http://localhost:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/storage/u, ''),
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        additionalData: `@use "@/styles/variables.scss" as *;\n`,
      },
    },
  },
  build: {
    modulePreload: {
      resolveDependencies(_filename, deps, context) {
        if (context.hostType !== 'html') return deps
        return deps.filter(
          (dep) =>
            !dep.includes('vendor-markdown') &&
            !dep.includes('vendor-pdf') &&
            !dep.includes('vendor-preview') &&
            !dep.includes('pdf.worker'),
        )
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) return 'runtime'
          if (!id.includes('node_modules')) return undefined
          const normalizedId = id.replaceAll('\\', '/')
          if (
            normalizedId.includes('/node_modules/vue/') ||
            normalizedId.includes('/node_modules/@vue/') ||
            normalizedId.includes('/node_modules/pinia/')
          ) {
            return 'vendor-vue'
          }
          if (
            id.includes('codemirror') ||
            id.includes('highlight.js') ||
            id.includes('markdown-it') ||
            id.includes('medium-zoom') ||
            id.includes('screenfull') ||
            id.includes('xss') ||
            id.includes('cropperjs') ||
            id.includes('prettier')
          ) {
            return 'vendor-markdown'
          }
          if (id.includes('pdfjs-dist')) return 'vendor-pdf'
          if (id.includes('viewerjs')) return 'vendor-preview'
          if (id.includes('axios') || id.includes('dayjs')) return 'vendor-utils'
          return undefined
        },
      },
    },
  },
})
