import type { APIRoute } from 'astro';
import { initBackend } from '../../lib/backend';
import { ContentItem } from '../../lib/models/ContentItem';
import { Storage } from '@quatrain/storage';
import { Backend } from '@quatrain/backend';
import { Core } from '@quatrain/core';
import { ChatController } from '@quatrain/chat';
import type { ChatDocument } from '@quatrain/chat';
import { Readable } from 'node:stream';
import * as path from 'node:path';

export const prerender = false;

async function _streamToString(stream: Readable): Promise<string> {
   const chunks: Buffer[] = [];
   for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
   }
   return Buffer.concat(chunks).toString('utf-8');
}

export const POST: APIRoute = async ({ request }) => {
   await initBackend();
   const startTime = Date.now();

   try {
      const { messages, userProfile } = await request.json();
      if (!messages || !Array.isArray(messages)) {
         Core.warn('[Chat API] Request failed: Invalid message thread');
         return new Response(JSON.stringify({ error: 'Invalid message thread' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      // Fetch all metadata documents to construct high-level context
      const query = ContentItem.query();
      query.setLimits({ offset: 0, batch: 1000 });
      const itemsResult = await ContentItem.repository().query(query);
      const items = itemsResult.items || [];
      Backend.info(`Queried metadata documents from database: found ${items.length} items`);

      // Convert ContentItem to ChatDocument (decoupling data query from prompt builder)
      const chatDocuments: ChatDocument[] = items.map((item) => {
         const markdownRef = item.val('markdownFileUri');
         return {
            uid: item.uid || '',
            title: item.val('title') || '',
            category: item.val('category') || '',
            tags: item.val('tags') || [],
            summary: item.val('summary') || '',
            contentLoader: markdownRef ? async () => {
               const docStorage = Storage.getStorage('document-storage');
               const getDocFile = (ref: string) => ({
                  bucket: process.env.S3_BUCKET || 'documents',
                  ref,
                  name: path.basename(ref)
               });
               const stream = await docStorage.getReadable(getDocFile(markdownRef) as any);
               return _streamToString(stream);
            } : undefined
         };
      });

      // Intercept Skills execution (e.g. Jellyfin audio & playlists)
      const { Skills } = await import('../../lib/skills/Skills');
      const lastMsg = messages[messages.length - 1]?.content || '';
      const lowerMsg = lastMsg.toLowerCase();
      let skillContext = '';

      if (Skills.hasSkill('jellyfin')) {
         if (lowerMsg.includes('jellyfin') || lowerMsg.includes('playlist') || lowerMsg.includes('artiste') || lowerMsg.includes('album') || lowerMsg.includes('musique')) {
            try {
               if (lowerMsg.includes('playlist')) {
                  const playlists = await Skills.execute('jellyfin_get_playlists', {});
                  skillContext += `\n\n[Résultat Skill Jellyfin - Playlists]\n${JSON.stringify(playlists, null, 2)}`;
               }
               
               const matchArtist = lastMsg.match(/(?:cherche|trouve|ajoute|crée|fiche|artiste|album)\s+([A-Za-z0-9À-ÿ\s'-]+?)(?:\s+sur\s+jellyfin|\s+dans\s+mon|\.|$)/i);
               const targetQuery = matchArtist && matchArtist[1] ? matchArtist[1].trim() : '';

               if (targetQuery && targetQuery.length > 1) {
                  if (lowerMsg.includes('ajoute') || lowerMsg.includes('crée') || lowerMsg.includes('fiche')) {
                     const ingestRes = await Skills.execute('jellyfin_ingest_artist_concept', { artistName: targetQuery });
                     skillContext += `\n\n[Action Skill Jellyfin - Ingestion OKF Réussie]\n${JSON.stringify(ingestRes, null, 2)}`;
                  } else {
                     const details = await Skills.execute('jellyfin_get_artist_details', { artistName: targetQuery });
                     if (details) {
                        skillContext += `\n\n[Détails Artiste Jellyfin pour "${targetQuery}"]\n${JSON.stringify(details, null, 2)}`;
                     }
                  }
               }
            } catch (e: any) {
               Core.warn(`[Chat API] Erreur lors de l'exécution du Skill Jellyfin: ${e.message}`);
            }
         }
      }

      if (skillContext) {
         chatDocuments.push({
            uid: 'jellyfin-live-context',
            title: 'Contexte Live Jellyfin',
            category: 'skills',
            summary: 'Données récupérées en direct depuis le serveur Jellyfin',
            contentLoader: async () => skillContext
         });
      }

      // Instantiate core ChatController
      const controller = new ChatController({
         provider: 'gemini',
         model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
         userProfile: {
            name: userProfile?.name,
            email: userProfile?.email,
            language: userProfile?.language
         }
      });

      // Delegate prompt construction, token search (RAG) and LLM streaming to @quatrain/chat
      const {
         stream,
         matchedDocsCount,
         finalPrompt,
         model
      } = await controller.sendMessageStream(messages, chatDocuments);

      const ioTimeMs = Date.now() - startTime;
      const aiStartTime = Date.now();

      Core.info(`[Gemini] Initiated text streaming successfully via @quatrain/chat`);

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
         async start(streamController) {
            let fullResponseText = '';
            try {
               for await (const chunk of stream) {
                  fullResponseText += chunk;
                  const data = JSON.stringify({ text: chunk });
                  streamController.enqueue(encoder.encode(`data: ${data}\n\n`));
               }

               const responseTimeMs = Date.now() - startTime;
               const aiTimeMs = Date.now() - aiStartTime;
               const inputTokensEstimate = Math.ceil(finalPrompt.length / 4);
               const outputTokensEstimate = Math.ceil(fullResponseText.length / 4);

               const finalData = JSON.stringify({
                  text: '',
                  done: true,
                  devStats: {
                     responseTimeMs,
                     ioTimeMs,
                     aiTimeMs,
                     metadataDocsCount: items.length,
                     fullDocsCount: matchedDocsCount,
                     inputTokensEstimate,
                     outputTokensEstimate
                  }
               });
               streamController.enqueue(encoder.encode(`data: ${finalData}\n\n`));
               streamController.close();
            } catch (err: any) {
               const errData = JSON.stringify({ error: err.message || 'Streaming error' });
               streamController.enqueue(encoder.encode(`data: ${errData}\n\n`));
               streamController.close();
            }
         }
      });

      return new Response(readable, {
         status: 200,
         headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
         }
      });

   } catch (err: any) {
      Core.error('[Chat API] Execution failed: ' + err.message, err);
      return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};
