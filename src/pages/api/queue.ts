import type { APIRoute } from 'astro';
import { QueueManager } from '../../lib/queue';
import { initBackend } from '../../lib/backend';

export const GET: APIRoute = async () => {
   try {
      await initBackend();
      const tasks = await QueueManager.getTasks();
      return new Response(JSON.stringify({ success: true, tasks }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Failed to fetch queue' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};

export const POST: APIRoute = async ({ request }) => {
   try {
      await initBackend();
      const { taskId } = await request.json();
      if (!taskId) {
         return new Response(JSON.stringify({ error: 'Missing taskId parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }
      const success = await QueueManager.retryTask(taskId);
      if (success) {
         return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
         });
      } else {
         return new Response(JSON.stringify({ error: 'Task not found or not in failed state' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Failed to retry task' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};

export const DELETE: APIRoute = async ({ request }) => {
   try {
      const url = new URL(request.url);
      const taskId = url.searchParams.get('taskId');
      if (!taskId) {
         return new Response(JSON.stringify({ error: 'Missing taskId parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }
      const success = await QueueManager.deleteTask(taskId);
      if (success) {
         return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
         });
      } else {
         return new Response(JSON.stringify({ error: 'Task not found or currently processing' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Failed to delete task' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};

export const prerender = false;
