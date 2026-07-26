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
   private url: string;
   private apiKey: string;
   private username?: string;
   private password?: string;
   private libraryName?: string;
   private parentId?: string;
   private userId?: string;
   private accessToken?: string;

   constructor(config: JellyfinConfig) {
      // Normalize URL by removing trailing slashes
      this.url = (config.url || 'http://localhost:8096').replace(/\/+$/, '');
      this.apiKey = config.apiKey || '';
      this.username = config.username;
      this.password = config.password;
      this.libraryName = config.libraryName;
      this.parentId = config.parentId;
   }

   private getHeaders(): Record<string, string> {
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
         const res = await fetch(`${this.url}/Users/AuthenticateByName`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
               Username: this.username,
               Pw: this.password || ''
            })
         });

         if (res.ok) {
            const data = await res.json();
            this.accessToken = data.AccessToken;
            this.userId = data.User?.Id;
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
         const res = await fetch(`${this.url}/System/Info/Public`, {
            headers: this.getHeaders()
         });
         if (res.ok) {
            const info = await res.json();
            return {
               success: true,
               serverName: info.ServerName || 'Jellyfin',
               version: info.Version || 'Unknown'
            };
         }
         return { success: false, error: `Jellyfin HTTP ${res.status}: ${res.statusText}` };
      } catch (err: any) {
         return { success: false, error: err.message || 'Impossible de se connecter au serveur Jellyfin' };
      }
   }

   /**
    * Fetch all User Media Libraries / Views from Jellyfin.
    */
   public async getLibraries(): Promise<JellyfinMediaView[]> {
      try {
         await this.authenticate();
         const userEndpoint = this.userId ? `/Users/${this.userId}/Views` : '/UserViews';
         const res = await fetch(`${this.url}${userEndpoint}`, {
            headers: this.getHeaders()
         });
         if (res.ok) {
            const data = await res.json();
            const items = data.Items || [];
            return items.map((item: any) => ({
               id: item.Id,
               name: item.Name,
               collectionType: item.CollectionType
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

         const params = new URLSearchParams({
            searchTerm: query,
            includeItemTypes: itemTypes.join(','),
            recursive: 'true',
            limit: '20'
         });

         if (parentId) {
            params.append('parentId', parentId);
         }

         const res = await fetch(`${this.url}/Items?${params.toString()}`, {
            headers: this.getHeaders()
         });

         if (res.ok) {
            const data = await res.json();
            return (data.Items || []).map((item: any) => ({
               id: item.Id,
               name: item.Name,
               type: item.Type,
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
         const albumParams = new URLSearchParams({
            artistIds: artist.id,
            includeItemTypes: 'MusicAlbum',
            recursive: 'true'
         });
         if (parentId) albumParams.append('parentId', parentId);

         const albumsRes = await fetch(`${this.url}/Items?${albumParams.toString()}`, {
            headers: this.getHeaders()
         });

         let albums: { id: string; name: string; productionYear?: number }[] = [];
         if (albumsRes.ok) {
            const data = await albumsRes.json();
            albums = (data.Items || []).map((a: any) => ({
               id: a.Id,
               name: a.Name,
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

         const params = new URLSearchParams({
            includeItemTypes: 'Playlist',
            recursive: 'true'
         });
         if (parentId) params.append('parentId', parentId);

         const res = await fetch(`${this.url}/Items?${params.toString()}`, {
            headers: this.getHeaders()
         });

         if (res.ok) {
            const data = await res.json();
            return (data.Items || []).map((p: any) => ({
               id: p.Id,
               name: p.Name,
               itemCount: p.ChildCount || 0
            }));
         }
      } catch (err) {
         console.error('[JellyfinClient] Get playlists failed:', err);
      }
      return [];
   }
}
