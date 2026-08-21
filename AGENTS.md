# LLM Agent Instructions & Guidelines — Modaka

> **Audience**: AI Coding Agents & Human Pair Programming  
> **Platform**: Astro 5 + React + Quatrain Core + Google Gemini AI + OKF v0.1  
> **Repository**: `crapougnax/modaka` | **License**: AGPL-v3

---

## 🧭 1. Base Guidelines & Primary Hierarchy

All AI coding agents interacting with this workspace **MUST** strictly load and adhere to the author's primary development rules, GitFlow protocol, and 3-tier forking architecture defined in:
👉 **[Author's Global AI Rules, Architecture Standards & GitFlow Protocol (AGENTS.md)](https://gist.github.com/crapougnax/47971b85aa73dd702f4372a89858111c)**

---

## 🏗️ 2. Project-Specific Architecture & Guidelines

### A. Local-First & 0ms Latency
- **Single Source of Truth:** The local disk (`.modaka-data`) and client-side storage (IndexedDB/SQLite) are the primary read/write targets.
- **Cache Bypass on Read:** Reads directly inspect the active filesystem to ensure manual edits, renames, or external additions are immediately visible to both the UI and LLM agents.
- **Opportunistic Git Transport:** Background sync to remote repositories is asynchronous and must never block the user interface.

### B. Open Knowledge Format (OKF v0.1) Standards
All knowledge entities imported or created MUST comply strictly with OKF v0.1:
- **Flat YAML Frontmatter:** Bounded by `---`. Exclude null, undefined, or empty string (`""`) fields.
- **Semantic Kinds (`type`):** Human-friendly singular lowercase word (`specification`, `guide`, `screenshot`, `recipe`, `concept`, `note`, `invoice`).
- **Semantic Slugs:** Filenames and folder structures use lowercase slugified titles (`content/technology/ai/okf-spec.md`), never random UUIDs.
- **Progressive Disclosure:** Category folders maintain auto-generated `index.md` files listing child folders and concept markdown links for token-efficient agent traversal.

### C. Hybrid Search Engine (QMD)
- Search queries use `@quatrain/searchengine-qmd`, uniting BM25 keyword matching, vector semantic embeddings, and category filtering.
- Exposed via `/api/search` with support for `mode=hybrid`, `mode=keyword`, or `mode=vector`.

### D. Asynchronous SQLite Task Queue
- Heavy background ingestion (PDF OCR, Audio transcription, Web scraping, Wikipedia concept auto-linking) MUST run via `@quatrain/queue-sqlite`.
- Never perform heavy network/AI blocking operations inside foreground HTTP request handlers.

---

## 🛠️ 3. Essential Verification Commands

| Action | Command |
| :--- | :--- |
| **Run Unit Tests (Vitest)** | `yarn test` (or `bun test`) |
| **Start Development Server** | `yarn dev` (accessible at `http://localhost:4321`) |
| **Build Production Artifacts** | `yarn build` |
