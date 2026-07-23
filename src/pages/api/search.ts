import type { APIRoute } from 'astro';
import { initBackend } from '../../lib/backend';
import { SearchEngine } from '@quatrain/searchengine';

/**
 * Astro API endpoint exposing QMD hybrid search to PWA frontend and AI agents.
 * GET /api/search?q=query&category=cat&mode=hybrid|vector|bm25&limit=20
 */
export const GET: APIRoute = async ({ url }) => {
   await initBackend();

   const query = url.searchParams.get('q') || '';
   const category = url.searchParams.get('category') || undefined;
   const mode = (url.searchParams.get('mode') as 'hybrid' | 'vector' | 'bm25') || 'hybrid';
   const limitStr = url.searchParams.get('limit');
   const limit = limitStr ? parseInt(limitStr, 10) : 20;

   try {
      const results = await SearchEngine.search(query, {
         category,
         mode,
         limit
      });

      return new Response(
         JSON.stringify({
            success: true,
            query,
            mode,
            resultsCount: results.length,
            results
         }),
         {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
         }
      );
   } catch (err: any) {
      return new Response(
         JSON.stringify({
            success: false,
            error: err.message || 'Search execution failed'
         }),
         {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
         }
      );
   }
};
