import * as path from 'node:path';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';

dotenv.config();

var initialized = false;
export let astroAdapter: AstroAdapter;

import { Log, DefaultLoggerAdapter, LogLevel } from '@quatrain/log';
import { Backend, InjectMetaMiddleware } from '@quatrain/backend';
import { OKFBackendAdapter } from '@quatrain/okf';
import { Storage } from '@quatrain/storage';
import { LocalStorageAdapter } from '@quatrain/storage-local';
import { AstroAdapter } from '@quatrain/api-server-astro';
import { CrudEndpoint, ValuesEndpoint, ListEndpoint } from '@quatrain/api-server';
import { ContentItem } from './models/ContentItem';
import { Ai } from '@quatrain/ai';
import { Ingestion } from '@quatrain/ingestion';
import { OcrIngestionAdapter } from '@quatrain/ingestion-ocr';
import { AudioIngestionAdapter } from '@quatrain/ingestion-audio';
import { WebIngestionAdapter } from '@quatrain/ingestion-web';
import { Queue } from '@quatrain/queue';
import { SQLiteQueueAdapter } from '@quatrain/queue-sqlite';
import { Auth } from '@quatrain/auth';
import { GithubAuthAdapter } from '@quatrain/auth-github';

const execPromise = promisify(exec);
const GIT_SYNC_LOCK_KEY = Symbol.for('__second_brain_git_sync_lock');

function runGit(cmd: string, cwd: string, token?: string): Promise<{ stdout: string; stderr: string }> {
   const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
   let extraArgs = '';
   if (token) {
      const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
      extraArgs = `-c "http.extraheader=AUTHORIZATION: basic ${auth}" -c "credential.helper=" `;
   }
   return execPromise(`git ${extraArgs}${cmd}`, { cwd, env });
}

async function updateReadmeChangelog(localPath: string) {
   try {
      // Check if origin/main exists
      let hasOriginMain = false;
      try {
         await runGit('rev-parse --verify origin/main', localPath);
         hasOriginMain = true;
      } catch (e) {
         // origin/main doesn't exist yet
      }

      const logRange = hasOriginMain ? 'origin/main..HEAD' : 'HEAD';
      // Format: YYYY-MM-DD: Commit message
      const { stdout } = await runGit(
         `log ${logRange} --pretty=format:"* **%cd** : %s" --date=format:"%Y-%m-%d"`,
         localPath
      );

      const newEntries = stdout.trim();
      if (!newEntries) return; // No new commits to log

      // Read current README.md
      const readmePath = path.join(localPath, 'README.md');
      let currentContent = '';
      try {
         currentContent = await fs.readFile(readmePath, 'utf-8');
      } catch (e) {
         currentContent = '# Knowledge Base\n';
      }

      const newLines = newEntries.split('\n').filter(line => line.trim().startsWith('*'));
      if (newLines.length === 0) return;

      const header = '## Journal des modifications';
      let headerIndex = currentContent.indexOf(header);
      let updatedContent = '';

      if (headerIndex === -1) {
         updatedContent = currentContent.trim() + '\n\n' + header + '\n\n' + newLines.join('\n') + '\n';
      } else {
         const beforeHeader = currentContent.substring(0, headerIndex + header.length);
         const afterHeader = currentContent.substring(headerIndex + header.length).trim();
         
         const existingLines = afterHeader.split('\n').map(l => l.trim()).filter(l => l.length > 0);
         const uniqueNewLines = newLines.filter(line => !existingLines.includes(line.trim()));

         if (uniqueNewLines.length === 0) return; // No new unique lines

         updatedContent = beforeHeader.trim() + '\n\n' + uniqueNewLines.join('\n') + '\n' + (existingLines.length > 0 ? existingLines.join('\n') + '\n' : '');
      }

      await fs.writeFile(readmePath, updatedContent, 'utf-8');
      await runGit('add README.md', localPath);
      await runGit('commit -m "docs: update changelog in README.md [skip ci]"', localPath);
      Log.info('[Git Sync] Changelog updated in README.md');
   } catch (err: any) {
      Log.warn(`[Git Sync] Failed to update README.md changelog: ${err.message}`);
   }
}

function parseGitUrl(url: string): { owner: string; repo: string } | null {
   if (!url) return null;
   let clean = url.trim();
   // Remove git@github.com: or https://github.com/ or http://github.com/
   clean = clean.replace(/^(https?:\/\/github\.com\/|git@github\.com:)/i, '');
   // Remove .git suffix
   clean = clean.replace(/\.git$/i, '');
   const parts = clean.split('/');
   if (parts.length >= 2) {
      return {
         owner: parts[0],
         repo: parts[1]
      };
   }
   return null;
}

function getCloneUrl(): string | null {
   const gitUrl = process.env.GIT_URL;
   if (!gitUrl) {
      const owner = process.env.GIT_REPO_OWNER;
      const repo = process.env.GIT_REPO_NAME;
      if (!owner || !repo) return null;
      return `https://github.com/${owner}/${repo}.git`;
   }
   return gitUrl;
}

async function syncGitRepository(localPath: string, throwOnError = false) {
   if ((globalThis as any)[GIT_SYNC_LOCK_KEY]) {
      Log.debug(`[Git Sync] Sync already in progress, skipping`);
      if (throwOnError) throw new Error("Une synchronisation est déjà en cours");
      return;
   }
   (globalThis as any)[GIT_SYNC_LOCK_KEY] = true;
   try {
      // Ensure target directory exists
      await fs.mkdir(localPath, { recursive: true });
      
      const token = process.env.GIT_GITHUB_TOKEN;
      const gitDir = path.join(localPath, '.git');
      const hasGit = fsSync.existsSync(gitDir);
      
      if (!hasGit) {
         const cloneUrl = getCloneUrl();
         if (cloneUrl) {
            Log.info(`[Git Sync] Initializing local Git repository from remote URL...`);
            await runGit('init', localPath);
            await runGit(`remote add origin "${cloneUrl}"`, localPath);
            await runGit('fetch origin', localPath, token);
            try {
               await runGit('checkout main', localPath);
            } catch (e) {
               await runGit('checkout -b main', localPath);
            }
            Log.info(`[Git Sync] Local Git repository initialized successfully in ${localPath}`);
         } else {
            Log.warn(`[Git Sync] No Git remote repository URL configured`);
            if (throwOnError) throw new Error("Aucune URL de dépôt Git configurée");
            return;
         }
      }

      // Check remote configuration
      let remoteUrl = '';
      try {
         const { stdout } = await runGit('remote get-url origin', localPath);
         remoteUrl = stdout.trim();
      } catch (e) {
         // No origin remote configured yet
      }

      if (!remoteUrl) {
         const cloneUrl = getCloneUrl();
         if (cloneUrl) {
            try {
               await runGit(`remote add origin "${cloneUrl}"`, localPath);
               remoteUrl = cloneUrl;
            } catch (e) {}
         }
      }

      if (!remoteUrl) {
         Log.debug(`[Git Sync] Aucun remote configuré pour ${localPath}, synchronisation distante ignorée`);
         return;
      }

      // If remote is GitHub HTTPS and no token is provided, avoid prompting or failing with fatal username error
      if (remoteUrl.includes('github.com') && !token && !remoteUrl.includes('@')) {
         Log.info(`[Git Sync] Dépôt distant GitHub détecté mais aucun GIT_GITHUB_TOKEN configuré : synchronisation distante ignorée.`);
         if (throwOnError) {
            throw new Error("GIT_GITHUB_TOKEN requis pour synchroniser avec GitHub");
         }
         return;
      }

      Log.info(`[Git Sync] Synchronisant le dépôt Git local-first...`);
      await runGit('fetch origin', localPath, token);
      
      // Update changelog in README.md based on new local commits before pulling/pushing
      await updateReadmeChangelog(localPath);

      // Ensure upstream branch is tracked once if not already set
      try {
         await runGit('rev-parse --abbrev-ref @{u}', localPath);
      } catch (e) {
         await runGit('branch --set-upstream-to=origin/main main', localPath).catch(() => {});
      }

      try {
         await runGit('pull --rebase origin main', localPath, token);
      } catch (pullErr) {
         await runGit('pull origin main', localPath, token).catch(() => {});
      }

      await runGit('push origin main', localPath, token);
      Log.info(`[Git Sync] Synchronisation terminée avec succès`);
   } catch (err: any) {
      Log.warn(`[Git Sync] Échec de la synchronisation : ${err.message}`);
      if (throwOnError) throw err;
   } finally {
      (globalThis as any)[GIT_SYNC_LOCK_KEY] = false;
   }
}

function applyConfigToProcessEnv(config: any) {
   if (config.llm) {
      if (config.llm.apiKey !== undefined && config.llm.apiKey !== null) {
         const trimmedKey = String(config.llm.apiKey).trim();
         if (trimmedKey) {
            process.env.GEMINI_API_KEY = trimmedKey;
         }
      }
      if (config.llm.model && config.llm.model.trim() !== '') {
         process.env.GEMINI_MODEL = config.llm.model.trim();
      }
   }
   if (config.githubClientId) process.env.GITHUB_CLIENT_ID = config.githubClientId;
   if (config.githubClientSecret) process.env.GITHUB_CLIENT_SECRET = config.githubClientSecret;
   if (config.okfStorage) {
      if (config.okfStorage.githubClientId) process.env.GITHUB_CLIENT_ID = config.okfStorage.githubClientId;
      if (config.okfStorage.githubClientSecret) process.env.GITHUB_CLIENT_SECRET = config.okfStorage.githubClientSecret;
      process.env.GIT_MODE = config.okfStorage.type === 'github' ? 'github' : 'local';
      if (config.okfStorage.githubToken) process.env.GIT_GITHUB_TOKEN = config.okfStorage.githubToken;
      if (config.okfStorage.gitUrl) process.env.GIT_URL = config.okfStorage.gitUrl;
      if (config.okfStorage.branch) process.env.GIT_BRANCH = config.okfStorage.branch;
      
      // Parse gitUrl to extract owner and repo for backward compatibility (Octokit/GitStorageAdapter)
      const urlToParse = config.okfStorage.gitUrl || 
         (config.okfStorage.repoOwner && config.okfStorage.repoName ? `https://github.com/${config.okfStorage.repoOwner}/${config.okfStorage.repoName}` : '');
      const parsed = parseGitUrl(urlToParse);
      if (parsed) {
         process.env.GIT_REPO_OWNER = parsed.owner;
         process.env.GIT_REPO_NAME = parsed.repo;
      } else {
         if (config.okfStorage.repoOwner) process.env.GIT_REPO_OWNER = config.okfStorage.repoOwner;
         if (config.okfStorage.repoName) process.env.GIT_REPO_NAME = config.okfStorage.repoName;
      }
   }
   if (config.blobStorage) {
      if (config.blobStorage.type === 's3') {
         process.env.S3_ACCESS_KEY = config.blobStorage.accessKey;
         process.env.S3_SECRET_KEY = config.blobStorage.secretKey;
         process.env.S3_REGION = config.blobStorage.region || 'us-east-1';
         process.env.S3_ENDPOINT = config.blobStorage.endpoint;
         process.env.S3_BUCKET = config.blobStorage.bucket || 'second-brain';
      } else {
         delete process.env.S3_ACCESS_KEY;
         delete process.env.S3_SECRET_KEY;
      }
   }
}

function loadUserConfig() {
   const configPath = path.resolve(process.cwd(), 'src/config/user_config.json');
   try {
      if (fsSync.existsSync(configPath)) {
         const content = fsSync.readFileSync(configPath, 'utf-8');
         const config = JSON.parse(content);
         applyConfigToProcessEnv(config);
         Log.info('[Backend] Dynamically applied user configuration from user_config.json');
      }
   } catch (e: any) {
      Log.warn('[Backend] Failed to load user_config.json: ' + e.message);
   }
}

export async function reconfigureBackend() {
   // Reload config into process.env
   loadUserConfig();

   // Re-init AI Adapter with updated key
   const geminiApiKey = process.env.GEMINI_API_KEY;
   if (geminiApiKey) {
      const { GeminiAdapter } = await import('@quatrain/ai-gemini');
      const adapter = new GeminiAdapter(geminiApiKey);
      adapter.init();
      Ai.setAdapter(adapter);
      Log.info(`[Backend] AI adapter reconfigured successfully (Key: ...${geminiApiKey.slice(-4)})`);
   }

   // Re-init Document Storage
   const documentStoragePath = process.env.DOCUMENT_STORAGE_PATH || path.resolve(process.cwd(), 'data/documents');
   let docAdapter: any;
   if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
      const { S3StorageAdapter } = await import('@quatrain/storage-s3');
      docAdapter = new S3StorageAdapter({
         config: {
            region: process.env.S3_REGION || 'us-east-1',
            endpoint: process.env.S3_ENDPOINT,
            accesskey: process.env.S3_ACCESS_KEY,
            secret: process.env.S3_SECRET_KEY,
            bucket: process.env.S3_BUCKET || 'second-brain'
         }
      } as any);
      Log.info(`[Backend] Document storage reconfigured with S3StorageAdapter on bucket '${process.env.S3_BUCKET || 'second-brain'}'`);
   } else {
      docAdapter = new LocalStorageAdapter({
         config: { bucket: 'documents' },
         basePath: documentStoragePath
      } as any);
      Log.info('[Backend] Document storage reconfigured with LocalStorageAdapter');
   }
   Storage.addStorage(docAdapter, 'document-storage', true);

   // Re-init Git Storage
   const gitMode = (process.env.GIT_MODE as 'local' | 'github') || 'local';
   const gitLocalPath = process.env.GIT_LOCAL_PATH || path.resolve(process.cwd(), 'data/content');
   const { GitStorageAdapter } = await import('@quatrain/storage-git');
   const gitAdapter = new GitStorageAdapter({
      config: {
         mode: gitMode,
         localPath: gitLocalPath,
         githubToken: process.env.GIT_GITHUB_TOKEN,
         owner: process.env.GIT_REPO_OWNER,
         repo: process.env.GIT_REPO_NAME,
         branch: process.env.GIT_BRANCH || 'main',
         bucket: 'metadata',
         noPush: true
      }
   } as any);
   Storage.addStorage(gitAdapter, 'git-storage', true);

   // Re-init OKF Backend
   const okfAdapter = new OKFBackendAdapter({
      config: {
         database: gitLocalPath,
         storage: 'git-storage'
      },
      middlewares: [new InjectMetaMiddleware()]
   });
   Backend.addBackend(okfAdapter, 'default', true);

   // Re-init Git sync interval if local git mode is selected
   const GIT_SYNC_INTERVAL_KEY = Symbol.for('__second_brain_git_sync_interval');
   const existingInterval = (globalThis as any)[GIT_SYNC_INTERVAL_KEY];
   if (existingInterval) {
      clearInterval(existingInterval);
      delete (globalThis as any)[GIT_SYNC_INTERVAL_KEY];
   }
   const autoSyncEnabled = process.env.GIT_AUTO_SYNC === 'true' || (process.env.GIT_AUTO_SYNC !== 'false' && !!process.env.GIT_GITHUB_TOKEN);
   if (autoSyncEnabled && gitMode === 'local' && gitLocalPath) {
      syncGitRepository(gitLocalPath);
      const interval = setInterval(() => {
         syncGitRepository(gitLocalPath);
      }, 30000);
      if (interval && typeof interval.unref === 'function') {
         interval.unref();
      }
      (globalThis as any)[GIT_SYNC_INTERVAL_KEY] = interval;
   } else if (gitMode === 'local') {
      Log.info('[Git Sync] Auto-sync disabled in local mode (set GIT_AUTO_SYNC=true and provide GIT_GITHUB_TOKEN to enable).');
   }

   // Re-register Github OAuth endpoints if configuration changed
   registerGithubAuthEndpoints();
}



export function registerGithubAuthEndpoints() {
   if (!astroAdapter) return;
   const githubClientId = process.env.GITHUB_CLIENT_ID;
   const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

   if (githubClientId && githubClientSecret) {
      const githubAdapter = GithubAuthAdapter.factory({
         clientId: githubClientId,
         clientSecret: githubClientSecret
      });
      if (githubAdapter) {
         Auth.addProvider(githubAdapter, 'github');
         astroAdapter.addEndpoint(githubAdapter.getEndpointHandler(), '/api/auth/github', {
            adapter: githubAdapter,
            webRedirectUri: '/'
         });
         Log.info('[Auth] Github OAuth adapter and API endpoints registered successfully.');
         return;
      }
   }

   const fallbackAuthApi = (router: any) => {
      router.get('/login', async (_req: any, res: any) => {
         res.status(500).json({
            error: "Identifiants GitHub OAuth non configurés sur le serveur. Définissez GITHUB_CLIENT_ID et GITHUB_CLIENT_SECRET dans l'environnement."
         });
      });
      router.get('/callback', async (_req: any, res: any) => {
         res.status(500).json({
            error: "Identifiants GitHub OAuth non configurés sur le serveur."
         });
      });
   };
   astroAdapter.addEndpoint(fallbackAuthApi, '/api/auth/github');
   Log.warn('[Auth] Github OAuth credentials missing. Fallback diagnostic endpoints registered under /api/auth/github.');
}

export async function initBackend() {
   if (initialized) return;

   // Load configuration file overrides at startup
   loadUserConfig();

   const isProd = process.env.NODE_ENV === 'production';
   Log.addLogger('default', new DefaultLoggerAdapter('', isProd ? LogLevel.INFO : LogLevel.DEBUG), true);

   const geminiApiKey = process.env.GEMINI_API_KEY;
   if (geminiApiKey) {
      const { GeminiAdapter } = await import('@quatrain/ai-gemini');
      Ai.setAdapter(new GeminiAdapter(geminiApiKey));
      Log.info('AI adapter registered successfully');
   } else {
      Log.warn('GEMINI_API_KEY is not configured, AI adapter not set');
   }

   const gitMode = (process.env.GIT_MODE as 'local' | 'github') || 'local';
   const gitLocalPath = process.env.GIT_LOCAL_PATH || path.resolve(process.cwd(), 'data/content');
   const documentStoragePath = process.env.DOCUMENT_STORAGE_PATH || path.resolve(process.cwd(), 'data/documents');

    // 1. Initialize Document Storage (S3StorageAdapter with LocalStorageAdapter fallback)
    let docAdapter: any;
    if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
       const { S3StorageAdapter } = await import('@quatrain/storage-s3');
       docAdapter = new S3StorageAdapter({
          config: {
             region: process.env.S3_REGION || 'us-east-1',
             endpoint: process.env.S3_ENDPOINT,
             accesskey: process.env.S3_ACCESS_KEY,
             secret: process.env.S3_SECRET_KEY,
             bucket: process.env.S3_BUCKET || 'second-brain'
          }
       } as any);
       Log.info(`Document storage configured with S3StorageAdapter on bucket '${process.env.S3_BUCKET || 'second-brain'}'`);
    } else {
       docAdapter = new LocalStorageAdapter({
          config: { bucket: 'documents' },
          basePath: documentStoragePath
       } as any);
       Log.info('Document storage configured with LocalStorageAdapter (S3 environment variables not set)');
    }
    Storage.addStorage(docAdapter, 'document-storage', false);

   // 2. Initialize Git Storage Adapter
   const { GitStorageAdapter } = await import('@quatrain/storage-git');
   const gitAdapter = new GitStorageAdapter({
      config: {
         mode: gitMode,
         localPath: gitLocalPath,
         githubToken: process.env.GIT_GITHUB_TOKEN,
         owner: process.env.GIT_REPO_OWNER,
         repo: process.env.GIT_REPO_NAME,
         branch: process.env.GIT_BRANCH || 'main',
         bucket: 'metadata',
         noPush: true
      }
   } as any);
   Storage.addStorage(gitAdapter, 'git-storage', true);

   // 3. Initialize OKF Backend Adapter delegating to git-storage
   const okfAdapter = new OKFBackendAdapter({
      config: {
         database: gitLocalPath, // Fallback if no storage is active
         storage: 'git-storage'
      },
      middlewares: [new InjectMetaMiddleware()]
   });

   Backend.addBackend(okfAdapter, 'default', true);

    // 4. Initialize API Server Astro Adapter
    astroAdapter = new AstroAdapter();
    registerGithubAuthEndpoints();

   // Register endpoint for ContentItem
   const ContentItemApi = (router: any, rootPath: string, options: any) => {
      CrudEndpoint(ContentItem)(router, rootPath, options);
      ValuesEndpoint(ContentItem)(router, rootPath, options);
      ListEndpoint(ContentItem)(router, rootPath, options);
   };

   astroAdapter.addEndpoint(ContentItemApi, '/api/content');

   // 5. Initialize Ingestion Adapters
   Ingestion.addAdapter(new OcrIngestionAdapter(), 'ocr');
   Ingestion.addAdapter(new AudioIngestionAdapter(), 'audio');
   Ingestion.addAdapter(new WebIngestionAdapter(), 'web');

   // Initialize Skills Packages (Lazy discovery & dynamic activation)
   const { Skills } = await import('./skills/Skills');
   const jellyfinManifest = (await import('./skills/jellyfin/manifest.json')).default;
   let jellyfinPkgMeta;
   if (jellyfinManifest.extends === 'package.json') {
      jellyfinPkgMeta = (await import('./skills/jellyfin/package.json')).default;
   }

   Skills.registerPackage('jellyfin', jellyfinManifest, async (cfg) => {
      const { JellyfinSkillAdapter } = await import('./skills/jellyfin/JellyfinSkillAdapter');
      return new JellyfinSkillAdapter(cfg);
   }, jellyfinPkgMeta);

   // Auto-activate skill if configuration credentials exist
   if (process.env.JELLYFIN_API_KEY || (process.env.JELLYFIN_USERNAME && process.env.JELLYFIN_PASSWORD)) {
      await Skills.activateSkill('jellyfin');
   }

   // 6. Initialize Queue Adapter
   const queueDbDir = path.resolve(process.cwd(), '.queue');
   const queueDbPath = path.join(queueDbDir, 'queue.sqlite');
   try {
      fsSync.mkdirSync(queueDbDir, { recursive: true });
   } catch (e) {
      // directory already exists or error
   }
   Queue.addQueue(new SQLiteQueueAdapter({
      config: { database: queueDbPath }
   }), 'default', true);

   // 7. Initialize SearchEngine Adapter (QMD)
   const qmdStorageDir = process.env.OKF_STORAGE_PATH || gitLocalPath || path.resolve(process.cwd(), 'data/content');
   const { QmdSearchEngineAdapter } = await import('@quatrain/searchengine-qmd');
   const { SearchEngine } = await import('@quatrain/searchengine');
   const searchAdapter = new QmdSearchEngineAdapter({
      alias: 'default',
      config: {
         collectionName: process.env.COLLECTION_NAME || 'modaka-knowledge',
         storageDir: qmdStorageDir
      }
   });
   await searchAdapter.initialize();
   SearchEngine.addEngine(searchAdapter, 'default', true);

   // Start background synchronization in local mode if enabled
   const autoSyncEnabled = process.env.GIT_AUTO_SYNC === 'true' || (process.env.GIT_AUTO_SYNC !== 'false' && !!process.env.GIT_GITHUB_TOKEN);
   if (autoSyncEnabled && gitMode === 'local' && gitLocalPath) {
      const GIT_SYNC_INTERVAL_KEY = Symbol.for('__second_brain_git_sync_interval');
      if (!(globalThis as any)[GIT_SYNC_INTERVAL_KEY]) {
         syncGitRepository(gitLocalPath);
         const interval = setInterval(() => {
            syncGitRepository(gitLocalPath);
         }, 30000);
         if (interval && typeof interval.unref === 'function') {
            interval.unref();
         }
         (globalThis as any)[GIT_SYNC_INTERVAL_KEY] = interval;
      }
   } else if (gitMode === 'local') {
      Log.info('[Git Sync] Auto-sync disabled in local mode (set GIT_AUTO_SYNC=true and provide GIT_GITHUB_TOKEN to enable).');
   }

   import('./queue').then(({ QueueManager }) => {
      QueueManager.startListening();
   }).catch(err => {
      Log.error(`[Backend] Failed to start QueueManager listener: ${err.message}`);
   });

   initialized = true;
}

export async function triggerGitSync(): Promise<{ success: boolean; message?: string }> {
   const gitLocalPath = process.env.GIT_LOCAL_PATH || path.resolve(process.cwd(), 'data/content');
   try {
      await syncGitRepository(gitLocalPath, true);
      return { success: true };
   } catch (err: any) {
      return { success: false, message: err.message };
   }
}
