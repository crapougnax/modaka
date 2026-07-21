/**
 * User configuration object structure.
 */
export interface UserConfigSpec {
  lang?: string;
  name?: string;
  email?: string;
  llm?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    llamaEndpoint?: string;
  };
  okfStorage?: {
    type?: string;
    githubToken?: string;
    gitUrl?: string;
    repoOwner?: string;
    repoName?: string;
    branch?: string;
  };
  blobStorage?: {
    type?: string;
    accessKey?: string;
    secretKey?: string;
    region?: string;
    endpoint?: string;
    bucket?: string;
  };
  interests?: string[];
}

/**
 * Compact compressed configuration structure optimized for QR code encoding.
 */
export interface CompressedConfigSpec {
  lg?: string;
  nm?: string;
  em?: string;
  ai?: {
    pr?: string;
    md?: string;
    ak?: string;
    le?: string;
  };
  ok?: {
    ty?: string;
    tk?: string;
    ur?: string;
  };
  bl?: {
    type?: string;
    ak?: string;
    sk?: string;
    rg?: string;
    ep?: string;
    bk?: string;
  };
  in?: string[];
}

/**
 * Compresses a user configuration object into a compact key format for QR code generation.
 *
 * @param config - The full user configuration object.
 * @returns A compact object with shortened key names, or null if config is falsy.
 */
export function compressConfig(config?: UserConfigSpec | null): CompressedConfigSpec | null {
  if (!config) return null;
  return {
    lg: config.lang,
    nm: config.name,
    em: config.email,
    ai: config.llm
      ? {
          pr: config.llm.provider,
          md: config.llm.model,
          ak: config.llm.apiKey,
          le: config.llm.llamaEndpoint,
        }
      : undefined,
    ok: config.okfStorage
      ? {
          ty: config.okfStorage.type,
          tk: config.okfStorage.githubToken,
          ur: config.okfStorage.gitUrl
            ? config.okfStorage.gitUrl.replace(/^(https?:\/\/github\.com\/|git@github\.com:)/i, '')
            : '',
        }
      : undefined,
    bl: config.blobStorage
      ? {
          type: config.blobStorage.type,
          ak: config.blobStorage.accessKey,
          sk: config.blobStorage.secretKey,
          rg: config.blobStorage.region,
          ep: config.blobStorage.endpoint,
          bk: config.blobStorage.bucket,
        }
      : undefined,
    in: config.interests,
  };
}

/**
 * Decompresses a compact configuration object back into a full UserConfigSpec.
 *
 * @param compressed - The compact configuration object or an uncompressed config object.
 * @returns The restored UserConfigSpec object, or null if input is falsy.
 */
export function decompressConfig(compressed?: any | null): UserConfigSpec | null {
  if (!compressed) return null;
  if (compressed.lang || compressed.name || compressed.okfStorage || compressed.blobStorage) {
    return compressed;
  }
  let gitUrl = compressed.ok?.ur || '';
  if (gitUrl && !gitUrl.includes('://')) {
    gitUrl = 'https://github.com/' + gitUrl;
  }
  return {
    lang: compressed.lg,
    name: compressed.nm,
    email: compressed.em,
    llm: compressed.ai
      ? {
          provider:
            compressed.ai.pr ||
            (compressed.ai.md?.includes('gemma') || compressed.ai.md?.includes('llama') ? 'llama' : 'gemini'),
          model: compressed.ai.md,
          apiKey: compressed.ai.ak,
          llamaEndpoint: compressed.ai.le || 'http://10.0.2.2:8080/v1',
        }
      : undefined,
    okfStorage: compressed.ok
      ? {
          type: compressed.ok.ty,
          githubToken: compressed.ok.tk,
          gitUrl: gitUrl,
        }
      : undefined,
    blobStorage: compressed.bl
      ? {
          type: compressed.bl.type || compressed.bl.ty,
          accessKey: compressed.bl.ak,
          secretKey: compressed.bl.sk,
          region: compressed.bl.rg,
          endpoint: compressed.bl.ep,
          bucket: compressed.bl.bk,
        }
      : undefined,
    interests: compressed.in,
  };
}
