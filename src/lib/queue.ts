import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { Storage } from '@quatrain/storage';
import { Ingestion } from '@quatrain/ingestion';
import { Queue } from '@quatrain/queue';
import { ContentItem } from './models/ContentItem';
import { fetchHtmlWithJs } from './browser';
import { gitAddIfRepo } from './utils/git';
import { normalizeUrl, extractLinks, slugify } from './utils';

let backendPromise: Promise<void> | null = null;
function ensureBackend() {
   if (!backendPromise) {
      backendPromise = import('./backend').then(({ initBackend }) => {
         return initBackend();
      }).catch(e => {
         Queue.error(`Failed to initialize backend dynamically: ${e.message}`);
      });
   }
}

export interface Task {
   id: string;
   status: 'pending' | 'processing' | 'completed' | 'failed';
   type: 'pdf' | 'image' | 'url' | 'text' | 'audio';
   name: string;
   progress: number;
   error?: string;
   createdAt: string;
   startedAt?: string;
   completedAt?: string;
   tempFilePath?: string;
   url?: string;
   textContent?: string;
   category: string;
   contextNote?: string;
   crawlDepth?: number;
   recordedLive?: boolean;
   hasTempFile?: boolean;
   latitude?: number;
   longitude?: number;
   fileHash?: string;
   source?: string;
}



class QueueManagerClass {
   private isListening = false;

   public startListening() {
      if (this.isListening) return;
      this.isListening = true;
      Queue.info('[QueueManager] Registering background queue listener on topic "ingestion"');
      
      const adapter = Queue.getQueue<any>();
      adapter.listen('ingestion', async (task: any, options: { updateProgress: Function }) => {
         Queue.info(`Processing task ${task.name || 'unnamed'}`);
         try {
            await this.executeTask(task, async (progress: number) => {
               await options.updateProgress(progress);
            });
            Queue.info(`Completed task ${task.name || 'unnamed'}`);
         } catch (err: any) {
            Queue.error(`Failed task ${task.name || 'unnamed'}: ${err.message || err}`);
            throw err;
         }
      });
   }

   public async getTasks(): Promise<Task[]> {
      ensureBackend();
      const adapter = Queue.getQueue<any>();
      const tasks = await adapter.getTasks('ingestion');
      return Promise.all(tasks.map(async (task: any) => {
         let hasTempFile = false;
         if (task.tempFilePath) {
            try {
               await fs.access(task.tempFilePath);
               hasTempFile = true;
            } catch {
               hasTempFile = false;
            }
         }
         return { ...task, hasTempFile };
      }));
   }

   public async addTask(task: Omit<Task, 'id' | 'status' | 'progress' | 'createdAt'>): Promise<Task> {
      ensureBackend();
      const adapter = Queue.getQueue<any>();
      
      this.cleanupOldTempFiles().catch(() => {});

      const messageId = await adapter.send(task, 'ingestion');
      return {
         ...task,
         id: messageId,
         status: 'pending',
         progress: 0,
         createdAt: new Date().toISOString()
      } as Task;
   }

   public async retryTask(id: string): Promise<boolean> {
      ensureBackend();
      const adapter = Queue.getQueue<any>();
      return await adapter.retryTask(id);
   }

   public async deleteTask(id: string): Promise<boolean> {
      ensureBackend();
      const adapter = Queue.getQueue<any>();
      
      const tasks = await adapter.getTasks('ingestion');
      const task = tasks.find((t: { id: string; }) => t.id === id);
      if (task && task.tempFilePath) {
         fs.unlink(task.tempFilePath).catch(() => {});
      }
      return await adapter.deleteTask(id);
   }

   private async cleanupOldTempFiles() {
      try {
         const tempDir = path.resolve(process.cwd(), 'tmp');
         const files = await fs.readdir(tempDir);
         const now = Date.now();
         const ONE_DAY = 24 * 60 * 60 * 1000;
         
         for (const file of files) {
            if (file === 'chrome-profile') continue;
            const filePath = path.join(tempDir, file);
            const stat = await fs.stat(filePath);
            if (stat.isFile() && (now - stat.mtimeMs > ONE_DAY)) {
               await fs.unlink(filePath);
               Queue.info(`[Queue Cleanup] Deleted old temporary file: ${filePath}`);
            }
         }
      } catch (e: any) {
         Queue.warn(`[Queue Cleanup] Failed to clean old temp files: ${e.message}`);
      }
   }

   private async executeTask(task: any, updateProgress: (progress: number) => Promise<void>): Promise<void> {
      ensureBackend();

      const gitLocalPath = process.env.GIT_LOCAL_PATH || path.resolve(process.cwd(), '.second-brain-git');
      const documentStoragePath = process.env.DOCUMENT_STORAGE_PATH || path.resolve(process.cwd(), '.second-brain-docs');

      let locationContext = '';
      if (task.latitude !== undefined && task.longitude !== undefined) {
         try {
            Queue.info(`[Queue Geocoding] Fetching location for coords: ${task.latitude}, ${task.longitude}`);
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${task.latitude}&lon=${task.longitude}&zoom=10`;
            const response = await fetch(url, {
               headers: {
                  'User-Agent': 'SecondBrainNoteTaker/1.0 (contact: brad@quatrain.com)'
               }
            });
            if (response.ok) {
               const data = await response.json();
               if (data && data.address) {
                  const city = data.address.city || data.address.town || data.address.village || data.address.municipality || data.address.county || '';
                  const country = data.address.country || '';
                  locationContext = [city, country].filter(Boolean).join(', ');
                  Queue.info(`[Queue Geocoding] Resolved location to: ${locationContext}`);
               }
            }
         } catch (e: any) {
            Queue.warn(`[Queue Geocoding] Failed to reverse geocode: ${e.message}`);
         }
      }

      let rawText = '';
      let isImage = false;
      let isText = false;
      let buffer: Buffer | null = null;

      await updateProgress(20);



      const getDocFile = (ref: string, mime: string) => ({
         bucket: process.env.S3_BUCKET || 'documents',
         ref,
         name: path.basename(ref),
         mime
      });

      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const docStorage = Storage.getStorage('document-storage');

      if (task.type === 'url') {
         if (!task.url) throw new Error('Missing URL for URL ingestion');
         
         const mainUrl = task.url;
         Queue.info(`[Queue] Fetching main URL: ${mainUrl}`);
         const html = await fetchHtmlWithJs(mainUrl);
         rawText = html
            .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
            .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

         const level1Links = extractLinks(html, mainUrl);
         const processedUrls = new Set<string>([normalizeUrl(mainUrl)]);
         
         await updateProgress(25);

         const webAdapter = Ingestion.getAdapter('web');
         const parentResult = await webAdapter.process(rawText, {
            contextNote: task.contextNote,
            model
         });
         
         let finalCategory = (task.category && task.category !== 'inbox' && task.category !== 'all') 
            ? task.category 
            : (parentResult.category || 'inbox');

         const catSegments = finalCategory.split('/').filter(Boolean);
         if (catSegments.length > 2) {
            finalCategory = catSegments.slice(0, 2).join('/');
         }

         const parentSemanticId = slugify(parentResult.title || 'webpage') || crypto.randomUUID();
         const urlFileUid = crypto.randomUUID();
         const parentMdRef = `markdowns/${urlFileUid}-${parentSemanticId}.md`;

         await docStorage.create(getDocFile(parentMdRef, 'text/markdown') as any, Readable.from([parentResult.markdown]));
         await gitAddIfRepo(path.join(documentStoragePath, parentMdRef));

         const parentItem = await ContentItem.factory({
            id: parentSemanticId,
            title: parentResult.title,
            type: parentResult.type || 'note',
            category: finalCategory,
            tags: parentResult.tags || [],
            summary: parentResult.summary,
            originalFileUri: mainUrl,
            markdownFileUri: parentMdRef,
            contextNote: task.contextNote || '',
            body: parentResult.markdown,
            createdAt: new Date().toISOString(),
            source: mainUrl
         });
         await parentItem.save();
         await gitAddIfRepo(path.join(gitLocalPath, 'content', finalCategory, `${parentSemanticId}.md`));

         const children: Array<{ id: string; title: string; url: string; level: number }> = [];
         const crawlDepth = typeof task.crawlDepth === 'number' ? task.crawlDepth : 0;
         const level2Candidates: string[] = [];

         if (crawlDepth > 0) {
            const linksToCrawlLevel1 = level1Links.slice(0, 5);
            await updateProgress(30);
            let progressStep = 40 / (linksToCrawlLevel1.length || 1);

            for (const link1 of linksToCrawlLevel1) {
               const normalized = normalizeUrl(link1);
               if (processedUrls.has(normalized)) continue;
               processedUrls.add(normalized);

               try {
                  Queue.info(`[Queue] Ingesting Level 1 Sub-document: ${link1}`);
                  const childHtml = await fetchHtmlWithJs(link1);
                  const childRawText = childHtml
                     .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
                     .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();

                  const childResult = await webAdapter.process(childRawText, {
                     contextNote: `Ce document est une sous-page (Niveau 1) du document parent "${parentResult.title}".`,
                     model
                  });
                  const rawChildSemanticId = slugify(childResult.title || 'subpage') || crypto.randomUUID();
                  const childSemanticId = `${parentSemanticId}-${rawChildSemanticId}`;
                  const childFileUid = crypto.randomUUID();
                  const childMdRef = `markdowns/${childFileUid}-${childSemanticId}.md`;

                  await docStorage.create(getDocFile(childMdRef, 'text/markdown') as any, Readable.from([childResult.markdown]));
                  await gitAddIfRepo(path.join(documentStoragePath, childMdRef));

                  const childCategory = `${finalCategory}/${parentSemanticId}`;

                  const childItem = await ContentItem.factory({
                     id: childSemanticId,
                     title: childResult.title,
                     type: childResult.type || 'page',
                     category: childCategory,
                     tags: childResult.tags || [],
                     summary: childResult.summary,
                     parent: parentSemanticId,
                     originalFileUri: link1,
                     markdownFileUri: childMdRef,
                     body: childResult.markdown,
                     createdAt: new Date().toISOString(),
                     source: link1
                  });
                  await childItem.save();
                  await gitAddIfRepo(path.join(gitLocalPath, 'content', childCategory, `${childSemanticId}.md`));

                  children.push({ id: `${parentSemanticId}/${childSemanticId}`, title: childResult.title, url: link1, level: 1 });

                  const subLinks = extractLinks(childHtml, link1);
                  for (const l2 of subLinks) {
                     const normalizedL2 = normalizeUrl(l2);
                     if (!processedUrls.has(normalizedL2) && !level2Candidates.includes(l2)) {
                        level2Candidates.push(l2);
                     }
                  }
               } catch (err) {
                  Queue.warn(`[Queue] Failed to crawl Level 1 link ${link1}: ${err}`);
               }

               const currentProgress = Math.min(70, Math.floor(20 + progressStep));
               await updateProgress(currentProgress);
            }
         }

         if (crawlDepth > 1) {
            const linksToCrawlLevel2 = level2Candidates.slice(0, 5);
            await updateProgress(70);
            let progressStep = 20 / (linksToCrawlLevel2.length || 1);

            for (const link2 of linksToCrawlLevel2) {
               const normalized = normalizeUrl(link2);
               if (processedUrls.has(normalized)) continue;
               processedUrls.add(normalized);

               try {
                  Queue.info(`[Queue] Ingesting Level 2 Sub-document: ${link2}`);
                  const childHtml = await fetchHtmlWithJs(link2);
                  const childRawText = childHtml
                     .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
                     .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();

                  const childResult = await webAdapter.process(childRawText, {
                     contextNote: `Ce document est une sous-page (Niveau 2) du document parent "${parentResult.title}".`,
                     model
                  });
                  const rawChildSemanticId = slugify(childResult.title || 'subpage') || crypto.randomUUID();
                  const childSemanticId = `${parentSemanticId}-${rawChildSemanticId}`;
                  const childFileUid = crypto.randomUUID();
                  const childMdRef = `markdowns/${childFileUid}-${childSemanticId}.md`;

                  await docStorage.create(getDocFile(childMdRef, 'text/markdown') as any, Readable.from([childResult.markdown]));
                  await gitAddIfRepo(path.join(documentStoragePath, childMdRef));

                  const childCategory = `${finalCategory}/${parentSemanticId}`;

                  const childItem = await ContentItem.factory({
                     id: childSemanticId,
                     title: childResult.title,
                     type: childResult.type || 'page',
                     category: childCategory,
                     tags: childResult.tags || [],
                     summary: childResult.summary,
                     parent: parentSemanticId,
                     originalFileUri: link2,
                     markdownFileUri: childMdRef,
                     body: childResult.markdown,
                     createdAt: new Date().toISOString(),
                     source: link2
                  });
                  await childItem.save();
                  await gitAddIfRepo(path.join(gitLocalPath, 'content', childCategory, `${childSemanticId}.md`));

                  children.push({ id: `${parentSemanticId}/${childSemanticId}`, title: childResult.title, url: link2, level: 2 });
               } catch (err) {
                  Queue.warn(`[Queue] Failed to crawl Level 2 link ${link2}: ${err}`);
               }

               const currentProgress = Math.min(90, Math.floor(70 + progressStep));
               await updateProgress(currentProgress);
            }
         }

         if (children.length > 0) {
            Queue.info(`[Queue] Appending ${children.length} sub-document links to parent ${parentSemanticId}`);
            const childLinksSection = '\n\n## Documents enfants associés\n\n' + 
               children
                  .map(c => `* [${c.title}](${c.id}.md) - Niveau ${c.level} (Source : [lien](${c.url}))`)
                  .join('\n');

            const updatedBody = parentResult.markdown + childLinksSection;
            await docStorage.create(getDocFile(parentMdRef, 'text/markdown') as any, Readable.from([updatedBody]));

            parentItem.set('body', updatedBody);
            await parentItem.save();
         }
         await updateProgress(100);
         return;
      }

      if (task.type === 'text') {
         isText = true;
         rawText = task.textContent || '';
      } else if (task.tempFilePath) {
         buffer = await fs.readFile(task.tempFilePath);
         isImage = task.type === 'image';
      }

      await updateProgress(40);

      let result;

      if (task.type === 'audio') {
         const audioAdapter = Ingestion.getAdapter('audio');
         const ext = task.tempFilePath ? path.extname(task.tempFilePath).toLowerCase() : '.wav';
         const mimeType = ext === '.wav' ? 'audio/wav' : ext === '.m4a' ? 'audio/x-m4a' : ext === '.ogg' ? 'audio/ogg' : ext === '.webm' ? 'audio/webm' : ext === '.caf' ? 'audio/caf' : 'audio/mpeg';

         result = await audioAdapter.process(buffer!, {
            mimeType,
            recordedLive: task.recordedLive,
            locationContext: locationContext || 'Unknown',
            contextNote: task.contextNote,
            model
         });
      } else {
         const ocrAdapter = Ingestion.getAdapter('ocr');
         if (isImage) {
            const ext = task.tempFilePath ? path.extname(task.tempFilePath).toLowerCase() : '.jpg';
            const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
            result = await ocrAdapter.process(buffer!, {
               isImage: true,
               mimeType,
               contextNote: task.contextNote,
               model
            });
         } else {
            const isPdf = task.type === 'pdf' || (task.tempFilePath && task.tempFilePath.endsWith('.pdf'));
            if (isPdf && buffer) {
               result = await ocrAdapter.process(buffer, {
                  isImage: false,
                  mimeType: 'application/pdf',
                  contextNote: task.contextNote,
                  model
               });
            } else {
               result = await ocrAdapter.process(rawText, {
                  contextNote: task.contextNote,
                  model
               });
            }
         }
      }

      await updateProgress(70);

      const fileUid = crypto.randomUUID();
      const originalName = task.name.replace(/\.[^/.]+$/, '');
      const mdRef = `markdowns/${fileUid}-${slugify(originalName)}.md`;

      if (task.tempFilePath && buffer) {
         let rawRef = '';
         let mimeType = 'application/octet-stream';
         if (isImage) {
            rawRef = `images/${fileUid}-${task.name}`;
            mimeType = 'image/jpeg';
         } else if (task.type === 'audio') {
            rawRef = `audio/${fileUid}-${task.name}`;
            const ext = path.extname(task.name).toLowerCase();
            mimeType = ext === '.wav' ? 'audio/wav' : ext === '.m4a' ? 'audio/x-m4a' : ext === '.ogg' ? 'audio/ogg' : ext === '.webm' ? 'audio/webm' : ext === '.caf' ? 'audio/caf' : 'audio/mpeg';
         } else {
            rawRef = `pdfs/${fileUid}-${task.name}`;
            mimeType = 'application/pdf';
         }
         await docStorage.create(getDocFile(rawRef, mimeType) as any, Readable.from([buffer]));
         await gitAddIfRepo(path.join(documentStoragePath, rawRef));
      }

      await docStorage.create(getDocFile(mdRef, 'text/markdown') as any, Readable.from([result.markdown]));
      await gitAddIfRepo(path.join(documentStoragePath, mdRef));

      let defaultCat = task.type === 'audio' ? (task.recordedLive ? 'journal' : 'inbox') : 'inbox';
      let finalCategory = (task.category && task.category !== 'inbox' && task.category !== 'all') 
         ? task.category 
         : (result.category || defaultCat);

      const catSegments = finalCategory.split('/').filter(Boolean);
      if (catSegments.length > 2) {
         finalCategory = catSegments.slice(0, 2).join('/');
      }

      const query = ContentItem.query();
      const existingItemsResult = await ContentItem.repository().query(query);
      const existingItems = existingItemsResult.items || [];
      
      const sourceUrl = task.url;
      const existing = existingItems.find(item => {
         // Check by unique file hash first to detect duplicates
         const itemHash = item.val('fileHash');
         if (task.fileHash && itemHash && itemHash === task.fileHash) {
            return true;
         }
         const fileUri = item.val('originalFileUri');
         if (sourceUrl && fileUri === sourceUrl) {
            return true;
         }
         if (task.tempFilePath && fileUri && fileUri.endsWith(task.name)) {
            return true;
         }
         return false;
      });

      const semanticId = existing ? existing.val('id') : (slugify(result.title || originalName) || crypto.randomUUID());
      
      let itemCreatedAt = new Date().toISOString();
      let itemDocumentDate: string | undefined = undefined;

      if (existing) {
         itemCreatedAt = existing.val('createdAt') || new Date().toISOString();
         itemDocumentDate = existing.val('documentDate');
      }

      if (result.deductedDate) {
         try {
            const parsed = new Date(result.deductedDate);
            if (!isNaN(parsed.getTime())) {
               itemDocumentDate = parsed.toISOString();
               Queue.info(`[Queue] Deducted date found: ${result.deductedDate}. Setting documentDate to ${itemDocumentDate}`);
            }
         } catch (e: any) {
            Queue.warn(`[Queue] Failed to parse deductedDate "${result.deductedDate}": ${e.message}`);
         }
      }

      await updateProgress(85);

      const mergedTags = Array.from(new Set([
         ...(result.tags || []),
         ...(result.properNouns || [])
      ]));

      const contentItem = await ContentItem.factory({
         id: semanticId,
         title: result.title || task.name,
         type: result.type || 'note',
         category: finalCategory,
         tags: mergedTags,
         summary: result.summary,
         originalFileUri: task.tempFilePath ? (isImage ? `images/${fileUid}-${task.name}` : task.type === 'audio' ? `audio/${fileUid}-${task.name}` : `pdfs/${fileUid}-${task.name}`) : undefined,
         markdownFileUri: mdRef,
         contextNote: task.contextNote || '',
         body: result.markdown,
         createdAt: itemCreatedAt,
         documentDate: itemDocumentDate,
         latitude: task.latitude !== undefined ? task.latitude.toString() : undefined,
         longitude: task.longitude !== undefined ? task.longitude.toString() : undefined,
         fileHash: task.fileHash,
         source: task.source || (task.url ? task.url : undefined)
      });

      await contentItem.save();

      if (result.properNouns && Array.isArray(result.properNouns)) {
         const { searchAndCreateConcept } = await import('./concept-autolink');
         for (const properNoun of result.properNouns) {
            searchAndCreateConcept(properNoun).catch(e => {
               Queue.warn(`[Queue] Failed to autolink concept "${properNoun}": ${e.message}`);
            });
         }
      }

      await gitAddIfRepo(path.join(gitLocalPath, 'content', finalCategory, `${semanticId}.md`));
      await updateProgress(100);
   }
}

const GLOBAL_QUEUE_KEY = Symbol.for('__second_brain_queue');
if (!(globalThis as any)[GLOBAL_QUEUE_KEY]) {
   (globalThis as any)[GLOBAL_QUEUE_KEY] = new QueueManagerClass();
} else {
   Object.setPrototypeOf((globalThis as any)[GLOBAL_QUEUE_KEY], QueueManagerClass.prototype);
}

export const QueueManager = (globalThis as any)[GLOBAL_QUEUE_KEY] as QueueManagerClass;
