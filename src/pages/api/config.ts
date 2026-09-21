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

   const llmApiKey = Config.get<string>('gemini.apiKey');
   const llmModel = Config.get<string>('gemini.model');
   const llmProvider = Config.get<string>('llm.provider');

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

   const config: Record<string, unknown> = {};

   if (name) config.name = name;
   if (email) config.email = email;
   if (lang) config.lang = lang;

   if (llmApiKey || llmModel || llmProvider) {
      const llm: Record<string, unknown> = {};
      if (llmProvider) llm.provider = llmProvider;
      if (llmModel) llm.model = llmModel;
      if (llmApiKey) llm.apiKey = llmApiKey;
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

      const mergedData = {
         ...registryData,
         ...fileData,
         llm: {
            ...((registryData.llm as Record<string, unknown>) || {}),
            ...((fileData.llm as Record<string, unknown>) || {})
         },
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
      const config = await request.json();
      const configPath = getConfigPath();
      await ensureDir(configPath);
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      
      // Update @quatrain/config memory store
      if (config.name) Config.set('user.name', config.name);
      if (config.email) Config.set('user.email', config.email);
      if (config.lang) Config.set('lang', config.lang);
      if (config.llm?.apiKey) Config.set('gemini.apiKey', config.llm.apiKey);
      if (config.llm?.model) Config.set('gemini.model', config.llm.model);
      if (config.llm?.provider) Config.set('llm.provider', config.llm.provider);
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
