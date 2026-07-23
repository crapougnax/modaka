import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import * as path from 'node:path';
import * as fs from 'node:fs';

const coreDir = process.env.CORE_DIR || '/Users/crapougnax/CODE/QUATRAIN/Core/packages';
const hasLocalPortal = fs.existsSync(coreDir);

const localAliases = hasLocalPortal ? {
  '@quatrain/core': path.join(coreDir, 'core/src/index.ts'),
  '@quatrain/types': path.join(coreDir, 'types/src/index.ts'),
  '@quatrain/backend': path.join(coreDir, 'backend/src/index.ts'),
  '@quatrain/storage': path.join(coreDir, 'storage/src/index.ts'),
  '@quatrain/storage-git': path.join(coreDir, 'storage-git/src/index.ts'),
  '@quatrain/storage-local': path.join(coreDir, 'storage-local/src/index.ts'),
  '@quatrain/storage-s3': path.join(coreDir, 'storage-s3/src/index.ts'),
  '@quatrain/okf': path.join(coreDir, 'okf/src/index.ts'),
  '@quatrain/api-server-astro': path.join(coreDir, 'api-server-astro/src/index.ts'),
  '@quatrain/api-server': path.join(coreDir, 'api-server/src/index.ts'),
  '@quatrain/api': path.join(coreDir, 'api/src/index.ts'),
  '@quatrain/http': path.join(coreDir, 'http/src/index.ts'),
  '@quatrain/ai-gemini': path.join(coreDir, 'ai-gemini/src/index.ts'),
  '@quatrain/ai': path.join(coreDir, 'ai/src/index.ts'),
  '@quatrain/log': path.join(coreDir, 'log/src/index.ts'),
  '@quatrain/chat': path.join(coreDir, 'chat/src/index.ts'),
  '@quatrain/ingestion': path.join(coreDir, 'ingestion/src/index.ts'),
  '@quatrain/ingestion-audio': path.join(coreDir, 'ingestion-audio/src/index.ts'),
  '@quatrain/ingestion-ocr': path.join(coreDir, 'ingestion-ocr/src/index.ts'),
  '@quatrain/ingestion-web': path.join(coreDir, 'ingestion-web/src/index.ts'),
  '@quatrain/queue': path.join(coreDir, 'queue/src/index.ts'),
  '@quatrain/queue-sqlite': path.join(coreDir, 'queue-sqlite/src/index.ts'),
  '@quatrain/git-client': path.join(coreDir, 'git-client/src/index.ts'),
  '@quatrain/auth': path.join(coreDir, 'auth/src/index.ts'),
  '@quatrain/auth-github': path.join(coreDir, 'auth-github/src/index.ts')
} : {};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@quatrain/ux-react': 'react',
      ...localAliases
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.{ts,tsx}']
    }
  }
});
