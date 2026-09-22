import * as path from 'node:path';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';

dotenv.config();

var initialized = false;
export let astroAdapter: AstroAdapter;

import { Config } from '@quatrain/config';
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
   const gitUrl = Config.get<string>('git.url');
   if (!gitUrl) {
      const owner = Config.get<string>('git.repoOwner');
      const repo = Config.get<string>('git.repoName');
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
      
      const token = Config.get<string>('git.githubToken');
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

function applyConfig(config: any) {
   if (config.name) Config.set('user.name', config.name);
   if (config.email) Config.set('user.email', config.email);
   if (config.lang) Config.set('lang', config.lang);
   if (config.llm) {
      const activeProvider = config.llm.active || config.llm.provider || 'gemini';
      Config.set('llm.active', activeProvider);
      Config.set('llm.provider', activeProvider);

      let activeConf: any = null;
      if (config.llm.providers && typeof config.llm.providers === 'object') {
         Config.set('llm.providers', config.llm.providers);
         activeConf = config.llm.providers[activeProvider];
      }

      const activeApiKey = activeConf?.apiKey ?? config.llm.apiKey;
      const activeModel = activeConf?.model ?? config.llm.model;
      const activeEndpoint = activeConf?.endpoint ?? config.llm.endpoint;

      if (activeApiKey !== undefined && activeApiKey !== null) {
         const trimmedKey = String(activeApiKey).trim();
         Config.set('llm.apiKey', trimmedKey);
         if (activeProvider === 'gemini') {
            Config.set('gemini.apiKey', trimmedKey);
            process.env.GEMINI_API_KEY = trimmedKey;
         }
      }
      if (activeModel !== undefined && activeModel !== null) {
         const trimmedModel = String(activeModel).trim();
         Config.set('llm.model', trimmedModel);
         if (activeProvider === 'gemini') {
            Config.set('gemini.model', trimmedModel);
            process.env.GEMINI_MODEL = trimmedModel;
         }
      }
      if (activeEndpoint !== undefined && activeEndpoint !== null) {
         const trimmedEndpoint = String(activeEndpoint).trim();
         Config.set('llm.endpoint', trimmedEndpoint);
      }
   }
   if (config.githubClientId) {
      Config.set('github.clientId', config.githubClientId);
      process.env.GITHUB_CLIENT_ID = config.githubClientId;
   }
   if (config.githubClientSecret) {
      Config.set('github.clientSecret', config.githubClientSecret);
      process.env.GITHUB_CLIENT_SECRET = config.githubClientSecret;
   }
   if (config.okfStorage) {
      if (config.okfStorage.type) {
         Config.set('git.mode', config.okfStorage.type);
         process.env.GIT_MODE = config.okfStorage.type;
      }
      if (config.okfStorage.localPath) {
         Config.set('git.localPath', config.okfStorage.localPath);
         process.env.GIT_LOCAL_PATH = config.okfStorage.localPath;
      }
      if (config.okfStorage.githubToken) {
         Config.set('git.githubToken', config.okfStorage.githubToken);
         process.env.GIT_GITHUB_TOKEN = config.okfStorage.githubToken;
      }
      if (config.okfStorage.gitUrl) {
         Config.set('git.url', config.okfStorage.gitUrl);
         process.env.GIT_URL = config.okfStorage.gitUrl;
      }
      if (config.okfStorage.branch) {
         Config.set('git.branch', config.okfStorage.branch);
         process.env.GIT_BRANCH = config.okfStorage.branch;
      }
      
      const urlToParse = config.okfStorage.gitUrl || 
         (config.okfStorage.repoOwner && config.okfStorage.repoName ? `https://github.com/${config.okfStorage.repoOwner}/${config.okfStorage.repoName}` : '');
      const parsed = parseGitUrl(urlToParse);
      if (parsed) {
         Config.set('git.repoOwner', parsed.owner);
         Config.set('git.repoName', parsed.repo);
         process.env.GIT_REPO_OWNER = parsed.owner;
         process.env.GIT_REPO_NAME = parsed.repo;
      } else {
         if (config.okfStorage.repoOwner) {
            Config.set('git.repoOwner', config.okfStorage.repoOwner);
            process.env.GIT_REPO_OWNER = config.okfStorage.repoOwner;
         }
         if (config.okfStorage.repoName) {
            Config.set('git.repoName', config.okfStorage.repoName);
            process.env.GIT_REPO_NAME = config.okfStorage.repoName;
         }
      }
   }
   if (config.blobStorage) {
      if (config.blobStorage.type === 's3') {
         Config.set('s3.accessKey', config.blobStorage.accessKey);
         Config.set('s3.secretKey', config.blobStorage.secretKey);
         process.env.S3_ACCESS_KEY = config.blobStorage.accessKey;
         process.env.S3_SECRET_KEY = config.blobStorage.secretKey;
         if (config.blobStorage.region) {
            Config.set('s3.region', config.blobStorage.region);
            process.env.S3_REGION = config.blobStorage.region;
         }
         if (config.blobStorage.endpoint) {
            Config.set('s3.endpoint', config.blobStorage.endpoint);
            process.env.S3_ENDPOINT = config.blobStorage.endpoint;
         }
         if (config.blobStorage.bucket) {
            Config.set('s3.bucket', config.blobStorage.bucket);
            process.env.S3_BUCKET = config.blobStorage.bucket;
         }
      } else {
         delete process.env.S3_ACCESS_KEY;
         delete process.env.S3_SECRET_KEY;
      }
   }
}

function getUserConfigPath(): string {
   return Config.requireString('modaka.configPath', 'MODAKA_CONFIG_PATH is required');
}

function loadUserConfig() {
   const configPath = getUserConfigPath();
   try {
      if (fsSync.existsSync(configPath)) {
         const content = fsSync.readFileSync(configPath, 'utf-8');
         const config = JSON.parse(content);
         applyConfig(config);
         Log.info(`[Backend] Dynamically applied user configuration from ${configPath}`);
      }
   } catch (e: any) {
      Log.warn('[Backend] Failed to load user_config.json: ' + e.message);
   }
}

async function configureAiAdapter() {
   const activeProvider = Config.get<string>('llm.provider') || Config.get<string>('llm.active') || 'gemini';
   const apiKey = Config.get<string>('llm.apiKey') || Config.get<string>('gemini.apiKey');
   const model = Config.get<string>('llm.model') || Config.get<string>('gemini.model');
   const endpoint = Config.get<string>('llm.endpoint');

   if (!apiKey && activeProvider !== 'llama' && activeProvider !== 'ollama') {
      Log.warn(`[Backend] API key is not configured for LLM provider "${activeProvider}", AI adapter not set`);
      return;
   }

   if (activeProvider === 'gemini') {
      const { GeminiAdapter } = await import('@quatrain/ai-gemini');
      const adapter = new GeminiAdapter(apiKey);
      if (typeof (adapter as any).init === 'function') {
         (adapter as any).init();
      }
      Ai.setAdapter(adapter);
      Log.info(`[Backend] Gemini AI adapter registered successfully (Key: ...${apiKey ? apiKey.slice(-4) : 'none'})`);
   } else {
      const { OpenAiAdapter } = await import('@quatrain/ai-openai');
      let baseUrl = endpoint;
      if (!baseUrl) {
         if (activeProvider === 'openai') baseUrl = 'https://api.openai.com/v1';
         else if (activeProvider === 'mistral') baseUrl = 'https://api.mistral.ai/v1';
         else if (activeProvider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
         else if (activeProvider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
         else if (activeProvider === 'ollama' || activeProvider === 'llama') baseUrl = 'http://localhost:11434/v1';
      }

      const adapter = new OpenAiAdapter({
         apiKey: apiKey || 'ollama',
         baseUrl: baseUrl || undefined,
         defaultModel: model || undefined
      });
      if (typeof (adapter as any).init === 'function') {
         (adapter as any).init();
      }
      Ai.setAdapter(adapter);
      Log.info(`[Backend] OpenAI-compatible (${activeProvider}) AI adapter registered successfully (BaseUrl: ${baseUrl || 'default'}, Model: ${model || 'unspecified'})`);
   }
}

export async function reconfigureBackend() {
   // Reload config into Config registry
   loadUserConfig();

   // Re-init AI Adapter with updated configuration
   await configureAiAdapter();

   // Re-init Document Storage
   let docAdapter: any;
   const s3AccessKey = Config.get<string>('s3.accessKey');
   const s3SecretKey = Config.get<string>('s3.secretKey');

   if (s3AccessKey && s3SecretKey) {
      const s3Region = Config.requireString('s3.region', 'S3_REGION is required when S3 credentials are provided');
      const s3Endpoint = Config.requireString('s3.endpoint', 'S3_ENDPOINT is required when S3 credentials are provided');
      const s3Bucket = Config.requireString('s3.bucket', 'S3_BUCKET is required when S3 credentials are provided');
      const { S3StorageAdapter } = await import('@quatrain/storage-s3');
      docAdapter = new S3StorageAdapter({
         config: {
            region: s3Region,
            endpoint: s3Endpoint,
            accesskey: s3AccessKey,
            secret: s3SecretKey,
            bucket: s3Bucket
         }
      } as any);
      Log.info(`[Backend] Document storage reconfigured with S3StorageAdapter on bucket '${s3Bucket}'`);
   } else {
      const documentStoragePath = Config.requireString('document.storagePath', 'DOCUMENT_STORAGE_PATH is required');
      docAdapter = new LocalStorageAdapter({
         config: { bucket: 'documents' },
         basePath: documentStoragePath
      } as any);
      Log.info('[Backend] Document storage reconfigured with LocalStorageAdapter');
   }
   Storage.addStorage(docAdapter, 'document-storage', true);

   // Re-init Git Storage
   const gitMode = Config.requireEnum<'local' | 'github'>('git.mode', ['local', 'github'], 'GIT_MODE must be "local" or "github"');
   const gitLocalPath = Config.requireString('git.localPath', 'GIT_LOCAL_PATH is required');
   const gitBranch = Config.requireString('git.branch', 'GIT_BRANCH is required');
   const { GitStorageAdapter } = await import('@quatrain/storage-git');
   const gitAdapter = new GitStorageAdapter({
      config: {
         mode: gitMode,
         localPath: gitLocalPath,
         githubToken: Config.get<string>('git.githubToken'),
         owner: Config.get<string>('git.repoOwner'),
         repo: Config.get<string>('git.repoName'),
         branch: gitBranch,
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
   const gitAutoSync = Config.getBoolean('git.autoSync');
   const token = Config.get<string>('git.githubToken');
   const autoSyncEnabled = gitAutoSync === true || (gitAutoSync !== false && !!token);
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
   const githubClientId = Config.get<string>('github.clientId');
   const githubClientSecret = Config.get<string>('github.clientSecret');

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

   const nodeEnv = Config.requireString('node.env', 'NODE_ENV is required');
   const isProd = nodeEnv === 'production';
   Log.addLogger('default', new DefaultLoggerAdapter('', isProd ? LogLevel.INFO : LogLevel.DEBUG), true);

   // Initialize AI Adapter
   await configureAiAdapter();

   const gitMode = Config.requireEnum<'local' | 'github'>('git.mode', ['local', 'github'], 'GIT_MODE must be "local" or "github"');
   const gitLocalPath = Config.requireString('git.localPath', 'GIT_LOCAL_PATH is required');

   // 1. Initialize Document Storage (S3StorageAdapter with LocalStorageAdapter fallback)
   let docAdapter: any;
   const s3AccessKey = Config.get<string>('s3.accessKey');
   const s3SecretKey = Config.get<string>('s3.secretKey');

   if (s3AccessKey && s3SecretKey) {
      const s3Region = Config.requireString('s3.region', 'S3_REGION is required when S3 credentials are provided');
      const s3Endpoint = Config.requireString('s3.endpoint', 'S3_ENDPOINT is required when S3 credentials are provided');
      const s3Bucket = Config.requireString('s3.bucket', 'S3_BUCKET is required when S3 credentials are provided');
      const { S3StorageAdapter } = await import('@quatrain/storage-s3');
      docAdapter = new S3StorageAdapter({
         config: {
            region: s3Region,
            endpoint: s3Endpoint,
            accesskey: s3AccessKey,
            secret: s3SecretKey,
            bucket: s3Bucket
         }
      } as any);
      Log.info(`Document storage configured with S3StorageAdapter on bucket '${s3Bucket}'`);
   } else {
      const documentStoragePath = Config.requireString('document.storagePath', 'DOCUMENT_STORAGE_PATH is required for local storage');
      docAdapter = new LocalStorageAdapter({
         config: { bucket: 'documents' },
         basePath: documentStoragePath
      } as any);
      Log.info('Document storage configured with LocalStorageAdapter');
   }
   Storage.addStorage(docAdapter, 'document-storage', false);

   // 2. Initialize Git Storage Adapter
   const gitBranch = Config.requireString('git.branch', 'GIT_BRANCH is required');
   const { GitStorageAdapter } = await import('@quatrain/storage-git');
   const gitAdapter = new GitStorageAdapter({
      config: {
         mode: gitMode,
         localPath: gitLocalPath,
         githubToken: Config.get<string>('git.githubToken'),
         owner: Config.get<string>('git.repoOwner'),
         repo: Config.get<string>('git.repoName'),
         branch: gitBranch,
         bucket: 'metadata',
         noPush: true
      }
   } as any);
   Storage.addStorage(gitAdapter, 'git-storage', true);

   // 3. Initialize OKF Backend Adapter delegating to git-storage
   const okfAdapter = new OKFBackendAdapter({
      config: {
         database: gitLocalPath,
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
   const jellyfinApiKey = Config.get<string>('jellyfin.apiKey');
   const jellyfinUsername = Config.get<string>('jellyfin.username');
   const jellyfinPassword = Config.get<string>('jellyfin.password');
   if (jellyfinApiKey || (jellyfinUsername && jellyfinPassword)) {
      await Skills.activateSkill('jellyfin');
   }

   // 6. Initialize Queue Adapter
   const queueDbDir = Config.requireString('queue.storageDir', 'QUEUE_STORAGE_DIR is required');
   const queueDbPath = path.join(queueDbDir, 'queue.sqlite');
   fsSync.mkdirSync(queueDbDir, { recursive: true });
   Queue.addQueue(new SQLiteQueueAdapter({
      config: { database: queueDbPath }
   }), 'default', true);

   // 7. Initialize SearchEngine Adapter (QMD)
   const collectionName = Config.requireString('collection.name', 'COLLECTION_NAME is required');
   const qmdStorageDir = Config.get<string>('okf.storagePath') ?? gitLocalPath;
   const { QmdSearchEngineAdapter } = await import('@quatrain/searchengine-qmd');
   const { SearchEngine } = await import('@quatrain/searchengine');
   const searchAdapter = new QmdSearchEngineAdapter({
      alias: 'default',
      config: {
         collectionName,
         storageDir: qmdStorageDir
      }
   });
   await searchAdapter.initialize();
   SearchEngine.addEngine(searchAdapter, 'default', true);

   // Start background synchronization in local mode if enabled
   const gitAutoSync = Config.getBoolean('git.autoSync');
   const token = Config.get<string>('git.githubToken');
   const autoSyncEnabled = gitAutoSync === true || (gitAutoSync !== false && !!token);
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
   const gitLocalPath = Config.requireString('git.localPath', 'GIT_LOCAL_PATH is required');
   try {
      await syncGitRepository(gitLocalPath, true);
      return { success: true };
   } catch (err: any) {
      return { success: false, message: err.message };
   }
}
