import { v4 } from 'uuid';
import {
  FileContext,
  FileSources,
  extractFeishuDocUrls,
  megabyte,
} from 'librechat-data-provider';
import type { FeishuDocImportResponse, TFile } from 'librechat-data-provider';
import { createFeishuClient } from './client';
import { FeishuImportError } from './errors';

export type FeishuImportUser = {
  id: string;
  provider?: string;
  openidId?: string;
  tenantId?: string;
  federatedTokens?: {
    access_token?: string;
  };
};

export type FeishuImportConfig = {
  enabled: boolean;
  oboScope: string;
  apiBaseUrl: string;
  allowedHostSuffixes?: string[];
  maxBytes?: number;
};

export type FeishuCreateFileInput = Omit<TFile, '_id' | '__v' | 'createdAt' | 'updatedAt'> & {
  expiredAt?: Date;
};

export type FeishuImportDeps = {
  createFile: (file: FeishuCreateFileInput, save?: boolean) => Promise<TFile>;
  exchangeOboToken: (
    user: FeishuImportUser,
    accessToken: string,
    scope: string,
  ) => Promise<{ access_token?: string }>;
  getRetentionExpiry?: () => Promise<{ expiresAt?: Date; expiredAt?: Date }>;
  fetchImpl?: typeof fetch;
};

export type FeishuImportParams = {
  urls: string[];
  user: FeishuImportUser;
  config: FeishuImportConfig;
  deps: FeishuImportDeps;
};

const DEFAULT_MAX_BYTES = 15 * megabyte;

function sanitizeTitle(value: string): string {
  const sanitized = value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || 'Feishu document';
}

function buildMarkdown(title: string, content: string): string {
  return `# ${title}\n\n${content.trim()}`;
}

async function exchangeFeishuToken({
  user,
  accessToken,
  scope,
  deps,
}: {
  user: FeishuImportUser;
  accessToken: string;
  scope: string;
  deps: FeishuImportDeps;
}): Promise<string> {
  try {
    const tokenResponse = await deps.exchangeOboToken(user, accessToken, scope);
    if (!tokenResponse.access_token) {
      throw new FeishuImportError(
        'FEISHU_OBO_FAILED',
        'ArcheGate OBO exchange returned no Feishu access token',
        502,
      );
    }
    return tokenResponse.access_token;
  } catch (error) {
    if (error instanceof FeishuImportError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'ArcheGate OBO exchange failed';
    throw new FeishuImportError('FEISHU_OBO_FAILED', message, 502);
  }
}

function validateImportParams({ user, config }: Pick<FeishuImportParams, 'user' | 'config'>) {
  if (!config.enabled) {
    throw new FeishuImportError('FEISHU_IMPORT_DISABLED', 'Feishu document import is disabled', 403);
  }

  if (user.provider !== 'openid' || !user.openidId) {
    throw new FeishuImportError(
      'FEISHU_AUTH_UNAVAILABLE',
      'Feishu document import requires OpenID authentication',
      403,
    );
  }

  if (!user.federatedTokens?.access_token) {
    throw new FeishuImportError(
      'FEISHU_TOKEN_UNAVAILABLE',
      'No reusable ArcheGate access token is available for Feishu import',
      401,
    );
  }

  if (!config.oboScope || !config.apiBaseUrl) {
    throw new FeishuImportError(
      'FEISHU_FETCH_FAILED',
      'Feishu document import is missing required server configuration',
      500,
    );
  }
}

export async function importFeishuDocs({
  urls,
  user,
  config,
  deps,
}: FeishuImportParams): Promise<FeishuDocImportResponse> {
  validateImportParams({ user, config });

  const links = extractFeishuDocUrls(urls.join('\n'), {
    allowedHostSuffixes: config.allowedHostSuffixes,
  });
  if (links.length === 0) {
    return {
      files: [],
      skipped: urls.map((url) => ({ url, reason: 'unsupported_resource' })),
    };
  }

  const feishuToken = await exchangeFeishuToken({
    user,
    accessToken: user.federatedTokens?.access_token ?? '',
    scope: config.oboScope,
    deps,
  });
  const client = createFeishuClient({
    apiBaseUrl: config.apiBaseUrl,
    accessToken: feishuToken,
    fetchImpl: deps.fetchImpl,
  });

  const files: TFile[] = [];
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
  const retentionExpiry = (await deps.getRetentionExpiry?.()) ?? {};

  for (const link of links) {
    const wikiNode = link.type === 'wiki' ? await client.resolveWikiNode(link.token) : undefined;
    const documentToken = wikiNode?.objToken ?? link.token;
    const rawContent = await client.fetchDocxRawContent(documentToken);
    const title = sanitizeTitle(wikiNode?.title ?? rawContent.title ?? `Feishu document ${documentToken}`);
    const text = buildMarkdown(title, rawContent.content);
    const bytes = Buffer.byteLength(text, 'utf8');

    if (bytes > maxBytes) {
      throw new FeishuImportError(
        'FEISHU_CONTENT_TOO_LARGE',
        `Imported Feishu document exceeds the ${Math.ceil(maxBytes / megabyte)}MB storage limit`,
        413,
      );
    }

    const file = await deps.createFile(
      {
        user: user.id,
        file_id: v4(),
        bytes,
        filepath: `feishu://${link.type}/${link.token}`,
        filename: `${title}.md`,
        source: FileSources.text,
        type: 'text/markdown',
        context: FileContext.message_attachment,
        tenantId: user.tenantId,
        text,
        textFormat: 'text',
        embedded: false,
        object: 'file',
        usage: 0,
        ...retentionExpiry,
      },
      true,
    );

    files.push(file);
  }

  return {
    files,
    skipped: [],
  };
}
