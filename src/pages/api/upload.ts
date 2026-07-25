import type { APIRoute } from 'astro';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { QueueManager } from '../../lib/queue';

export const prerender = false;

function decodeFilename(filename: string): string {
   // If the string contains characters > 255, it's already Unicode, do not decode it.
   for (let i = 0; i < filename.length; i++) {
      if (filename.charCodeAt(i) > 255) {
         return filename;
      }
   }
   try {
      const buffer = Buffer.from(filename, 'binary');
      const decoded = buffer.toString('utf8');
      if (decoded !== filename && !decoded.includes('\uFFFD')) {
         return decoded;
      }
   } catch (e) {
      // Fallback
   }
   return filename;
}

export const POST: APIRoute = async ({ request }) => {
   try {
      const formData = await request.formData();
      const files = (formData.getAll('file') as File[]).filter(f => f.name && f.size > 0);
      const textContent = (formData.get('textContent') as string) || '';
      const contextNote = (formData.get('contextNote') as string) || '';
      const formCategory = (formData.get('category') as string) || 'inbox';
      const formSource = (formData.get('source') as string) || '';
      const recordedLive = formData.get('recordedLive') === 'true';

      const latitudeStr = formData.get('latitude') as string || '';
      const longitudeStr = formData.get('longitude') as string || '';
      const latitude = latitudeStr ? parseFloat(latitudeStr) : undefined;
      const longitude = longitudeStr ? parseFloat(longitudeStr) : undefined;

      if (files.length === 0 && !textContent.trim()) {
         return new Response(JSON.stringify({ error: 'Aucun fichier ni texte fourni' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      const taskIds: string[] = [];
      if (files.length > 0) {
         const tempDir = path.resolve(process.cwd(), 'tmp');
         await fs.mkdir(tempDir, { recursive: true });

         for (const file of files) {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Fix accents in filename if parsed as Latin-1
            const cleanFileName = decodeFilename(file.name);
            const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(cleanFileName);
            const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm|caf)$/i.test(cleanFileName);
            const isText = file.type.startsWith('text/') || /\.(md|markdown|txt|okf|yaml|yml)$/i.test(cleanFileName);

            // Calculate unique file hash (SHA-256)
            const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

            const tempFilePath = path.join(tempDir, `${crypto.randomUUID()}-${cleanFileName}`);
            await fs.writeFile(tempFilePath, buffer);

            // Add document processing task to background queue
            const task = await QueueManager.addTask({
               type: isImage ? 'image' : isAudio ? 'audio' : isText ? 'text' : 'pdf',
               name: cleanFileName,
               tempFilePath,
               category: formCategory,
               contextNote,
               recordedLive,
               latitude,
               longitude,
               fileHash,
               source: formSource || cleanFileName
            });
            taskIds.push(task.id);
         }
      } else {
         // Add text/markdown processing task to background queue
         const task = await QueueManager.addTask({
            type: 'text',
            name: 'Texte collé',
            textContent: textContent.trim(),
            category: formCategory,
            contextNote,
            latitude,
            longitude,
            source: formSource || 'Copier-coller'
         });
         taskIds.push(task.id);
      }

      return new Response(JSON.stringify({ 
         success: true, 
         queued: true,
         taskIds
      }), {
         status: 202,
         headers: { 'Content-Type': 'application/json' }
      });

   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};
