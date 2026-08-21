import { AbstractSkillAdapter, type ToolDefinition, type SkillManifest } from '../AbstractSkillAdapter';
import { JellyfinClient, type JellyfinConfig } from './JellyfinClient';
import { ContentItem } from '../../models/ContentItem';
import { slugify } from '../../utils/text';
import skillManifest from './manifest.json';

export class JellyfinSkillAdapter extends AbstractSkillAdapter {
   readonly manifest: SkillManifest = skillManifest as SkillManifest;

   protected client: JellyfinClient;

   constructor(config?: Partial<JellyfinConfig>) {
      super();
      const resolvedConfig: JellyfinConfig = {
         url: config?.url || process.env.JELLYFIN_URL || 'http://localhost:8096',
         apiKey: config?.apiKey || process.env.JELLYFIN_API_KEY || '',
         username: config?.username || process.env.JELLYFIN_USERNAME || '',
         password: config?.password || process.env.JELLYFIN_PASSWORD || '',
         libraryName: config?.libraryName || process.env.JELLYFIN_LIBRARY_NAME || '',
         parentId: config?.parentId || process.env.JELLYFIN_PARENT_ID || ''
      };
      this.client = new JellyfinClient(resolvedConfig);
   }

   public async testConnection(values: Record<string, any>): Promise<{ success: boolean; message?: string; error?: string }> {
      const testClient = new JellyfinClient({
         url: values.url || process.env.JELLYFIN_URL || 'http://localhost:8096',
         apiKey: (values.apiKey && values.apiKey !== '••••••••') ? values.apiKey : process.env.JELLYFIN_API_KEY,
         username: values.username !== undefined ? values.username : process.env.JELLYFIN_USERNAME,
         password: values.password || process.env.JELLYFIN_PASSWORD,
         libraryName: values.libraryName !== undefined ? values.libraryName : process.env.JELLYFIN_LIBRARY_NAME
      });
      const res = await testClient.testConnection();
      if (res.success) {
         return {
            success: true,
            message: `Successfully connected to Jellyfin server "${res.serverName}" (v${res.version})`
         };
      }
      return {
         success: false,
         error: res.error || 'Failed to connect to Jellyfin server'
      };
   }

   public updateConfig(config: Partial<JellyfinConfig>): void {
      const resolvedConfig: JellyfinConfig = {
         url: config.url || process.env.JELLYFIN_URL || 'http://localhost:8096',
         apiKey: config.apiKey || process.env.JELLYFIN_API_KEY || '',
         username: config.username || process.env.JELLYFIN_USERNAME || '',
         password: config.password || process.env.JELLYFIN_PASSWORD || '',
         libraryName: config.libraryName || process.env.JELLYFIN_LIBRARY_NAME || '',
         parentId: config.parentId || process.env.JELLYFIN_PARENT_ID || ''
      };
      this.client = new JellyfinClient(resolvedConfig);
   }

   public getClient(): JellyfinClient {
      return this.client;
   }

   public getTools(): ToolDefinition[] {
      return [
         {
            name: 'jellyfin_search_music',
            description: 'Search for artists, albums, or tracks in your Jellyfin music library.',
            parameters: {
               query: { type: 'string', description: 'Artist name, album title, or track query to search for', required: true },
               type: { type: 'string', description: 'Media item type filter: MusicArtist, MusicAlbum, Audio, or all', required: false }
            }
         },
         {
            name: 'jellyfin_get_artist_details',
            description: 'Fetch detailed information and discography for an artist on Jellyfin.',
            parameters: {
               artistName: { type: 'string', description: 'Name of the artist', required: true }
            }
         },
         {
            name: 'jellyfin_get_playlists',
            description: 'List music playlists from your Jellyfin account.',
            parameters: {}
         },
         {
            name: 'jellyfin_ingest_artist_concept',
            description: 'Create or update an OKF v0.1 concept markdown sheet for a music artist in your Second Brain.',
            parameters: {
               artistName: { type: 'string', description: 'Name of the artist', required: true },
               summary: { type: 'string', description: 'Short summary or bio of the artist', required: false },
               albums: { type: 'array', description: 'List of main albums for the artist', required: false }
            }
         }
      ];
   }

   public async execute(toolName: string, params: any): Promise<any> {
      switch (toolName) {
         case 'jellyfin_search_music': {
            const types = params.type && params.type !== 'all' ? [params.type] : ['MusicArtist', 'MusicAlbum', 'Audio'];
            return await this.client.searchMusic(params.query, types);
         }

         case 'jellyfin_get_artist_details': {
            return await this.client.getArtistDetails(params.artistName);
         }

         case 'jellyfin_get_playlists': {
            return await this.client.getPlaylists();
         }

         case 'jellyfin_ingest_artist_concept': {
            return await this.ingestArtistConcept(params.artistName, params.summary, params.albums);
         }

         default:
            throw new Error(`Tool '${toolName}' not supported by JellyfinSkillAdapter`);
      }
   }

   /**
    * Ingests or updates an OKF v0.1 concept markdown sheet for an artist into second-brain-data.
    */
   protected async ingestArtistConcept(artistName: string, summary?: string, albumsList?: any[]): Promise<any> {
      const details = await this.client.getArtistDetails(artistName);
      const name = details?.name || artistName;
      const id = slugify(name);
      const bio = summary || details?.overview || `Artist profile and discography for ${name} imported from Jellyfin.`;
      
      const albums = albumsList || details?.albums || [];
      const albumsFormatted = albums.length > 0
         ? albums.map(a => `- **${a.name}**${a.productionYear ? ` (${a.productionYear})` : ''}`).join('\n')
         : '*No albums found in Jellyfin.*';

      const markdownBody = `## ${name}

${bio}

### Albums in Library
${albumsFormatted}

---
*Source: Jellyfin Audio Library (Modaka Skill)*
`;

      const item = await ContentItem.factory();
      item.uri.uid = id;
      
      // Check if item already exists
      try {
         await item.read();
      } catch (e) {
         // Item creates new
      }

      item.set('title', name);
      item.set('type', 'concept');
      item.set('category', 'concepts');
      item.set('summary', bio);
      item.set('tags', ['music', 'jellyfin', 'artist', slugify(name)]);
      item.set('body', markdownBody);
      item.set('source', 'Skill Jellyfin');

      await item.save({ skipAiReprocess: true });

      return {
         success: true,
         message: `Successfully created concept sheet for artist ${name}`,
         item: {
            id,
            title: name,
            category: 'concepts',
            path: `content/concepts/${id}.md`
         }
      };
   }
}
