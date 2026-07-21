import { describe, expect, it } from 'vitest';
import { compressConfig, decompressConfig, UserConfigSpec } from './config-compress';

describe('config-compress', () => {
  it('should return null when compressing null or undefined config', () => {
    expect(compressConfig(null)).toBeNull();
    expect(compressConfig(undefined)).toBeNull();
  });

  it('should return null when decompressing null or undefined input', () => {
    expect(decompressConfig(null)).toBeNull();
    expect(decompressConfig(undefined)).toBeNull();
  });

  it('should perform round-trip compression and decompression for full config', () => {
    const fullConfig: UserConfigSpec = {
      lang: 'fr_FR',
      name: 'Brad',
      email: 'brad@example.com',
      llm: {
        provider: 'llama',
        model: 'gemma-4',
        apiKey: 'sk-12345',
        llamaEndpoint: 'http://10.0.2.2:8080/v1',
      },
      okfStorage: {
        type: 'github',
        githubToken: 'ghp_token123',
        gitUrl: 'https://github.com/owner/repo',
      },
      blobStorage: {
        type: 's3',
        accessKey: 'AKIA123',
        secretKey: 'secret123',
        region: 'us-east-1',
        endpoint: 'https://s3.amazonaws.com',
        bucket: 'my-bucket',
      },
      interests: ['ai', 'tech'],
    };

    const compressed = compressConfig(fullConfig);
    expect(compressed).toBeDefined();
    expect(compressed?.lg).toBe('fr_FR');
    expect(compressed?.nm).toBe('Brad');
    expect(compressed?.ai?.pr).toBe('llama');
    expect(compressed?.ok?.ur).toBe('owner/repo');

    const decompressed = decompressConfig(compressed);
    expect(decompressed).toBeDefined();
    expect(decompressed?.lang).toBe('fr_FR');
    expect(decompressed?.name).toBe('Brad');
    expect(decompressed?.llm?.provider).toBe('llama');
    expect(decompressed?.okfStorage?.gitUrl).toBe('https://github.com/owner/repo');
    expect(decompressed?.blobStorage?.bucket).toBe('my-bucket');
  });

  it('should handle uncompressed config input gracefully in decompressConfig', () => {
    const rawConfig = {
      lang: 'en_US',
      name: 'Alice',
      okfStorage: { type: 'local' },
    };

    const result = decompressConfig(rawConfig);
    expect(result).toEqual(rawConfig);
  });
});
