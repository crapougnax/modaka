import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import * as path from 'node:path';

const coreDir = '/Users/crapougnax/CODE/QUATRAIN/Core/packages';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  server: {
    host: true,
    port: 4321
  },
  integrations: [react()],
  vite: {
    plugins: [
      {
        name: 'alias-react-client-only',
        resolveId(source, importer, options) {
          if (options && !options.ssr && (source === 'react' || source === 'react-dom')) {
            return path.resolve(`./node_modules/${source}`);
          }
        }
      }
    ],
    ssr: {
      noExternal: [
        '@quatrain/ux',
        '@quatrain/ux-form-react',
        '@quatrain/ux-list-react',
        '@quatrain/ux-react',
        /@quatrain\/.*/
      ]
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@quatrain/ux-react': 'react',
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
      }
    }
  }
});
