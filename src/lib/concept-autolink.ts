import { ContentItem } from './models/ContentItem';
import { Storage } from '@quatrain/storage';
import { Log } from '@quatrain/log';
import { Readable } from 'node:stream';

/**
 * Searches Wikipedia for a given proper noun and automatically creates a Concept OKF document
 * if it does not already exist in the user's Second Brain knowledge base.
 *
 * @param properNoun - The name or proper noun string to look up and turn into a concept document.
 * @returns Promise resolving when the concept search and document creation completes.
 */
export async function searchAndCreateConcept(properNoun: string): Promise<void> {
   const slug = properNoun.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
   if (!slug) return;

   try {
      const existing = await ContentItem.factory();
      existing.uri.uid = slug;
      await existing.read();
      Log.info(`[Concept Auto-Link] Concept "${properNoun}" already exists as document "${slug}". Skipping.`);
      return;
   } catch {
      // Concept doesn't exist, proceed to lookup
   }

   Log.info(`[Concept Auto-Link] Searching Wikipedia for "${properNoun}"...`);
   try {
      let wikiUrl = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(properNoun.replace(/ /g, '_'))}`;
      let response = await fetch(wikiUrl, {
         headers: { 'User-Agent': 'SecondBrainAgent/1.0 (contact: olivier@lepine.fr)' }
      });

      if (!response.ok) {
         wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(properNoun.replace(/ /g, '_'))}`;
         response = await fetch(wikiUrl, {
            headers: { 'User-Agent': 'SecondBrainAgent/1.0 (contact: olivier@lepine.fr)' }
          });
      }

      if (response.ok) {
         const data = await response.json();
         if (data.type === 'standard' && data.extract) {
            Log.info(`[Concept Auto-Link] Found Wikipedia entry for "${properNoun}". Creating concept document.`);

            const summary = data.description || `Page Wikipédia de ${data.title}`;
            const body = `${data.extract}\n\n---\n*Source : [Wikipedia - ${data.title}](${data.content_urls.desktop.page})*`;

            const conceptItem = await ContentItem.factory({
               id: slug,
               title: data.title,
               type: 'concept',
               category: 'concepts',
               tags: ['wikipedia', 'noms-propres', slug],
               summary: summary,
               body: body,
               originalFileUri: data.content_urls.desktop.page,
               createdAt: new Date().toISOString()
            });

            const mdRef = `concepts/${slug}.md`;
            conceptItem.set('markdownFileUri', mdRef);

            const docStorage = Storage.getStorage('document-storage');
            if (docStorage) {
               const getDocFile = (ref: string) => ({
                  bucket: process.env.S3_BUCKET || 'documents',
                  ref,
                  name: ref.split('/').pop() || ''
               });
               await docStorage.create(getDocFile(mdRef) as any, Readable.from([body]));
            }

            await conceptItem.save({ skipAiReprocess: true });
            Log.info(`[Concept Auto-Link] Successfully created concept document for "${data.title}"`);
         }
      } else {
         Log.info(`[Concept Auto-Link] No Wikipedia page found for "${properNoun}".`);
      }
   } catch (err: any) {
      Log.warn(`[Concept Auto-Link] Error searching/creating concept for "${properNoun}": ${err.message}`);
   }
}
