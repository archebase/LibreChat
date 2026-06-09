import { FeishuImportError } from './errors';
import { createFeishuClient } from './client';

const jsonResponse = (body: object, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('Feishu document client', () => {
  test('fetches docx raw content with a user access token', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ code: 0, data: { content: 'Document body', title: 'Doc title' } }),
    );
    const client = createFeishuClient({
      apiBaseUrl: 'https://open.feishu.cn',
      accessToken: 'user-token',
      fetchImpl,
    });

    await expect(client.fetchDocxRawContent('docToken')).resolves.toEqual({
      content: 'Document body',
      title: 'Doc title',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://open.feishu.cn/open-apis/docx/v1/documents/docToken/raw_content',
      {
        headers: {
          Authorization: 'Bearer user-token',
          Accept: 'application/json',
        },
      },
    );
  });

  test('resolves wiki node metadata by token', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        code: 0,
        data: {
          node: {
            obj_token: 'docxToken',
            obj_type: 'docx',
            title: 'Wiki title',
          },
        },
      }),
    );
    const client = createFeishuClient({
      apiBaseUrl: 'https://open.feishu.cn/',
      accessToken: 'user-token',
      fetchImpl,
    });

    await expect(client.resolveWikiNode('wikiToken')).resolves.toEqual({
      objToken: 'docxToken',
      objType: 'docx',
      title: 'Wiki title',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=wikiToken',
      {
        headers: {
          Authorization: 'Bearer user-token',
          Accept: 'application/json',
        },
      },
    );
  });

  test('maps Feishu permission errors to a stable import error', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ code: 99991663, msg: 'permission denied' }, 403),
    );
    const client = createFeishuClient({
      apiBaseUrl: 'https://open.feishu.cn',
      accessToken: 'user-token',
      fetchImpl,
    });

    await expect(client.fetchDocxRawContent('docToken')).rejects.toMatchObject({
      code: 'FEISHU_PERMISSION_DENIED',
    } satisfies Partial<FeishuImportError>);
  });

  test('rejects wiki nodes that do not point to docx documents', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        code: 0,
        data: {
          node: {
            obj_token: 'sheetToken',
            obj_type: 'sheet',
            title: 'Sheet title',
          },
        },
      }),
    );
    const client = createFeishuClient({
      apiBaseUrl: 'https://open.feishu.cn',
      accessToken: 'user-token',
      fetchImpl,
    });

    await expect(client.resolveWikiNode('wikiToken')).rejects.toMatchObject({
      code: 'FEISHU_UNSUPPORTED_RESOURCE',
    } satisfies Partial<FeishuImportError>);
  });
});
