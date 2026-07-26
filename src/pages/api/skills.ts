import type { APIRoute } from 'astro';
import { initBackend } from '../../lib/backend';
import { Skills } from '../../lib/skills/Skills';
import { JellyfinSkillAdapter } from '../../lib/skills/jellyfin/JellyfinSkillAdapter';

export const prerender = false;

export const GET: APIRoute = async () => {
   try {
      await initBackend();

      const registeredSkills = Array.from(Skills.getSkills().entries()).map(([alias, adapter]) => ({
         alias,
         name: adapter.name,
         description: adapter.description,
         tools: adapter.getTools()
      }));

      const jellyfinSkill = Skills.getSkill('jellyfin') as JellyfinSkillAdapter | undefined;
      let jellyfinStatus = { connected: false, error: 'Non configuré' };
      let jellyfinConfig = {
         url: process.env.JELLYFIN_URL || 'http://localhost:8096',
         apiKey: process.env.JELLYFIN_API_KEY ? '••••••••' : '',
         hasApiKey: !!process.env.JELLYFIN_API_KEY,
         username: process.env.JELLYFIN_USERNAME || '',
         libraryName: process.env.JELLYFIN_LIBRARY_NAME || '',
         parentId: process.env.JELLYFIN_PARENT_ID || ''
      };

      if (jellyfinSkill) {
         const testRes = await jellyfinSkill.getClient().testConnection();
         if (testRes.success) {
            jellyfinStatus = { connected: true, error: '' };
         } else {
            jellyfinStatus = { connected: false, error: testRes.error || 'Connexion échouée' };
         }
      }

      return new Response(JSON.stringify({
         success: true,
         skills: registeredSkills,
         jellyfin: {
            status: jellyfinStatus,
            config: jellyfinConfig
         }
      }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Failed to fetch skills' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};

export const POST: APIRoute = async ({ request }) => {
   try {
      await initBackend();
      const body = await request.json();
      const action = body.action || 'test';

      const jellyfinSkill = Skills.getSkill('jellyfin') as JellyfinSkillAdapter | undefined;
      if (!jellyfinSkill) {
         return new Response(JSON.stringify({ error: 'Skill Jellyfin non enregistré' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      if (action === 'test' || action === 'test_jellyfin') {
         const tempConfig = {
            url: body.url || process.env.JELLYFIN_URL || 'http://localhost:8096',
            apiKey: (body.apiKey && body.apiKey !== '••••••••') ? body.apiKey : process.env.JELLYFIN_API_KEY,
            username: body.username !== undefined ? body.username : process.env.JELLYFIN_USERNAME,
            password: body.password || process.env.JELLYFIN_PASSWORD,
            libraryName: body.libraryName !== undefined ? body.libraryName : process.env.JELLYFIN_LIBRARY_NAME,
            parentId: body.parentId !== undefined ? body.parentId : process.env.JELLYFIN_PARENT_ID
         };

         const tempAdapter = new JellyfinSkillAdapter(tempConfig);
         const res = await tempAdapter.getClient().testConnection();

         if (res.success) {
            return new Response(JSON.stringify({
               success: true,
               message: `Connexion réussie au serveur Jellyfin "${res.serverName}" (v${res.version})`
            }), {
               status: 200,
               headers: { 'Content-Type': 'application/json' }
            });
         } else {
            return new Response(JSON.stringify({
               success: false,
               error: res.error || 'Impossible de se connecter au serveur Jellyfin'
            }), {
               status: 400,
               headers: { 'Content-Type': 'application/json' }
            });
         }
      }

      if (action === 'detect_libraries') {
         const tempConfig = {
            url: body.url || process.env.JELLYFIN_URL || 'http://localhost:8096',
            apiKey: (body.apiKey && body.apiKey !== '••••••••') ? body.apiKey : process.env.JELLYFIN_API_KEY,
            username: body.username !== undefined ? body.username : process.env.JELLYFIN_USERNAME,
            password: body.password || process.env.JELLYFIN_PASSWORD
         };

         const tempAdapter = new JellyfinSkillAdapter(tempConfig);
         const libraries = await tempAdapter.getClient().getLibraries();

         return new Response(JSON.stringify({
            success: true,
            libraries
         }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      if (action === 'save_jellyfin_config') {
         if (body.url) process.env.JELLYFIN_URL = body.url;
         if (body.apiKey && body.apiKey !== '••••••••') process.env.JELLYFIN_API_KEY = body.apiKey;
         if (body.username !== undefined) process.env.JELLYFIN_USERNAME = body.username;
         if (body.password !== undefined) process.env.JELLYFIN_PASSWORD = body.password;
         if (body.libraryName !== undefined) process.env.JELLYFIN_LIBRARY_NAME = body.libraryName;
         if (body.parentId !== undefined) process.env.JELLYFIN_PARENT_ID = body.parentId;

         jellyfinSkill.updateConfig({
            url: process.env.JELLYFIN_URL,
            apiKey: process.env.JELLYFIN_API_KEY,
            username: process.env.JELLYFIN_USERNAME,
            password: process.env.JELLYFIN_PASSWORD,
            libraryName: process.env.JELLYFIN_LIBRARY_NAME,
            parentId: process.env.JELLYFIN_PARENT_ID
         });

         return new Response(JSON.stringify({
            success: true,
            message: 'Configuration Jellyfin enregistrée et mise à jour avec succès.'
         }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      return new Response(JSON.stringify({ error: `Action '${action}' inconnue.` }), {
         status: 400,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Failed to process skill action' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};
