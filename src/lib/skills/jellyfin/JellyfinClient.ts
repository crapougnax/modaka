import { ApiClient } from '@quatrain/api-client';

export interface JellyfinConfig {
   url: string;
   apiKey?: string;
   username?: string;
   password?: string;
   libraryName?: string;
   parentId?: string;
}

export interface JellyfinMediaView {
   id: string;
   name: string;
   collectionType?: string;
}

export interface JellyfinArtistItem {
   id: string;
   name: string;
   overview?: string;
   genres?: string[];
   albums?: { id: string; name: string; productionYear?: number }[];
}

export class JellyfinClient {
   protected url: string;
   protected apiKey: string;
   protected username?: string;
   protected password?: string;
   protected libraryName?: string;
   protected parentId?: string;
   protected userId?: string;
   protected accessToken?: string;
   protected apiClient: ApiClient;

   constructor(config: JellyfinConfig) {
      // Normalize URL by removing trailing slashes
      this.url = (config.url || 'http://localhost:8096').replace(/\/+$/, '');
      this.apiKey = config.apiKey || '';
      this.username = config.username;
      this.password = config.password;
      this.libraryName = config.libraryName;
      this.parentId = config.parentId;
      this.apiClient = new ApiClient(this.url, `jellyfin-${Math.random().toString(36).substring(7)}`);
   }

   protected getHeaders(): Record<string, string> {
      const headers: Record<string, string> = {
         'Accept': 'application/json',
         'Content-Type': 'application/json'
      };

      const authHeader = 'MediaBrowser Client="Modaka", Device="Web", DeviceId="modaka-app", Version="1.0.0"';
      
      if (this.accessToken) {
         headers['X-Emby-Authorization'] = `${authHeader}, Token="${this.accessToken}"`;
      } else if (this.apiKey) {
         headers['X-Emby-Authorization'] = `${authHeader}, Token="${this.apiKey}"`;
         headers['X-MediaBrowser-Token'] = this.apiKey;
      } else {
         headers['X-Emby-Authorization'] = authHeader;
      }

      return headers;
   }

   /**
    * Authenticates with Jellyfin using username/password if API key is not directly provided.
    */
   public async authenticate(): Promise<boolean> {
      if (this.apiKey) {
         return true;
      }
      if (!this.username) {
         return false;
      }

      try {
         const res = await this.apiClient.query('/Users/AuthenticateByName', 'POST' as any, {
            Username: this.username,
            Pw: this.password || ''
         }, { headers: this.getHeaders() });

         if (res && res.data) {
            this.accessToken = res.data.AccessToken;
            this.userId = res.data.User?.Id;
            return true;
         }
      } catch (err) {
         console.error('[JellyfinClient] Auth failed:', err);
      }
      return false;
   }

   /**
    * Test connection to Jellyfin server.
    */
   public async testConnection(): Promise<{ success: boolean; serverName?: string; version?: string; error?: string }> {
      try {
         await this.authenticate();
         const res = await this.apiClient.get('/System/Info/Public', {
            headers: this.getHeaders()
         });
         if (res && res.data) {
            return {
               success: true,
               serverName: res.data.ServerName || 'Jellyfin',
               version: res.data.Version || 'Unknown'
            };
         }
         return { success: false, error: 'Failed to retrieve Jellyfin server information' };
      } catch (err: any) {
         return { success: false, error: err.message || 'Failed to connect to Jellyfin server' };
      }
   }

   /**
    * Fetch all User Media Libraries / Views from Jellyfin.
    */
   public async getLibraries(): Promise<JellyfinMediaView[]> {
      try {
         await this.authenticate();
         const userEndpoint = this.userId ? `/Users/${this.userId}/Views` : '/UserViews';
         const res = await this.apiClient.get(userEndpoint, {
            headers: this.getHeaders()
         });
         if (res && res.data) {
            const items = res.data.Items || res.data.items || (Array.isArray(res.data) ? res.data : []);
            return items.map((item: any) => ({
               id: item.Id || item.id || item.uid,
               name: item.Name || item.name,
               collectionType: item.CollectionType || item.collectionType
            }));
         }
      } catch (err) {
         console.error('[JellyfinClient] Failed to fetch libraries:', err);
      }
      return [];
   }

   /**
    * Resolves target ParentId from JELLYFIN_LIBRARY_NAME if not explicitly provided as ID.
    */
   public async resolveParentId(): Promise<string | undefined> {
      if (this.parentId) {
         return this.parentId;
      }
      if (!this.libraryName || this.libraryName.trim() === '') {
         return undefined;
      }

      const libraries = await this.getLibraries();
      const targetName = this.libraryName.trim().toLowerCase();
      const matched = libraries.find(lib => lib.name.toLowerCase() === targetName || lib.name.toLowerCase().includes(targetName));

      if (matched) {
         this.parentId = matched.id;
         return matched.id;
      }
      return undefined;
   }

   /**
    * Search music items (artists, albums, tracks) filtered strictly by target ParentId.
    */
   public async searchMusic(query: string, itemTypes: string[] = ['MusicArtist', 'MusicAlbum', 'Audio']): Promise<any[]> {
      try {
         await this.authenticate();
         const parentId = await this.resolveParentId();

         const searchOptions: Record<string, any> = {
            headers: this.getHeaders(),
            searchTerm: query,
            includeItemTypes: itemTypes.join(','),
            recursive: 'true',
            limit: 20
         };

         if (parentId) {
            searchOptions.parentId = parentId;
         }

         const res = await this.apiClient.get('/Items', searchOptions);

         if (res && res.data) {
            const items = res.data.Items || res.data.items || (Array.isArray(res.data) ? res.data : []);
            return items.map((item: any) => ({
               id: item.Id || item.id || item.uid,
               name: item.Name || item.name,
               type: item.Type || item.type,
               artist: item.AlbumArtist || item.Artists?.[0] || '',
               album: item.Album || '',
               productionYear: item.ProductionYear,
               overview: item.Overview || ''
            }));
         }
      } catch (err) {
         console.error('[JellyfinClient] Search failed:', err);
      }
      return [];
   }

   /**
    * Get details for an artist along with their albums.
    */
   public async getArtistDetails(artistNameOrId: string): Promise<JellyfinArtistItem | null> {
      try {
         await this.authenticate();
         const parentId = await this.resolveParentId();

         // Search for matching artist
         const artists = await this.searchMusic(artistNameOrId, ['MusicArtist']);
         if (artists.length === 0) return null;

         const artist = artists[0];

         // Fetch albums for this artist
         const albumOptions: Record<string, any> = {
            headers: this.getHeaders(),
            artistIds: artist.id,
            includeItemTypes: 'MusicAlbum',
            recursive: 'true'
         };
         if (parentId) {
            albumOptions.parentId = parentId;
         }

         const albumsRes = await this.apiClient.get('/Items', albumOptions);

         let albums: { id: string; name: string; productionYear?: number }[] = [];
         if (albumsRes && albumsRes.data) {
            const items = albumsRes.data.Items || albumsRes.data.items || (Array.isArray(albumsRes.data) ? albumsRes.data : []);
            albums = items.map((a: any) => ({
               id: a.Id || a.id || a.uid,
               name: a.Name || a.name,
               productionYear: a.ProductionYear
            }));
         }

         return {
            id: artist.id,
            name: artist.name,
            overview: artist.overview,
            albums
         };
      } catch (err) {
         console.error('[JellyfinClient] Get artist details failed:', err);
      }
      return null;
   }

   /**
    * Fetch user playlists filtered by music library if configured.
    */
   public async getPlaylists(): Promise<any[]> {
      try {
         await this.authenticate();
         const parentId = await this.resolveParentId();

         const playlistOptions: Record<string, any> = {
            headers: this.getHeaders(),
            includeItemTypes: 'Playlist',
            recursive: 'true'
         };
         if (parentId) {
            playlistOptions.parentId = parentId;
         }

         const res = await this.apiClient.get('/Items', playlistOptions);

         if (res && res.data) {
            const items = res.data.Items || res.data.items || (Array.isArray(res.data) ? res.data : []);
            return items.map((p: any) => ({
               id: p.Id || p.id || p.uid,
               name: p.Name || p.name,
               itemCount: p.ChildCount || 0
            }));
         }
      } catch (err) {
         console.error('[JellyfinClient] Get playlists failed:', err);
      }
      return [];
   }
}
