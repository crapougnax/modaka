import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';
import { Config } from '@quatrain/config';

export const POST: APIRoute = async ({ request }) => {
   try {
      const body = await request.json().catch(() => ({}));
      const provider = (body.provider && body.provider.trim()) 
         ? body.provider.trim().toLowerCase() 
         : (Config.get<string>('llm.provider') || Config.get<string>('llm.active') || 'gemini').toLowerCase();

      const apiKey = (body.apiKey !== undefined && body.apiKey !== null) 
         ? String(body.apiKey).trim() 
         : (Config.get<string>('llm.apiKey') || Config.get<string>('gemini.apiKey') || '');

      const model = (body.model !== undefined && body.model !== null && String(body.model).trim())
         ? String(body.model).trim()
         : (Config.get<string>('llm.model') || Config.get<string>('gemini.model') || '');

      const endpoint = (body.endpoint !== undefined && body.endpoint !== null && String(body.endpoint).trim())
         ? String(body.endpoint).trim()
         : (Config.get<string>('llm.endpoint') || '');

      // 1. Google Gemini
      if (provider === 'gemini') {
         if (!apiKey) {
            return new Response(JSON.stringify({
               success: false,
               error: 'Aucune clé API n\'est configurée. Veuillez renseigner votre clé API Google AI Studio.'
            }), {
               status: 400,
               headers: { 'Content-Type': 'application/json' }
            });
         }

         if (apiKey.startsWith('AQ.')) {
            return new Response(JSON.stringify({
               success: false,
               error: '⚠️ Les jetons d\'accès commençant par "AQ." sont des jetons OAuth temporaires non supportés par l\'API Gemini. Utilisez une clé commençant par "AIzaSy...".'
            }), {
               status: 400,
               headers: { 'Content-Type': 'application/json' }
            });
         }

         if (!model) {
            return new Response(JSON.stringify({
               success: false,
               error: 'Veuillez spécifier un nom de modèle Gemini (ex: gemini-2.5-flash).'
            }), {
               status: 400,
               headers: { 'Content-Type': 'application/json' }
            });
         }

         const ai = new GoogleGenAI({ apiKey });
         const response = await ai.models.generateContent({
            model,
            contents: 'Hello, reply with OK'
         });

         if (response && response.text) {
            return new Response(JSON.stringify({
               success: true,
               message: `Clé API Gemini validée et opérationnelle avec le modèle ${model} !`,
               model
            }), {
               status: 200,
               headers: { 'Content-Type': 'application/json' }
            });
         }

         return new Response(JSON.stringify({
            success: false,
            error: 'Aucune réponse reçue de l\'API Gemini.'
         }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      // 2. Local Ollama / Llama.cpp
      if (provider === 'ollama' || provider === 'llama') {
         const targetUrl = (endpoint || 'http://localhost:11434').replace(/\/+$/, '');
         try {
            const res = await fetch(`${targetUrl}/v1/models`, { method: 'GET', signal: AbortSignal.timeout(5000) });
            if (res.ok) {
               return new Response(JSON.stringify({
                  success: true,
                  message: `Endpoint local accessible (${targetUrl}) !`,
                  model
               }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
               });
            }
         } catch (e) {
            // Try Ollama native /api/tags
            try {
               const nativeRes = await fetch(`${targetUrl}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(5000) });
               if (nativeRes.ok) {
                  return new Response(JSON.stringify({
                     success: true,
                     message: `Serveur Ollama joignable (${targetUrl}) !`,
                     model
                  }), {
                     status: 200,
                     headers: { 'Content-Type': 'application/json' }
                  });
               }
            } catch (err: any) {
               return new Response(JSON.stringify({
                  success: false,
                  error: `Impossible de contacter le serveur local sur ${targetUrl}: ${err.message}`
               }), {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' }
               });
            }
         }

         return new Response(JSON.stringify({
            success: false,
            error: `Le serveur local sur ${targetUrl} n'a pas répondu favorablement.`
         }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      // 3. Anthropic Claude
      if (provider === 'anthropic') {
         if (!apiKey) {
            return new Response(JSON.stringify({
               success: false,
               error: 'Clé API requise pour tester Anthropic.'
            }), {
               status: 400,
               headers: { 'Content-Type': 'application/json' }
            });
         }
         if (!model) {
            return new Response(JSON.stringify({
               success: false,
               error: 'Veuillez spécifier un modèle Anthropic (ex: claude-3-5-sonnet-20241022).'
            }), {
               status: 400,
               headers: { 'Content-Type': 'application/json' }
            });
         }

         const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
               'x-api-key': apiKey,
               'anthropic-version': '2023-06-01',
               'content-type': 'application/json'
            },
            body: JSON.stringify({
               model,
               max_tokens: 10,
               messages: [{ role: 'user', content: 'Hi' }]
            }),
            signal: AbortSignal.timeout(10000)
         });

         if (anthropicRes.ok) {
            return new Response(JSON.stringify({
               success: true,
               message: `Clé API Anthropic validée avec succès (${model}) !`,
               model
            }), {
               status: 200,
               headers: { 'Content-Type': 'application/json' }
            });
         }

         const errBody = await anthropicRes.json().catch(() => ({}));
         const errMsg = errBody.error?.message || `Erreur Anthropic (${anthropicRes.status})`;
         return new Response(JSON.stringify({
            success: false,
            error: errMsg
         }), {
            status: anthropicRes.status,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      // 4. OpenAI and OpenAI-compatible (Mistral, Groq, OpenRouter, Custom)
      if (!apiKey) {
         return new Response(JSON.stringify({
            success: false,
            error: `Clé API requise pour ${provider}.`
         }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      if (!model) {
         return new Response(JSON.stringify({
            success: false,
            error: `Veuillez spécifier un nom de modèle pour ${provider}.`
         }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      let baseUrl = endpoint;
      if (!baseUrl) {
         if (provider === 'openai') baseUrl = 'https://api.openai.com/v1';
         else if (provider === 'mistral') baseUrl = 'https://api.mistral.ai/v1';
         else if (provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
         else if (provider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
         else baseUrl = 'https://api.openai.com/v1';
      }

      const testUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const res = await fetch(testUrl, {
         method: 'POST',
         headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
         },
         body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5
         }),
         signal: AbortSignal.timeout(10000)
      });

      if (res.ok) {
         return new Response(JSON.stringify({
            success: true,
            message: `Connexion ${provider} réussie avec le modèle ${model} !`,
            model
         }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      const errData = await res.json().catch(() => ({}));
      let errMsg = errData.error?.message || `Erreur ${res.status}: ${res.statusText}`;
      if (res.status === 401) {
         errMsg = `Clé API non valide ou refusée par le fournisseur (${provider}).`;
      }
      return new Response(JSON.stringify({
         success: false,
         error: errMsg
      }), {
         status: res.status,
         headers: { 'Content-Type': 'application/json' }
      });

   } catch (err: any) {
      let errorMessage = err.message || 'Erreur d\'authentification auprès du fournisseur.';
      if (errorMessage.includes('401') || errorMessage.includes('UNAUTHENTICATED') || errorMessage.includes('INVALID_ARGUMENT')) {
         errorMessage = 'Clé API non valide ou refusée (Erreur 401).';
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
