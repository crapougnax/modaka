import type { APIRoute } from 'astro';
import { initBackend } from '../../lib/backend';
import { Backend } from '@quatrain/backend';
import { OKFBackendAdapter } from '@quatrain/okf';

export const POST: APIRoute = async () => {
   try {
      await initBackend();
      const okfAdapter = Backend.getBackend('default') as OKFBackendAdapter;
      if (!okfAdapter) {
         return new Response(JSON.stringify({ error: 'Backend default adapter not found' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      // Rebuild all indices starting from the content collection root folder
      await okfAdapter.rebuildIndices('content');

      return new Response(JSON.stringify({ success: true, message: 'Réindexation des dossiers complétée avec succès.' }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Erreur lors de la réindexation' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};

export const prerender = false;
