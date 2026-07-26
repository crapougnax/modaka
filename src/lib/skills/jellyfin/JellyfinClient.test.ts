import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JellyfinClient } from './JellyfinClient';

describe('JellyfinClient with @quatrain/api-client', () => {
   let client: JellyfinClient;

   beforeEach(() => {
      client = new JellyfinClient({
         url: 'http://jellyfin.local:8096',
         apiKey: 'test-api-key',
         libraryName: 'Musique Olivier'
      });
   });

   it('should initialize JellyfinClient with target library configuration', () => {
      expect(client).toBeDefined();
   });

   it('should test connection successfully with mocked ApiClient response', async () => {
      // Mock get method on internal ApiClient
      const mockGet = vi.spyOn((client as any).apiClient, 'get').mockResolvedValue({
         status: 200,
         data: {
            ServerName: 'MyJellyfinServer',
            Version: '10.8.13'
         },
         meta: {}
      });

      const res = await client.testConnection();

      expect(mockGet).toHaveBeenCalledWith('/System/Info/Public', expect.any(Object));
      expect(res.success).toBe(true);
      expect(res.serverName).toBe('MyJellyfinServer');
      expect(res.version).toBe('10.8.13');
   });

   it('should search music filtered by resolved parentId using ApiClient query parameters', async () => {
      vi.spyOn(client, 'getLibraries').mockResolvedValue([
         { id: 'lib-123', name: 'Musique Olivier', collectionType: 'music' }
      ]);

      const mockGet = vi.spyOn((client as any).apiClient, 'get').mockResolvedValue({
         status: 200,
         data: {
            Items: [
               {
                  Id: 'artist-1',
                  Name: 'Daft Punk',
                  Type: 'MusicArtist',
                  Overview: 'French electronic music duo'
               }
            ]
         },
         meta: {}
      });

      const results = await client.searchMusic('Daft Punk');

      expect(mockGet).toHaveBeenCalledWith('/Items', expect.objectContaining({
         searchTerm: 'Daft Punk',
         parentId: 'lib-123',
         limit: 20
      }));
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Daft Punk');
      expect(results[0].id).toBe('artist-1');
   });
});
