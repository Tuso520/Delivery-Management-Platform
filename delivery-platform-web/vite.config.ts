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
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/variables.scss" as *;\n`,
      },
    },
  },
})
