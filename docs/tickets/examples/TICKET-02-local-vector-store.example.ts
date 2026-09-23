/**
 * TICKET-02 — On-Premise / Zero-Cloud Privacy: Local Embeddings & Ollama Inference
 * https://github.com/Quatrain/modaka/issues/2
 *
 * Companion piece to OllamaAdapter.example.ts.
 *
 * WHY THIS FILE EXISTS — a gap found while reading the actual code:
 * packages/searchengine-qmd/src/QmdSearchEngineAdapter.ts's `search()` only
 * does real vector search when an external `qmd` CLI binary is available
 * (`this._cliAvailable`). Its in-memory fallback path (used whenever the CLI
 * isn't installed — the common case on a fresh edge/mobile install) is pure
 * keyword matching, with NO embedding storage or cosine similarity at all.
 *
 * So "hybrid BM25 + vector search running locally in <20ms" (this ticket's
 * spec) is not actually true yet for the no-CLI path. This module is a
 * minimal, dependency-free local vector index that closes that gap: it can
 * be composed alongside QmdSearchEngineAdapter today (call it from your own
 * /api/search handler) without touching the shared @quatrain/searchengine-qmd
 * package. Once proven, the natural next step is upstreaming this into
 * QmdSearchEngineAdapter's fallback branch directly.
 *
 * Storage: SQLite (better-sqlite3), consistent with the rest of Modaka's
 * local-first stack (@quatrain/queue-sqlite). Vectors are stored as raw
 * Float32Array buffers — no vector DB dependency needed at PKM scale
 * (hundreds to low tens-of-thousands of documents fit comfortably in memory
 * for a brute-force cosine scan; revisit with sqlite-vec if a corpus grows
 * past ~50k documents).
 */

import Database from 'better-sqlite3'

export interface VectorRecord {
   docId: string
   category?: string
   vector: Float32Array
}

export interface VectorSearchResult {
   docId: string
   score: number
}

export class LocalVectorStore {
   private _db: Database.Database

   constructor(dbPath: string) {
      this._db = new Database(dbPath)
      this._db.exec(`
         CREATE TABLE IF NOT EXISTS embeddings (
            doc_id TEXT PRIMARY KEY,
            category TEXT,
            dim INTEGER NOT NULL,
            vector BLOB NOT NULL,
            updated_at INTEGER NOT NULL
         )
      `)
   }

   /** Insert or replace the embedding for a document (call on ingest / re-index). */
   upsert(record: VectorRecord): void {
      const buf = Buffer.from(record.vector.buffer, record.vector.byteOffset, record.vector.byteLength)
      this._db
         .prepare(
            `INSERT INTO embeddings (doc_id, category, dim, vector, updated_at)
             VALUES (@docId, @category, @dim, @vector, @updatedAt)
             ON CONFLICT(doc_id) DO UPDATE SET
               category = excluded.category,
               dim = excluded.dim,
               vector = excluded.vector,
               updated_at = excluded.updated_at`
         )
         .run({
            docId: record.docId,
            category: record.category ?? null,
            dim: record.vector.length,
            vector: buf,
            updatedAt: Date.now(),
         })
   }

   remove(docId: string): void {
      this._db.prepare(`DELETE FROM embeddings WHERE doc_id = ?`).run(docId)
   }

   /**
    * Brute-force cosine similarity scan. Fine up to tens of thousands of
    * rows on edge hardware; see file header for the scale-out path.
    */
   search(queryVector: Float32Array, options?: { limit?: number; category?: string }): VectorSearchResult[] {
      const limit = options?.limit ?? 20
      const rows = options?.category
         ? this._db.prepare(`SELECT doc_id, vector FROM embeddings WHERE category = ?`).all(options.category)
         : this._db.prepare(`SELECT doc_id, vector FROM embeddings`).all()

      const results: VectorSearchResult[] = []
      for (const row of rows as { doc_id: string; vector: Buffer }[]) {
         const candidate = new Float32Array(
            row.vector.buffer,
            row.vector.byteOffset,
            row.vector.byteLength / Float32Array.BYTES_PER_ELEMENT
         )
         results.push({ docId: row.doc_id, score: cosineSimilarity(queryVector, candidate) })
      }

      results.sort((a, b) => b.score - a.score)
      return results.slice(0, limit)
   }

   close(): void {
      this._db.close()
   }
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
   if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
   }
   let dot = 0
   let normA = 0
   let normB = 0
   for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
   }
   if (normA === 0 || normB === 0) return 0
   return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Example wiring — how an /api/search handler would combine QMD keyword
 * results with this local vector store for a real hybrid ranking, using the
 * OllamaAdapter from the companion example for query embedding:
 *
 *   const [keywordHits, queryVec] = await Promise.all([
 *      qmdAdapter.search(query, { mode: 'keyword', limit: 40 }),
 *      ollama.embed(query) as Promise<number[]>,
 *   ])
 *   const vectorHits = vectorStore.search(Float32Array.from(queryVec), { limit: 40 })
 *
 *   // Reciprocal Rank Fusion — simple, parameter-light way to merge two
 *   // ranked lists without needing to calibrate score scales against
 *   // each other.
 *   const fused = reciprocalRankFusion([keywordHits, vectorHits])
 */
export function reciprocalRankFusion(
   rankedLists: { docId: string }[][],
   k = 60
): { docId: string; score: number }[] {
   const scores = new Map<string, number>()
   for (const list of rankedLists) {
      list.forEach((item, rank) => {
         scores.set(item.docId, (scores.get(item.docId) ?? 0) + 1 / (k + rank + 1))
      })
   }
   return [...scores.entries()]
      .map(([docId, score]) => ({ docId, score }))
      .sort((a, b) => b.score - a.score)
}
