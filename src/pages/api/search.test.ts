import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './search';
import { SearchEngine } from '@quatrain/searchengine';

vi.mock('../../lib/backend', () => ({
   initBackend: vi.fn().mockResolvedValue(undefined)
}));

describe('API Endpoint: GET /api/search', () => {
   beforeEach(() => {
      vi.restoreAllMocks();
   });

   it('should execute hybrid search and return 200 with result payload', async () => {
      const mockSearch = vi.spyOn(SearchEngine, 'search').mockResolvedValue([
         {
            id: 'doc-1',
            title: 'Test Note',
            path: '/path/doc-1.md',
            score: 2.5,
            snippet: 'Matching content snippet'
         }
      ]);

      const requestUrl = 'http://localhost:4321/api/search?q=test&mode=hybrid&limit=10';
      const response = await GET({
         url: new URL(requestUrl)
      } as any);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.query).toBe('test');
      expect(data.mode).toBe('hybrid');
      expect(data.resultsCount).toBe(1);
      expect(data.results[0].title).toBe('Test Note');
      expect(mockSearch).toHaveBeenCalledWith('test', {
         category: undefined,
         mode: 'hybrid',
         limit: 10
      });
   });

   it('should handle search errors gracefully and return status 500', async () => {
      vi.spyOn(SearchEngine, 'search').mockRejectedValue(new Error('Search engine failed'));

      const response = await GET({
         url: new URL('http://localhost:4321/api/search?q=error')
      } as any);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Search engine failed');
   });
});
