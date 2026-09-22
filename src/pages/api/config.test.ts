import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, POST } from './config';
import { Config } from '@quatrain/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

vi.mock('../../lib/backend', () => ({
   reconfigureBackend: vi.fn().mockResolvedValue(undefined)
}));

describe('API Endpoint: /api/config', () => {
   let tmpConfigPath: string;

   beforeEach(async () => {
      vi.restoreAllMocks();
      tmpConfigPath = path.join(os.tmpdir(), `modaka-test-config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      Config.set('modaka.configPath', tmpConfigPath);
      Config.set('llm.active', undefined);
      Config.set('llm.provider', undefined);
      Config.set('llm.providers', undefined);
      Config.set('llm.apiKey', undefined);
      Config.set('llm.model', undefined);
      Config.set('llm.endpoint', undefined);
      Config.set('gemini.apiKey', undefined);
      Config.set('gemini.model', undefined);
   });

   afterEach(async () => {
      try {
         await fs.unlink(tmpConfigPath);
      } catch (e) {
         // ignore
      }
   });

   it('should persist generic TTS configuration via POST and retrieve it via GET', async () => {
      const payload = {
         name: 'crapougnax',
         lang: 'fr_FR',
         tts: {
            provider: 'ElevenLabs',
            apiKey: 'test-tts-api-key',
            voiceId: 'custom-voice-id-42'
         }
      };

      const postResponse = await POST({
         request: new Request('http://localhost:4321/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
         })
      } as any);

      expect(postResponse.status).toBe(200);
      const postData = await postResponse.json();
      expect(postData.success).toBe(true);

      // Verify Config registry was updated
      expect(Config.get('tts.provider')).toBe('ElevenLabs');
      expect(Config.get('tts.apiKey')).toBe('test-tts-api-key');
      expect(Config.get('tts.voiceId')).toBe('custom-voice-id-42');

      // Verify file on disk
      const savedContent = JSON.parse(await fs.readFile(tmpConfigPath, 'utf-8'));
      expect(savedContent.tts).toEqual({
         provider: 'ElevenLabs',
         apiKey: 'test-tts-api-key',
         voiceId: 'custom-voice-id-42'
      });

      // Verify GET returns merged tts and flat properties
      const getResponse = await GET({} as any);
      expect(getResponse.status).toBe(200);
      const getData = await getResponse.json();
      expect(getData.tts).toEqual({
         provider: 'ElevenLabs',
         apiKey: 'test-tts-api-key',
         voiceId: 'custom-voice-id-42'
      });
      expect(getData.ttsProvider).toBe('ElevenLabs');
      expect(getData.ttsApiKey).toBe('test-tts-api-key');
      expect(getData.ttsVoiceId).toBe('custom-voice-id-42');
   });

   it('should accept flat ttsProvider, ttsApiKey, ttsVoiceId and normalize into config.tts', async () => {
      const payload = {
         name: 'crapougnax',
         ttsProvider: 'OpenAI',
         ttsApiKey: 'sk-openai-key-99',
         ttsVoiceId: 'alloy'
      };

      const postResponse = await POST({
         request: new Request('http://localhost:4321/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
         })
      } as any);

      expect(postResponse.status).toBe(200);

      const savedContent = JSON.parse(await fs.readFile(tmpConfigPath, 'utf-8'));
      expect(savedContent.tts).toEqual({
         provider: 'OpenAI',
         apiKey: 'sk-openai-key-99',
         voiceId: 'alloy'
      });
      expect(Config.get('tts.provider')).toBe('OpenAI');
      expect(Config.get('tts.apiKey')).toBe('sk-openai-key-99');
      expect(Config.get('tts.voiceId')).toBe('alloy');
   });

   it('should persist multi-provider LLM Map via POST and retrieve all providers via GET with active provider', async () => {
      const payload = {
         name: 'crapougnax',
         llm: {
            active: 'openai',
            provider: 'openai',
            providers: {
               gemini: {
                  apiKey: 'AIzaSyTestKey123',
                  model: 'gemini-2.5-flash'
               },
               openai: {
                  apiKey: 'sk-openai-test-key-456',
                  model: 'gpt-4o',
                  endpoint: 'https://api.openai.com/v1'
               },
               ollama: {
                  model: 'llama3.2',
                  endpoint: 'http://localhost:11434'
               }
            }
         }
      };

      const postResponse = await POST({
         request: new Request('http://localhost:4321/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
         })
      } as any);

      expect(postResponse.status).toBe(200);
      const postData = await postResponse.json();
      expect(postData.success).toBe(true);

      // Verify Config registry was updated with active provider
      expect(Config.get('llm.active')).toBe('openai');
      expect(Config.get('llm.provider')).toBe('openai');
      expect(Config.get('llm.apiKey')).toBe('sk-openai-test-key-456');
      expect(Config.get('llm.model')).toBe('gpt-4o');
      expect(Config.get('llm.endpoint')).toBe('https://api.openai.com/v1');

      // Verify file on disk keeps all entered providers
      const savedContent = JSON.parse(await fs.readFile(tmpConfigPath, 'utf-8'));
      expect(savedContent.llm.active).toBe('openai');
      expect(savedContent.llm.providers.gemini.apiKey).toBe('AIzaSyTestKey123');
      expect(savedContent.llm.providers.openai.apiKey).toBe('sk-openai-test-key-456');
      expect(savedContent.llm.providers.ollama.model).toBe('llama3.2');

      // Verify GET returns merged LLM config with providers map and active provider values
      const getResponse = await GET({} as any);
      expect(getResponse.status).toBe(200);
      const getData = await getResponse.json();
      expect(getData.llm.active).toBe('openai');
      expect(getData.llm.provider).toBe('openai');
      expect(getData.llm.apiKey).toBe('sk-openai-test-key-456');
      expect(getData.llm.model).toBe('gpt-4o');
      expect(getData.llm.providers.gemini.apiKey).toBe('AIzaSyTestKey123');
      expect(getData.llm.providers.openai.apiKey).toBe('sk-openai-test-key-456');
      expect(getData.llm.providers.ollama.endpoint).toBe('http://localhost:11434');
   });

   it('should migrate legacy flat LLM config into providers map seamlessly', async () => {
      // Write legacy format to disk
      const legacyConfig = {
         name: 'crapougnax',
         llm: {
            provider: 'gemini',
            apiKey: 'AIzaSyLegacyKey',
            model: 'gemini-1.5-pro'
         }
      };
      await fs.writeFile(tmpConfigPath, JSON.stringify(legacyConfig), 'utf-8');

      const getResponse = await GET({} as any);
      expect(getResponse.status).toBe(200);
      const getData = await getResponse.json();

      expect(getData.llm.active).toBe('gemini');
      expect(getData.llm.apiKey).toBe('AIzaSyLegacyKey');
      expect(getData.llm.model).toBe('gemini-1.5-pro');
      expect(getData.llm.providers.gemini).toEqual({
         apiKey: 'AIzaSyLegacyKey',
         model: 'gemini-1.5-pro'
      });
   });
});
