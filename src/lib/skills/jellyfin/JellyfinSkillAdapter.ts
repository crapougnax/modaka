import { AbstractSkillAdapter, ToolDefinition } from '../AbstractSkillAdapter';
import { JellyfinClient, JellyfinConfig } from './JellyfinClient';
import { ContentItem } from '../../models/ContentItem';
import { slugify } from '../../utils/text';

export class JellyfinSkillAdapter extends AbstractSkillAdapter {
   readonly name = 'Jellyfin Audio & Musique';
   readonly description = 'Explore votre bibliothèque audio Jellyfin, vos playlists et génère des fiches concepts OKF pour vos artistes et albums.';

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
            description: 'Recherche des artistes, albums ou morceaux dans votre bibliothèque musicale Jellyfin.',
            parameters: {
               query: { type: 'string', description: 'Nom de l\'artiste, titre de l\'album ou morceau à chercher', required: true },
               type: { type: 'string', description: 'Type de média à chercher: MusicArtist, MusicAlbum, Audio ou all', required: false }
            }
         },
         {
            name: 'jellyfin_get_artist_details',
            description: 'Obtient les détails complets et la discographie d\'un artiste sur Jellyfin.',
            parameters: {
               artistName: { type: 'string', description: 'Nom de l\'artiste', required: true }
            }
         },
         {
            name: 'jellyfin_get_playlists',
            description: 'Liste les playlists musicales de votre compte Jellyfin.',
            parameters: {}
         },
         {
            name: 'jellyfin_ingest_artist_concept',
            description: 'Crée ou met à jour une fiche concept OKF v0.1 pour un artiste musical dans votre Second Brain.',
            parameters: {
               artistName: { type: 'string', description: 'Nom de l\'artiste', required: true },
               summary: { type: 'string', description: 'Court résumé ou biographie de l\'artiste', required: false },
               albums: { type: 'array', description: 'Liste des albums principaux de l\'artiste', required: false }
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
      const bio = summary || details?.overview || `Fiche artiste et discographie pour ${name} issue de Jellyfin.`;
      
      const albums = albumsList || details?.albums || [];
      const albumsFormatted = albums.length > 0
         ? albums.map(a => `- **${a.name}**${a.productionYear ? ` (${a.productionYear})` : ''}`).join('\n')
         : '*Aucun album répertorié dans Jellyfin.*';

      const markdownBody = `## ${name}

${bio}

### Albums dans la bibliothèque
${albumsFormatted}

---
*Source : Bibliothèque audio Jellyfin (Modaka Skill)*
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
      item.set('tags', ['musique', 'jellyfin', 'artiste', slugify(name)]);
      item.set('body', markdownBody);
      item.set('source', 'Skill Jellyfin');

      await item.save({ skipAiReprocess: true });

      return {
         success: true,
         message: `Fiche concept créée avec succès pour l'artiste ${name}`,
         item: {
            id,
            title: name,
            category: 'concepts',
            path: `content/concepts/${id}.md`
         }
      };
   }
}
