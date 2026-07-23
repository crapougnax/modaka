import { PersistedBaseObject } from '@quatrain/backend';
import { StringProperty, ArrayProperty, DateTimeProperty } from '@quatrain/core';

export const ContentItemProperties = [
   {
      name: 'id',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'documentDate',
      type: DateTimeProperty.TYPE,
      mandatory: false
   },
   {
      name: 'title',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'type',
      type: StringProperty.TYPE,
      mandatory: false,
      defaultValue: 'document'
   },
   {
      name: 'category',
      type: StringProperty.TYPE,
      mandatory: false,
      defaultValue: 'inbox'
   },
   {
      name: 'tags',
      type: ArrayProperty.TYPE,
      itemType: StringProperty.TYPE,
      mandatory: false,
      defaultValue: []
   },
   {
      name: 'links',
      type: ArrayProperty.TYPE,
      itemType: StringProperty.TYPE,
      mandatory: false,
      defaultValue: []
   },
   {
      name: 'backlinks',
      type: ArrayProperty.TYPE,
      mandatory: false,
      defaultValue: []
   },
   {
      name: 'summary',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'originalFileUri',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'fileHash',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'source',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'markdownFileUri',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'createdAt',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'contextNote',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'body',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'latitude',
      type: StringProperty.TYPE,
      mandatory: false
   },
   {
      name: 'longitude',
      type: StringProperty.TYPE,
      mandatory: false
   }
];

export class ContentItem extends PersistedBaseObject {
   static PROPS_DEFINITION = ContentItemProperties;
   static COLLECTION = 'content';

   static async factory(src: any = undefined): Promise<ContentItem> {
      return super.factory(src, ContentItem);
   }

   async save(options?: { skipAiReprocess?: boolean }): Promise<void> {
      let bodyChanged = false;
      const id = this.val('id');
      const itemType = this.val('type');
      if (id) {
         try {
            const oldItem = await ContentItem.factory();
            oldItem.uri.uid = id;
            await oldItem.read();
            const oldBody = oldItem.val('body');
            const newBody = this.val('body');
            if (oldBody !== newBody) {
               bodyChanged = true;
            }
         } catch {
            bodyChanged = !!this.val('body');
         }
      } else {
         bodyChanged = !!this.val('body');
      }

      const shouldSkipReprocess = options?.skipAiReprocess || itemType === 'concept';

      if (bodyChanged && !shouldSkipReprocess) {
         const newBody = this.val('body');
         const { Ai } = await import('@quatrain/ai');
         const { Log } = await import('@quatrain/log');
         
         Log.info(`[ContentItem] Body changed for item ${id}. Re-processing tags and metadata with Gemini...`);
         try {
            const gemini = Ai.getAdapter();
            if (gemini) {
               const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
               const createdAtStr = this.val('createdAt') || new Date().toISOString();
               const originalCreatedAt = new Date(createdAtStr);
               const dayOfWeek = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(originalCreatedAt);

               const prompt = `You are a professional voice note assistant. Below is an edited transcription of a voice note (originally recorded/created on ${createdAtStr}).
Your task is to re-analyze the updated text to extract structured metadata:
1. Determine a clean, descriptive title for the note.
2. Determine a friendly concept type for the document (e.g. "note", "meeting", "reminder", "thought", "journal"). Use lowercase, singular. Default to "note".
3. Draft a 2-3 sentence summary of the text.
4. Identify 3-5 relevant keyword tags. Format tags as lowercase strings.
5. Under "properNouns", specifically list all proper nouns of people, artists, bands, and collectives mentioned in the text in their correct capitalization to enable semantic linking. Do NOT include institutions (such as publishing houses, corporations, museums, or universities) or locations/places (such as foundations, cities, or attractions) to prevent polluting the concepts directory.
6. Suggest the category as "journal" (or "journal/personal", "journal/work") if the document is recorded live OR has a clearly stated/deducted date.
7. Determine the date of the document:
   - Check if a specific date or relative time of event is clearly stated/written in the text (e.g., "hier", "avant-hier", "lundi dernier", "aujourd'hui", "le 15 mars", "le 23 mai").
   - If a date or relative date is mentioned, perform a calendar deduction relative to the original document creation date: ${createdAtStr} (Day of week: ${dayOfWeek}).
   - Deduct the correct calendar date and write it in the "deductedDate" field in the format "YYYY-MM-DD".

System Date/Time context for relative dates:
- Original Document Created At: ${createdAtStr} (Day of week: ${dayOfWeek})
- System Current Date: ${new Date().toISOString()}

Text Content:
---
${newBody}
---`;

               const schema = {
                  type: 'OBJECT',
                  properties: {
                     title: { type: 'STRING' },
                     type: { type: 'STRING' },
                     summary: { type: 'STRING' },
                     category: { type: 'STRING' },
                     tags: { 
                        type: 'ARRAY', 
                        items: { type: 'STRING' } 
                     },
                     properNouns: {
                        type: 'ARRAY',
                        items: { type: 'STRING' }
                     },
                     markdown: { type: 'STRING' },
                     deductedDate: { type: 'STRING' }
                  },
                  required: ['title', 'type', 'summary', 'category', 'tags', 'properNouns', 'markdown']
               };

               const result = await gemini.generateStructured([
                  { text: prompt }
               ], schema, { model });

               Log.info(`[ContentItem] Gemini re-processing completed. New Title: "${result.title}", Proper Nouns: [${(result.properNouns || []).join(', ')}]`);
               
               const mergedTags = Array.from(new Set([
                  ...(result.tags || []),
                  ...(result.properNouns || [])
               ]));

               this.set('title', result.title);
               this.set('type', result.type);
               this.set('summary', result.summary);
               this.set('tags', mergedTags);

               if (result.properNouns && Array.isArray(result.properNouns)) {
                  const { searchAndCreateConcept } = await import('../concept-autolink');
                  for (const properNoun of result.properNouns) {
                     searchAndCreateConcept(properNoun).catch(e => {
                        Log.warn(`[ContentItem] Failed to autolink concept "${properNoun}": ${e.message}`);
                     });
                  }
               }
                if (result.deductedDate) {
                   try {
                      const parsed = new Date(result.deductedDate);
                      if (!isNaN(parsed.getTime())) {
                         const documentDateIso = parsed.toISOString();
                         this.set('documentDate', documentDateIso);
                         Log.info(`[ContentItem] Updated documentDate to: ${documentDateIso}`);
                      }
                   } catch (e: any) {
                      Log.warn(`[ContentItem] Failed to parse deductedDate "${result.deductedDate}": ${e.message}`);
                   }
                }
            }
         } catch (err: any) {
            Log.error(`[ContentItem] Failed to re-process with Gemini: ${err.message}`);
         }

         const mdRef = this.val('markdownFileUri');
         if (mdRef) {
            try {
               const { Storage } = await import('@quatrain/storage');
               const { Readable } = await import('node:stream');
               const docStorage = Storage.getStorage('document-storage');
               if (docStorage) {
                  const getDocFile = (ref: string) => ({
                     bucket: process.env.S3_BUCKET || 'documents',
                     ref,
                     name: ref.split('/').pop() || ''
                  });
                  await docStorage.create(getDocFile(mdRef) as any, Readable.from([this.val('body')]));
                  Log.info(`[ContentItem] Updated markdown file in document-storage: ${mdRef}`);
               }
            } catch (storageErr: any) {
               Log.warn(`[ContentItem] Failed to update markdown file in document-storage: ${storageErr.message}`);
            }
         }
      }

      await super.save();
   }
}
