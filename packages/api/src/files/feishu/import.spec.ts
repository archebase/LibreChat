import { FileContext, FileSources, megabyte } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import { FeishuImportError } from './errors';
import { importFeishuDocs } from './import';

const openIdUser = {
  id: 'user-1',
  provider: 'openid',
  openidId: 'oidc-subject',
  tenantId: 'tenant-1',
  federatedTokens: {
    access_token: 'archegate-token',
  },
};

const createResponse = (body: object): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function createBaseParams() {
  const createFile = jest.fn(async (file: Partial<TFile>) => ({
    object: 'file',
    usage: 0,
    embedded: false,
    ...file,
  })) as jest.MockedFunction<(file: Partial<TFile>, save?: boolean) => Promise<TFile>>;
  const exchangeOboToken = jest.fn(async () => ({
    access_token: 'feishu-user-token',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'Feishu.Docs.Read',
  }));
  const fetchImpl = jest.fn(async (url: string) => {
    if (url.includes('/wiki/v2/spaces/get_node')) {
      return createResponse({
        code: 0,
        data: {
          node: {
            obj_token: 'docxToken',
            obj_type: 'docx',
            title: 'Wiki title',
          },
        },
      });
    }

    return createResponse({
      code: 0,
      data: {
        content: 'Document body',
      },
    });
  });

  return {
    params: {
      urls: ['https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG'],
      user: openIdUser,
      config: {
        enabled: true,
        oboScope: 'Feishu.Docs.Read',
        apiBaseUrl: 'https://open.feishu.cn',
        allowedHostSuffixes: ['feishu.cn'],
        maxBytes: 15 * megabyte,
      },
      deps: {
        createFile,
        exchangeOboToken,
        fetchImpl,
        getRetentionExpiry: async () => ({ expiredAt: new Date('2026-06-10T00:00:00.000Z') }),
      },
    },
    createFile,
    exchangeOboToken,
    fetchImpl,
  };
}

describe('importFeishuDocs', () => {
  test('rejects when Feishu document import is disabled', async () => {
    const { params } = createBaseParams();

    await expect(
      importFeishuDocs({
        ...params,
        config: {
          ...params.config,
          enabled: false,
        },
      }),
    ).rejects.toMatchObject({
      code: 'FEISHU_IMPORT_DISABLED',
    } satisfies Partial<FeishuImportError>);
  });

  test('requires an OpenID user with reusable ArcheGate token', async () => {
    const { params } = createBaseParams();

    await expect(
      importFeishuDocs({
        ...params,
        user: {
          id: 'user-1',
          provider: 'local',
        },
      }),
    ).rejects.toMatchObject({
      code: 'FEISHU_AUTH_UNAVAILABLE',
    } satisfies Partial<FeishuImportError>);

    await expect(
      importFeishuDocs({
        ...params,
        user: {
          id: 'user-1',
          provider: 'openid',
          openidId: 'oidc-subject',
        },
      }),
    ).rejects.toMatchObject({
      code: 'FEISHU_TOKEN_UNAVAILABLE',
    } satisfies Partial<FeishuImportError>);
  });

  test('exchanges the ArcheGate token before reading Feishu content', async () => {
    const { params, exchangeOboToken } = createBaseParams();

    await importFeishuDocs(params);

    expect(exchangeOboToken).toHaveBeenCalledWith(
      openIdUser,
      'archegate-token',
      'Feishu.Docs.Read',
    );
  });

  test('imports the ArcheBase wiki URL as a LibreChat text attachment', async () => {
    const { params, createFile } = createBaseParams();

    const result = await importFeishuDocs(params);

    expect(result.skipped).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-1',
        tenantId: 'tenant-1',
        source: FileSources.text,
        context: FileContext.message_attachment,
        filename: 'Wiki title.md',
        filepath: 'feishu://wiki/QcXRwepEGiApKykeshKc0T5KnGG',
        type: 'text/markdown',
        text: '# Wiki title\n\nDocument body',
        textFormat: 'text',
        bytes: Buffer.byteLength('# Wiki title\n\nDocument body', 'utf8'),
        expiredAt: new Date('2026-06-10T00:00:00.000Z'),
      }),
      true,
    );
  });

  test('rejects content that exceeds the configured storage limit', async () => {
    const { params } = createBaseParams();

    await expect(
      importFeishuDocs({
        ...params,
        config: {
          ...params.config,
          maxBytes: 5,
        },
      }),
    ).rejects.toMatchObject({
      code: 'FEISHU_CONTENT_TOO_LARGE',
    } satisfies Partial<FeishuImportError>);
  });
});
