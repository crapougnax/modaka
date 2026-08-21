import type { APIRoute } from 'astro';
import { initBackend } from '../../lib/backend';
import { Skills } from '../../lib/skills/Skills';
import { JellyfinSkillAdapter } from '../../lib/skills/jellyfin/JellyfinSkillAdapter';

export const prerender = false;

export const GET: APIRoute = async () => {
   try {
      await initBackend();

      const catalogSkills = Skills.getCatalog().map((reg) => {
         const alias = reg.alias;
         const manifest = reg.manifest;
         const adapter = reg.instance || Skills.getSkill(alias);

         // Build current values from env/config
         let currentValues: Record<string, any> = {};
         let configured = false;

         if (alias === 'jellyfin') {
            currentValues = {
               url: process.env.JELLYFIN_URL || process.env.JELLYFIN_API_URL || 'http://localhost:8096',
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
            tools: adapter ? adapter.getTools() : [],
            values: currentValues,
            configured
         };
      });

      return new Response(JSON.stringify({
         success: true,
         skills: catalogSkills
      }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Failed to fetch skills catalog' }), {
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
      const values = body.values || body;

      let adapter = Skills.getSkill(skillAlias);

      if (action === 'test' || action === 'test_skill' || action === 'test_jellyfin') {
         if (!adapter) {
            adapter = await Skills.activateSkill(skillAlias, values);
         }
         if (adapter && adapter.testConnection) {
            const res = await adapter.testConnection(values);
            return new Response(JSON.stringify(res), {
               status: res.success ? 200 : 400,
               headers: { 'Content-Type': 'application/json' }
            });
         }
         return new Response(JSON.stringify({ success: true, message: 'Skill available.' }), { status: 200 });
      }

      if (action === 'detect_libraries') {
         if (skillAlias === 'jellyfin') {
            const { JellyfinSkillAdapter } = await import('../../lib/skills/jellyfin/JellyfinSkillAdapter');
            const tempConfig = {
               url: values.url || process.env.JELLYFIN_URL || process.env.JELLYFIN_API_URL || 'http://localhost:8096',
               apiKey: (values.apiKey && values.apiKey !== '••••••••') ? values.apiKey : process.env.JELLYFIN_API_KEY,
               username: values.username !== undefined ? values.username : process.env.JELLYFIN_USERNAME,
               password: (values.password && values.password !== '••••••••') ? values.password : process.env.JELLYFIN_PASSWORD
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
         if (skillAlias === 'jellyfin') {
            if (values.url) {
               process.env.JELLYFIN_URL = values.url;
               process.env.JELLYFIN_API_URL = values.url;
            }
            if (values.apiKey && values.apiKey !== '••••••••') process.env.JELLYFIN_API_KEY = values.apiKey;
            if (values.username !== undefined) process.env.JELLYFIN_USERNAME = values.username;
            if (values.password !== undefined && values.password !== '••••••••') process.env.JELLYFIN_PASSWORD = values.password;
            if (values.libraryName !== undefined) process.env.JELLYFIN_LIBRARY_NAME = values.libraryName;
         }

         // Dynamically activate or update adapter
         if (!adapter) {
            adapter = await Skills.activateSkill(skillAlias, values);
         } else if (adapter.updateConfig) {
            adapter.updateConfig(values);
         }

         return new Response(JSON.stringify({
            success: true,
            message: `Skill configuration for '${adapter.manifest.name}' saved and activated successfully.`
         }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      return new Response(JSON.stringify({ error: `Unknown action '${action}'.` }), {
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
