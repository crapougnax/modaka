import type { APIRoute } from 'astro';
import { reconfigureBackend } from '../../lib/backend';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const prerender = false;

const CONFIG_PATH = path.resolve(process.cwd(), 'src/config/user_config.json');

// Ensure parent directory exists
async function ensureDir(filePath: string) {
   const dir = path.dirname(filePath);
   try {
      await fs.mkdir(dir, { recursive: true });
   } catch (e) {
      // ignore
   }
}

export const GET: APIRoute = async () => {
   try {
      let data = {};
      try {
         const content = await fs.readFile(CONFIG_PATH, 'utf-8');
         data = JSON.parse(content);
      } catch (e) {
         // File doesn't exist yet, return empty defaults
      }
      return new Response(JSON.stringify(data), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};

export const POST: APIRoute = async ({ request }) => {
   try {
      const config = await request.json();
      await ensureDir(CONFIG_PATH);
      await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
      
      // Reconfigure the backend storage adapters and logger dynamically
      await reconfigureBackend();

      return new Response(JSON.stringify({ success: true }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};
