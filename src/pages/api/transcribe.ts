import type { APIRoute } from 'astro';
import { Ai } from '@quatrain/ai';
import { initBackend } from '../../lib/backend';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
   await initBackend();
   try {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file || file.size === 0) {
         return new Response(JSON.stringify({ error: 'No audio file provided' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Data = buffer.toString('base64');

      const gemini = Ai.getAdapter();
      if (!gemini) {
         return new Response(JSON.stringify({ error: 'Gemini adapter not available' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const prompt = "Transcris fidèlement et mot à mot ce message audio en français. Ne commente pas et ne résume pas. S'il n'y a pas de parole intelligible, réponds par une chaîne vide.";

      const mediaPart = {
         inlineData: {
            mimeType: file.type || 'audio/wav',
            data: base64Data
         }
      };

      const schema = {
         type: 'OBJECT',
         properties: {
            text: { type: 'STRING' }
         },
         required: ['text']
      };

      const result = await gemini.generateStructured([
         { text: prompt },
         mediaPart
      ], schema, { model });

      const transcription = result?.text?.trim() || '';

      return new Response(JSON.stringify({ text: transcription }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};
