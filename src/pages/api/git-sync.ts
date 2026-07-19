import type { APIRoute } from 'astro';

export const POST: APIRoute = async () => {
   try {
      const { initBackend, triggerGitSync } = await import('../../lib/backend');
      await initBackend();
      const result = await triggerGitSync();
      return new Response(JSON.stringify(result), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (error: any) {
      console.error('[API Git Sync Error]', error);
      return new Response(JSON.stringify({ success: false, message: error.message }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};
