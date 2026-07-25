import type { APIRoute } from 'astro';
import { initBackend } from '../../lib/backend';
import { ContentItem } from '../../lib/models/ContentItem';
import { Ingestion } from '@quatrain/ingestion';
import { searchAndCreateConcept } from '../../lib/concept-autolink';
import { Log } from '@quatrain/log';

export const POST: APIRoute = async ({ request }) => {
   try {
      await initBackend();

      const bodyData = await request.json();
      const { id, contextNote } = bodyData;

      if (!id) {
         return new Response(JSON.stringify({ error: 'Document ID est requis.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      const repo = ContentItem.repository();
      const query = ContentItem.query();
      query.setLimits({ offset: 0, batch: 1000 });
      const res = await repo.query(query);
      
      const item = res.items.find(i => i.uid === id || i.val('id') === id);
      if (!item) {
         return new Response(JSON.stringify({ error: `Document non trouvé avec l'identifiant ${id}.` }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      if (contextNote !== undefined) {
         item.set('contextNote', contextNote);
      }

      const bodyText = item.val('body') || '';
      const note = item.val('contextNote') || '';
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

      Log.info(`[Reprocess API] Processing document "${item.val('title')}" (${id}) with model ${model}`);

      const ocrAdapter = Ingestion.getAdapter('ocr');
      const result = await ocrAdapter.process(bodyText, {
         isText: true,
         mimeType: 'text/plain',
         contextNote: note,
         model
      });

      const mergedTags = Array.from(new Set([
         ...(result.tags || []),
         ...(result.properNouns || [])
      ]));

      item.set('tags', mergedTags);
      if (result.title) item.set('title', result.title);
      if (result.summary) item.set('summary', result.summary);
      if (result.properNouns) item.set('properNouns', result.properNouns);
      if (result.category) item.set('category', result.category);

      await item.save({ skipAiReprocess: true });

      const createdConcepts: string[] = [];
      if (result.properNouns && Array.isArray(result.properNouns)) {
         for (const properNoun of result.properNouns) {
            try {
               await searchAndCreateConcept(properNoun);
               createdConcepts.push(properNoun);
            } catch (err: any) {
               Log.warn(`[Reprocess API] Failed concept creation for "${properNoun}": ${err.message}`);
            }
         }
      }

      return new Response(JSON.stringify({
         success: true,
         message: 'Analyse IA et création des fiches concepts effectuées avec succès.',
         item: item.toJSON(),
         properNouns: result.properNouns || [],
         createdConcepts
      }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (err: any) {
      Log.error(`[Reprocess API] Error: ${err.message}`);
      return new Response(JSON.stringify({ error: err.message || 'Erreur lors du traitement du document.' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};

export const prerender = false;
