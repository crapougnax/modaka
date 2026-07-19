import type { APIRoute } from 'astro';
import { initBackend } from '../../lib/backend';
import { ContentItem } from '../../lib/models/ContentItem';

export const prerender = false;

export const GET: APIRoute = async () => {
   await initBackend();

   try {
      const query = ContentItem.query();
      const itemsResult = await ContentItem.repository().query(query);
      const items = itemsResult.items || [];

      // Helper to escape CSV values
      const escape = (val: any) => {
         if (val === undefined || val === null) return '""';
         const str = String(val).replace(/"/g, '""');
         return `"${str}"`;
      };

      let csv = 'ID,Title,Category,Tags,Summary,CreatedAt\n';
      for (const item of items) {
         const tagsStr = item.val('tags')?.join(';') || '';
         csv += `${escape(item.uid)},${escape(item.val('title'))},${escape(item.val('category'))},${escape(tagsStr)},${escape(item.val('summary'))},${escape(item.val('createdAt'))}\n`;
      }

      return new Response(csv, {
         status: 200,
         headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="second-brain-export.csv"'
         }
      });
   } catch (err: any) {
      return new Response(err.message || 'Internal Server Error', {
         status: 500
      });
   }
};
