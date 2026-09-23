import type { APIRoute } from 'astro';
import { Config } from '@quatrain/config';
import { reconfigureBackend } from '../../lib/backend';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

export const prerender = false;

function getConfigPath(): string {
   return Config.requireString('modaka.configPath', 'MODAKA_CONFIG_PATH is required');
}

/**
 * Builds configuration strictly from @quatrain/config.
 * Zero implicit fallback literals in code.
 */
function buildConfigFromRegistry(): Record<string, unknown> {
   const name = Config.get<string>('user.name');
   const email = Config.get<string>('user.email');
   const lang = Config.get<string>('lang');

   const llmActive = Config.get<string>('llm.active') || Config.get<string>('llm.provider');
   const llmProviders = Config.get<Record<string, { apiKey?: string; model?: string; endpoint?: string }>>('llm.providers');
   const llmApiKey = Config.get<string>('llm.apiKey') || Config.get<string>('gemini.apiKey');
   const llmModel = Config.get<string>('llm.model') || Config.get<string>('gemini.model');
   const llmEndpoint = Config.get<string>('llm.endpoint');
   const llmProvider = llmActive;

   const gitMode = Config.get<string>('git.mode');
   const gitLocalPath = Config.get<string>('git.localPath');
   const gitRepoOwner = Config.get<string>('git.repoOwner');
   const gitRepoName = Config.get<string>('git.repoName');
   const gitBranch = Config.get<string>('git.branch');
   const gitGithubToken = Config.get<string>('git.githubToken');
   const gitUrl = Config.get<string>('git.url');

   const s3AccessKey = Config.get<string>('s3.accessKey');
   const s3SecretKey = Config.get<string>('s3.secretKey');
   const s3Region = Config.get<string>('s3.region');
   const s3Endpoint = Config.get<string>('s3.endpoint');
   const s3Bucket = Config.get<string>('s3.bucket');
   const documentStoragePath = Config.get<string>('document.storagePath');

   const ttsProvider = Config.get<string>('tts.provider');
   const ttsApiKey = Config.get<string>('tts.apiKey') || Config.get<string>('elevenlabs.apiKey');
   const ttsVoiceId = Config.get<string>('tts.voiceId') || Config.get<string>('elevenlabs.voiceId');

   const config: Record<string, unknown> = {};

   if (name) config.name = name;
   if (email) config.email = email;
   if (lang) config.lang = lang;

   if (ttsProvider || ttsApiKey || ttsVoiceId) {
      const tts: Record<string, unknown> = {};
      if (ttsProvider) tts.provider = ttsProvider;
      if (ttsApiKey) tts.apiKey = ttsApiKey;
      if (ttsVoiceId) tts.voiceId = ttsVoiceId;
      config.tts = tts;
   }

   if (llmApiKey || llmModel || llmProvider || llmProviders || llmEndpoint) {
      const llm: Record<string, unknown> = {};
      if (llmProvider) {
         llm.provider = llmProvider;
         llm.active = llmProvider;
      }
      if (llmProviders) llm.providers = llmProviders;
      if (llmModel) llm.model = llmModel;
      if (llmApiKey) llm.apiKey = llmApiKey;
      if (llmEndpoint) llm.endpoint = llmEndpoint;
      config.llm = llm;
   }

   if (gitMode || gitLocalPath || gitRepoOwner || gitRepoName) {
      const okfStorage: Record<string, unknown> = {};
      if (gitMode) okfStorage.type = gitMode;
      if (gitLocalPath) okfStorage.localPath = gitLocalPath;
      if (gitRepoOwner) okfStorage.repoOwner = gitRepoOwner;
      if (gitRepoName) okfStorage.repoName = gitRepoName;
      if (gitBranch) okfStorage.branch = gitBranch;
      if (gitGithubToken) okfStorage.githubToken = gitGithubToken;
      if (gitUrl) okfStorage.gitUrl = gitUrl;
      config.okfStorage = okfStorage;
   }

   if (s3AccessKey && s3SecretKey) {
      const blobStorage: Record<string, unknown> = { type: 's3' };
      blobStorage.accessKey = s3AccessKey;
      blobStorage.secretKey = s3SecretKey;
      if (s3Region) blobStorage.region = s3Region;
      if (s3Endpoint) blobStorage.endpoint = s3Endpoint;
      if (s3Bucket) blobStorage.bucket = s3Bucket;
      config.blobStorage = blobStorage;
   } else if (documentStoragePath) {
      config.blobStorage = {
         type: 'local',
         localPath: documentStoragePath
      };
   }

   return config;
}

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
      const configPath = getConfigPath();
      let fileData: Record<string, unknown> = {};
      try {
         const content = await fs.readFile(configPath, 'utf-8');
         fileData = JSON.parse(content);
      } catch (e) {
         // File does not exist yet
      }

      // Read from @quatrain/config registry
      const registryData = buildConfigFromRegistry();

      const mergedTts = {
         ...((registryData.tts as Record<string, unknown>) || {}),
         ...((fileData.tts as Record<string, unknown>) || {})
      };

      const registryLlm = (registryData.llm as Record<string, unknown>) || {};
      const fileLlm = (fileData.llm as Record<string, unknown>) || {};

      const mergedProviders: Record<string, any> = {
         ...((registryLlm.providers as Record<string, any>) || {}),
         ...((fileLlm.providers as Record<string, any>) || {})
      };

      const activeProvider = (fileLlm.active || fileLlm.provider || registryLlm.active || registryLlm.provider || 'gemini') as string;

      // Migrate from flat credentials if providers is empty
      if (Object.keys(mergedProviders).length === 0) {
         const flatKey = (fileLlm.apiKey || registryLlm.apiKey || fileData.geminiApiKey) as string;
         const flatModel = (fileLlm.model || registryLlm.model || fileData.geminiModel) as string;
         const flatEndpoint = (fileLlm.endpoint || registryLlm.endpoint) as string;
         if (flatKey || flatModel || flatEndpoint) {
            mergedProviders[activeProvider] = {
               ...(flatKey ? { apiKey: flatKey } : {}),
               ...(flatModel ? { model: flatModel } : {}),
               ...(flatEndpoint ? { endpoint: flatEndpoint } : {})
            };
         }
      }

      const activeConfig = mergedProviders[activeProvider] || {};
      const mergedLlm = {
         ...registryLlm,
         ...fileLlm,
         active: activeProvider,
         provider: activeProvider,
         providers: mergedProviders,
         apiKey: activeConfig.apiKey || fileLlm.apiKey || registryLlm.apiKey || '',
         model: activeConfig.model || fileLlm.model || registryLlm.model || '',
         endpoint: activeConfig.endpoint || fileLlm.endpoint || registryLlm.endpoint || ''
      };

      const mergedData = {
         ...registryData,
         ...fileData,
         tts: mergedTts,
         ttsProvider: mergedTts.provider || fileData.ttsProvider,
         ttsApiKey: mergedTts.apiKey || fileData.ttsApiKey || fileData.elevenLabsApiKey,
         ttsVoiceId: mergedTts.voiceId || fileData.ttsVoiceId || fileData.elevenLabsVoiceId,
         llm: mergedLlm,
         okfStorage: {
            ...((registryData.okfStorage as Record<string, unknown>) || {}),
            ...((fileData.okfStorage as Record<string, unknown>) || {})
         },
         blobStorage: {
            ...((registryData.blobStorage as Record<string, unknown>) || {}),
            ...((fileData.blobStorage as Record<string, unknown>) || {})
         }
      };

      return new Response(JSON.stringify(mergedData), {
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
      const incoming = await request.json();
      const configPath = getConfigPath();
      await ensureDir(configPath);
      
      let existing: Record<string, any> = {};
      try {
         const content = await fs.readFile(configPath, 'utf-8');
         existing = JSON.parse(content);
      } catch (e) {
         // file does not exist yet
      }

      const config: Record<string, any> = {
         ...existing,
         ...incoming
      };

      const ttsProvider = incoming.tts?.provider || incoming.ttsProvider;
      const ttsApiKey = incoming.tts?.apiKey || incoming.ttsApiKey || incoming.elevenLabsApiKey;
      const ttsVoiceId = incoming.tts?.voiceId || incoming.ttsVoiceId || incoming.elevenLabsVoiceId;

      if (ttsProvider || ttsApiKey || ttsVoiceId || existing.tts) {
         const existingTts = typeof existing.tts === 'object' && existing.tts !== null ? existing.tts : {};
         const incomingTts = typeof incoming.tts === 'object' && incoming.tts !== null ? incoming.tts : {};
         config.tts = {
            ...existingTts,
            ...incomingTts,
            ...(ttsProvider ? { provider: ttsProvider } : {}),
            ...(ttsApiKey ? { apiKey: ttsApiKey } : {}),
            ...(ttsVoiceId ? { voiceId: ttsVoiceId } : {})
         };
         if (config.tts.provider) Config.set('tts.provider', config.tts.provider);
         if (config.tts.apiKey) {
            Config.set('tts.apiKey', config.tts.apiKey);
            Config.set('elevenlabs.apiKey', config.tts.apiKey);
         }
         if (config.tts.voiceId) {
            Config.set('tts.voiceId', config.tts.voiceId);
            Config.set('elevenlabs.voiceId', config.tts.voiceId);
         }
      }

      if (incoming.llm) {
         const existingLlm = typeof existing.llm === 'object' && existing.llm !== null ? existing.llm : {};
         const existingProviders = typeof existingLlm.providers === 'object' && existingLlm.providers !== null ? existingLlm.providers : {};
         const incomingProviders = typeof incoming.llm.providers === 'object' && incoming.llm.providers !== null ? incoming.llm.providers : {};

         const activeProvider = incoming.llm.active || incoming.llm.provider || existingLlm.active || existingLlm.provider || 'gemini';
         const providers: Record<string, any> = {
            ...existingProviders,
            ...incomingProviders
         };

         if (incoming.llm.apiKey !== undefined || incoming.llm.model !== undefined || incoming.llm.endpoint !== undefined) {
            providers[activeProvider] = {
               ...(providers[activeProvider] || {}),
               ...(incoming.llm.apiKey !== undefined ? { apiKey: incoming.llm.apiKey } : {}),
               ...(incoming.llm.model !== undefined ? { model: incoming.llm.model } : {}),
               ...(incoming.llm.endpoint !== undefined ? { endpoint: incoming.llm.endpoint } : {})
            };
         }

         const activeConf = providers[activeProvider] || {};

         config.llm = {
            ...existingLlm,
            ...incoming.llm,
            active: activeProvider,
            provider: activeProvider,
            providers,
            apiKey: activeConf.apiKey || incoming.llm.apiKey || '',
            model: activeConf.model || incoming.llm.model || '',
            endpoint: activeConf.endpoint || incoming.llm.endpoint || ''
         };

         Config.set('llm.active', activeProvider);
         Config.set('llm.provider', activeProvider);
         Config.set('llm.providers', providers);

         if (activeConf.apiKey !== undefined) {
            Config.set('llm.apiKey', activeConf.apiKey);
            if (activeProvider === 'gemini') {
               Config.set('gemini.apiKey', activeConf.apiKey);
               process.env.GEMINI_API_KEY = activeConf.apiKey;
            }
         }
         if (activeConf.model !== undefined) {
            Config.set('llm.model', activeConf.model);
            if (activeProvider === 'gemini') {
               Config.set('gemini.model', activeConf.model);
               process.env.GEMINI_MODEL = activeConf.model;
            }
         }
         if (activeConf.endpoint !== undefined) {
            Config.set('llm.endpoint', activeConf.endpoint);
         }
      }

      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      
      // Update @quatrain/config memory store
      if (config.name) Config.set('user.name', config.name);
      if (config.email) Config.set('user.email', config.email);
      if (config.lang) Config.set('lang', config.lang);
      if (config.okfStorage?.type) Config.set('git.mode', config.okfStorage.type);
      if (config.okfStorage?.githubToken) Config.set('git.githubToken', config.okfStorage.githubToken);
      if (config.blobStorage?.accessKey) Config.set('s3.accessKey', config.blobStorage.accessKey);
      if (config.blobStorage?.secretKey) Config.set('s3.secretKey', config.blobStorage.secretKey);
      if (config.blobStorage?.endpoint) Config.set('s3.endpoint', config.blobStorage.endpoint);
      if (config.blobStorage?.bucket) Config.set('s3.bucket', config.blobStorage.bucket);

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
