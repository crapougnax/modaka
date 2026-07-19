import { initBackend, astroAdapter } from '../../lib/backend';

await initBackend();

import { Storage } from '@quatrain/storage';
import { ContentItem } from '../../lib/models/ContentItem';

export const ALL = async (context: any) => {
   const req = context.request;
   if (req.method === 'DELETE') {
      try {
         const url = new URL(req.url);
         const parts = url.pathname.split('/');
         
         const contentIndex = parts.indexOf('content');
         if (contentIndex !== -1 && parts[contentIndex + 1]) {
            const id = parts[contentIndex + 1];
            
            const item = await ContentItem.factory();
            item.uri.uid = id;
            await item.read();

            const originalFileUri = item.val('originalFileUri');
            const markdownFileUri = item.val('markdownFileUri');

            const docStorage = Storage.getStorage('document-storage');
            
            const getDocFile = (ref: string) => ({
               bucket: process.env.S3_BUCKET || 'documents',
               ref,
               name: ref.split('/').pop() || ''
            });

            if (originalFileUri && !originalFileUri.startsWith('http://') && !originalFileUri.startsWith('https://') && !originalFileUri.startsWith('welcome://')) {
               try {
                  await docStorage.delete(getDocFile(originalFileUri) as any);
                  console.log(`[Storage Cleanup] Deleted original blob: ${originalFileUri}`);
               } catch (e: any) {
                  console.warn(`[Storage Cleanup] Failed to delete original blob ${originalFileUri}: ${e.message}`);
               }
            }

            if (markdownFileUri) {
               try {
                  await docStorage.delete(getDocFile(markdownFileUri) as any);
                  console.log(`[Storage Cleanup] Deleted parsed markdown blob: ${markdownFileUri}`);
               } catch (e: any) {
                  console.warn(`[Storage Cleanup] Failed to delete parsed markdown blob ${markdownFileUri}: ${e.message}`);
               }
            }
         }
      } catch (err: any) {
         console.warn(`[Storage Cleanup] Pre-delete cleanup failed: ${err.message}`);
      }
   }
   
   return astroAdapter.handle()(context);
};

export const prerender = false;
