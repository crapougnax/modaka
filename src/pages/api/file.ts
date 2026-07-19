import type { APIRoute } from 'astro';
import { initBackend } from '../../lib/backend';
import { Storage } from '@quatrain/storage';
import * as path from 'node:path';

export const prerender = false;

/**
 * Endpoint structure to retrieve and serve raw uploaded files (images, PDFs, audio).
 * Handles streaming from either S3 or local storage transparently via the storage adapter.
 */
export const GET: APIRoute = async ({ request }) => {
   await initBackend();
   try {
      const url = new URL(request.url);
      const ref = url.searchParams.get('ref');
      if (!ref) {
         return new Response(JSON.stringify({ error: 'Missing ref parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      const docStorage = Storage.getStorage('document-storage');
      const getDocFile = (ref: string) => ({
         bucket: process.env.S3_BUCKET || 'second-brain',
         ref,
         name: path.basename(ref)
      });

      // Get Content-Type based on file extension
      const ext = path.extname(ref).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.pdf') contentType = 'application/pdf';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.mp3') contentType = 'audio/mpeg';
      else if (ext === '.wav') contentType = 'audio/wav';
      else if (ext === '.m4a') contentType = 'audio/x-m4a';
      else if (ext === '.ogg') contentType = 'audio/ogg';
      else if (ext === '.webm') contentType = 'audio/webm';
      else if (ext === '.caf') contentType = 'audio/caf';

      const stream = await docStorage.getReadable(getDocFile(ref) as any);

      // Convert Node readable stream to Web readable stream for Astro Response
      const responseStream = new ReadableStream({
         async start(controller) {
            for await (const chunk of stream) {
               controller.enqueue(chunk);
            }
            controller.close();
         }
      });

      return new Response(responseStream, {
         status: 200,
         headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000'
         }
      });
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'File not found' }), {
         status: 404,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};
