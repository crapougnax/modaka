import type { APIRoute } from 'astro';
import { initBackend } from '../../lib/backend';
import { Skills } from '../../lib/skills/Skills';
import { JellyfinSkillAdapter } from '../../lib/skills/jellyfin/JellyfinSkillAdapter';

export const prerender = false;

export const GET: APIRoute = async () => {
   try {
      await initBackend();

      const registeredSkills = Array.from(Skills.getSkills().entries()).map(([alias, adapter]) => {
         const manifest = adapter.manifest || {
            id: alias,
            name: adapter.name,
            description: adapter.description,
            icon: '⚡',
            fields: []
         };

         // Build current values from env/config
         let currentValues: Record<string, any> = {};
         let configured = false;

         if (alias === 'jellyfin') {
            currentValues = {
               url: process.env.JELLYFIN_URL || 'http://localhost:8096',
               apiKey: process.env.JELLYFIN_API_KEY ? '••••••••' : '',
               username: process.env.JELLYFIN_USERNAME || '',
               password: process.env.JELLYFIN_PASSWORD ? '••••••••' : '',
               libraryName: process.env.JELLYFIN_LIBRARY_NAME || ''
            };
            configured = !!(process.env.JELLYFIN_API_KEY || (process.env.JELLYFIN_USERNAME && process.env.JELLYFIN_PASSWORD));
         }

         return {
            alias,
            manifest,
            tools: adapter.getTools(),
            values: currentValues,
            configured
         };
      });

      return new Response(JSON.stringify({
         success: true,
         skills: registeredSkills
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
      const skillAlias = body.skillAlias || body.skillId || 'jellyfin';

      const adapter = Skills.getSkill(skillAlias);
      if (!adapter) {
         return new Response(JSON.stringify({ error: `Skill '${skillAlias}' non enregistré.` }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      if (action === 'test' || action === 'test_skill' || action === 'test_jellyfin') {
         if (adapter.testConnection) {
            const values = body.values || body;
            const res = await adapter.testConnection(values);
            return new Response(JSON.stringify(res), {
               status: res.success ? 200 : 400,
               headers: { 'Content-Type': 'application/json' }
            });
         }
         return new Response(JSON.stringify({ success: true, message: 'Skill disponible.' }), { status: 200 });
      }

      if (action === 'detect_libraries') {
         if (skillAlias === 'jellyfin') {
            const jellyfinSkill = adapter as JellyfinSkillAdapter;
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
      }

      if (action === 'save_skill_config' || action === 'save_jellyfin_config' || action === 'save') {
         const values = body.values || body;

         if (skillAlias === 'jellyfin') {
            if (values.url) process.env.JELLYFIN_URL = values.url;
            if (values.apiKey && values.apiKey !== '••••••••') process.env.JELLYFIN_API_KEY = values.apiKey;
            if (values.username !== undefined) process.env.JELLYFIN_USERNAME = values.username;
            if (values.password !== undefined && values.password !== '••••••••') process.env.JELLYFIN_PASSWORD = values.password;
            if (values.libraryName !== undefined) process.env.JELLYFIN_LIBRARY_NAME = values.libraryName;

            if (adapter.updateConfig) {
               adapter.updateConfig(values);
            }
         } else if (adapter.updateConfig) {
            adapter.updateConfig(values);
         }

         return new Response(JSON.stringify({
            success: true,
            message: `Configuration du skill '${adapter.manifest.name}' enregistrée avec succès.`
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
