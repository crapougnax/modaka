import type { AppCompositionInterface, PWAContentInterface } from '@quatrain/types';

/**
 * Official Modaka application composition definition.
 * Connects the Modaka PWA deliverable payload with its default runtime Quatrain adapters.
 */
export const modakaComposition: AppCompositionInterface<PWAContentInterface> = {
   content: {
      type: 'pwa',
      name: 'modaka',
      version: '1.0.0',
      distPath: './dist',
      manifest: {
         name: 'Modaka Second Brain',
         short_name: 'Modaka',
         theme_color: '#090d16',
         background_color: '#090d16'
      }
   },
   adapters: {
      ai: {
         default: { package: '@quatrain/ai-gemini', adapter: 'GeminiAdapter' },
         audio: { package: '@quatrain/ingestion-audio', adapter: 'AudioIngestionAdapter' },
         ocr: { package: '@quatrain/ingestion-ocr', adapter: 'OcrIngestionAdapter' }
      },
      backend: { package: '@quatrain/backend', adapter: 'OKFBackendAdapter' },
      storage: { package: '@quatrain/storage-local', adapter: 'LocalStorageAdapter' },
      searchengine: { package: '@quatrain/searchengine-qmd', adapter: 'QmdSearchEngineAdapter' },
      auth: { package: '@quatrain/auth-github', adapter: 'GitHubAuthAdapter' },
      queue: { package: '@quatrain/queue-sqlite', adapter: 'SQLiteQueueAdapter' }
   },
   config: {
      okfRoot: './second-brain-data/content',
      defaultCategory: 'inbox'
   }
};
