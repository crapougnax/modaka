import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';

export const POST: APIRoute = async ({ request }) => {
   try {
      const body = await request.json().catch(() => ({}));
      const apiKey = (body.apiKey && body.apiKey.trim()) ? body.apiKey.trim() : (process.env.GEMINI_API_KEY || '');

      if (!apiKey) {
         return new Response(JSON.stringify({
            success: false,
            error: 'Aucune clé API n\'est configurée. Veuillez renseigner votre clé API Google AI Studio dans les paramètres.'
         }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      if (apiKey.startsWith('AQ.')) {
         return new Response(JSON.stringify({
            success: false,
            error: '⚠️ Les jetons d\'accès commençant par "AQ." sont des jetons OAuth temporaires non supportés par l\'API Gemini (ACCESS_TOKEN_TYPE_UNSUPPORTED). Veuillez utiliser une clé API permanente commençant par "AIzaSy..." générée sur https://aistudio.google.com/app/apikey'
         }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      const ai = new GoogleGenAI({ apiKey });
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

      const response = await ai.models.generateContent({
         model,
         contents: 'Hello, reply with OK'
      });

      if (response && response.text) {
         return new Response(JSON.stringify({
            success: true,
            message: 'Clé API Gemini validée et opérationnelle !',
            model
         }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
         });
      } else {
         return new Response(JSON.stringify({
            success: false,
            error: 'Aucune réponse reçue de l\'API Gemini.'
         }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }
   } catch (err: any) {
      let errorMessage = err.message || 'Erreur d\'authentification auprès de Google Gemini.';
      if (errorMessage.includes('401') || errorMessage.includes('UNAUTHENTICATED') || errorMessage.includes('INVALID_ARGUMENT')) {
         errorMessage = 'Clé API non valide ou refusée par Google (Erreur 401). Vérifiez la clé sur Google AI Studio.';
      }
      return new Response(JSON.stringify({
         success: false,
         error: errorMessage
      }), {
         status: 401,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};

export const prerender = false;
