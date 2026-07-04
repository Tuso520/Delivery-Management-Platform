import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
      exclude: ['node_modules', 'dist'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'html'],
        include: ['src/**/*.ts', 'src/**/*.vue'],
        exclude: [
          'src/**/*.spec.ts',
          'src/**/*.d.ts',
          'src/types/**/*',
          'src/**/index.ts',
        ],
      },
      setupFiles: [],
    },
  }),
);
