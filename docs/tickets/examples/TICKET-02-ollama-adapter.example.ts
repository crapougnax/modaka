/**
 * TICKET-02 — On-Premise / Zero-Cloud Privacy: Local Embeddings & Ollama Inference
 * https://github.com/Quatrain/modaka/issues/2
 *
 * Starter adapter for @quatrain/ai, following the exact shape of
 * @quatrain/ai-gemini's GeminiAdapter (see packages/ai-gemini/src/GeminiAdapter.ts)
 * so it can be registered the same way:
 *
 *   import { Ai } from '@quatrain/ai'
 *   import { OllamaAdapter } from './OllamaAdapter'
 *   Ai.setAdapter(new OllamaAdapter({ baseUrl: process.env.OLLAMA_BASE_URL }))
 *
 * NOTE — upstream gap found while wiring this:
 * `AbstractAiAdapter` (packages/ai/src/AbstractAiAdapter.ts) currently declares
 * generateText / generateStructured / generateTextStream but has no `embed()`
 * method. Local embeddings are the whole point of TICKET-02, so before this
 * adapter can be consumed generically (by QmdSearchEngineAdapter or anything
 * else), add to AbstractAiAdapter:
 *
 *   embed?(input: string | string[], options?: any): Promise<number[] | number[][]>
 *
 * as an OPTIONAL method (cloud adapters like Gemini may not implement it, or
 * would need their own embeddings endpoint). Consumers should feature-detect
 * with `if (adapter.embed) { ... }` rather than assuming every adapter has it.
 */

import { AbstractAiAdapter } from '@quatrain/ai'

export interface OllamaAdapterConfig {
   /** Ollama daemon base URL. Default: http://localhost:11434 */
   baseUrl?: string
   /** Default chat/generation model. Default: llama3.2:3b (matches design-notes recommendation) */
   chatModel?: string
   /** Default embedding model. Default: nomic-embed-text (matches design-notes recommendation) */
   embedModel?: string
   /** Request timeout in ms. Default: 30000 */
   timeoutMs?: number
}

/**
 * AI Adapter implementation for a local Ollama daemon.
 * Mirrors GeminiAdapter's structure so both can be hot-swapped behind
 * Ai.setAdapter() — e.g. a settings toggle "Cloud (Gemini) / Local (Ollama)".
 */
export class OllamaAdapter extends AbstractAiAdapter {
   protected _baseUrl: string
   protected _chatModel: string
   protected _embedModel: string
   protected _timeoutMs: number
   protected _ready = false

   constructor(config: OllamaAdapterConfig = {}) {
      super()
      this._baseUrl = (config.baseUrl || 'http://localhost:11434').replace(/\/$/, '')
      this._chatModel = config.chatModel || 'llama3.2:3b'
      this._embedModel = config.embedModel || 'nomic-embed-text'
      this._timeoutMs = config.timeoutMs ?? 30_000
   }

   /**
    * Health-checks the local daemon so failures surface early (e.g. at app
    * boot / settings save) instead of on the first chat message.
    * Required by TICKET-02's acceptance criteria: "Automated health check
    * verifying local Ollama daemon connectivity."
    */
   async init(): Promise<void> {
      try {
         const res = await this._fetch('/api/tags', { method: 'GET' })
         if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`)
         this._ready = true
      } catch (err) {
         this._ready = false
         throw new Error(
            `Ollama daemon unreachable at ${this._baseUrl}. Is 'ollama serve' running? (${(err as Error).message})`
         )
      }
   }

   async generateText(prompt: string, options?: { model?: string }): Promise<string> {
      const res = await this._fetch('/api/generate', {
         method: 'POST',
         body: JSON.stringify({
            model: options?.model || this._chatModel,
            prompt,
            stream: false,
         }),
      })
      const data = await res.json()
      return data.response ?? ''
   }

   /**
    * Ollama supports structured output via `format: "json"` (free-form JSON)
    * or `format: <json-schema>` (schema-constrained, Ollama >= 0.5). We pass
    * the schema through directly — same contract as GeminiAdapter's
    * responseSchema, so callers don't need to branch on the active adapter.
    */
   async generateStructured(prompt: any, schema: any, options?: { model?: string }): Promise<any> {
      const res = await this._fetch('/api/generate', {
         method: 'POST',
         body: JSON.stringify({
            model: options?.model || this._chatModel,
            prompt,
            format: schema ?? 'json',
            stream: false,
         }),
      })
      const data = await res.json()
      if (!data.response) {
         throw new Error('No response returned from Ollama')
      }
      return JSON.parse(data.response)
   }

   async generateTextStream(prompt: string, options?: { model?: string }): Promise<AsyncIterable<string>> {
      const res = await this._fetch('/api/generate', {
         method: 'POST',
         body: JSON.stringify({
            model: options?.model || this._chatModel,
            prompt,
            stream: true,
         }),
      })
      if (!res.body) throw new Error('Ollama streaming response had no body')

      async function* makeGenerator() {
         const reader = res.body!.getReader()
         const decoder = new TextDecoder()
         let buffer = ''
         while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
               if (!line.trim()) continue
               const chunk = JSON.parse(line)
               if (chunk.response) yield chunk.response as string
            }
         }
      }
      return makeGenerator()
   }

   /**
    * Extra method — not yet on AbstractAiAdapter, see note at top of file.
    * Uses Ollama's batch-capable /api/embed endpoint.
    */
   async embed(input: string | string[]): Promise<number[] | number[][]> {
      const isBatch = Array.isArray(input)
      const res = await this._fetch('/api/embed', {
         method: 'POST',
         body: JSON.stringify({
            model: this._embedModel,
            input,
         }),
      })
      const data = await res.json()
      // Ollama returns { embeddings: number[][] } for both single and batch input
      return isBatch ? data.embeddings : data.embeddings[0]
   }

   private async _fetch(path: string, init: RequestInit): Promise<Response> {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this._timeoutMs)
      try {
         return await fetch(`${this._baseUrl}${path}`, {
            ...init,
            headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
            signal: controller.signal,
         })
      } finally {
         clearTimeout(timeout)
      }
   }
}
