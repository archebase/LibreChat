const express = require('express');
const request = require('supertest');

const mockImportFeishuDocs = jest.fn();
const mockCreateFile = jest.fn();
const mockExchangeOboToken = jest.fn();
const mockGetRetentionExpiry = jest.fn();

jest.mock('@librechat/api', () => ({
  importFeishuDocs: (...args) => mockImportFeishuDocs(...args),
}));

jest.mock('~/models', () => ({
  createFile: (...args) => mockCreateFile(...args),
}));

jest.mock('~/server/services/OboTokenService', () => ({
  exchangeOboToken: (...args) => mockExchangeOboToken(...args),
}));

jest.mock('~/server/services/Files/retention', () => ({
  getRetentionExpiry: (...args) => mockGetRetentionExpiry(...args),
}));

jest.mock('~/server/middleware', () => {
  const pass = (req, res, next) => next();
  return {
    configMiddleware: pass,
    checkBan: pass,
    uaParser: pass,
    requireJwtAuth: (req, res, next) => {
      if (req.headers.authorization !== 'Bearer ok') {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      req.user = {
        id: 'user-1',
        provider: 'openid',
        openidId: 'oidc-subject',
        tenantId: 'tenant-1',
        federatedTokens: {
          access_token: 'archegate-token',
        },
      };
      return next();
    },
  };
});

describe('Feishu routes', () => {
  let app;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      FEISHU_DOC_IMPORT_ENABLED: 'true',
      FEISHU_DOC_OBO_SCOPE: 'Feishu.Docs.Read',
      FEISHU_DOC_API_BASE_URL: 'https://open.feishu.cn',
      FEISHU_DOC_ALLOWED_HOSTS: 'feishu.cn,larksuite.com',
      FEISHU_DOC_IMPORT_MAX_BYTES: '1048576',
    };
    mockGetRetentionExpiry.mockResolvedValue({ expiredAt: new Date('2026-06-10T00:00:00.000Z') });
    mockImportFeishuDocs.mockResolvedValue({ files: [], skipped: [] });

    const feishuRouter = require('./feishu');
    app = express();
    app.use(express.json());
    app.use('/api/feishu', feishuRouter);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  test('requires authentication', async () => {
    await request(app)
      .post('/api/feishu/docs/import')
      .send({ urls: ['https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG'] })
      .expect(401);

    expect(mockImportFeishuDocs).not.toHaveBeenCalled();
  });

  test('passes import config and dependencies to the Feishu import service', async () => {
    const response = await request(app)
      .post('/api/feishu/docs/import')
      .set('Authorization', 'Bearer ok')
      .send({ urls: ['https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG'] })
      .expect(200);

    expect(response.body).toEqual({ files: [], skipped: [] });
    expect(mockImportFeishuDocs).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: ['https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG'],
        user: expect.objectContaining({ id: 'user-1', provider: 'openid' }),
        config: {
          enabled: true,
          oboScope: 'Feishu.Docs.Read',
          apiBaseUrl: 'https://open.feishu.cn',
          allowedHostSuffixes: ['feishu.cn', 'larksuite.com'],
          maxBytes: 1048576,
        },
        deps: expect.objectContaining({
          createFile: expect.any(Function),
          exchangeOboToken: expect.any(Function),
          getRetentionExpiry: expect.any(Function),
        }),
      }),
    );
  });

  test('maps Feishu import errors to stable HTTP responses', async () => {
    mockImportFeishuDocs.mockRejectedValue({
      code: 'FEISHU_PERMISSION_DENIED',
      statusCode: 403,
      message: 'permission denied',
    });

    const response = await request(app)
      .post('/api/feishu/docs/import')
      .set('Authorization', 'Bearer ok')
      .send({ urls: ['https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG'] })
      .expect(403);

    expect(response.body).toEqual({
      code: 'FEISHU_PERMISSION_DENIED',
      message: 'permission denied',
    });
  });

  test('rejects missing url arrays before calling the import service', async () => {
    const response = await request(app)
      .post('/api/feishu/docs/import')
      .set('Authorization', 'Bearer ok')
      .send({ urls: [] })
      .expect(400);

    expect(response.body).toEqual({
      code: 'FEISHU_INVALID_REQUEST',
      message: 'A non-empty urls array is required',
    });
    expect(mockImportFeishuDocs).not.toHaveBeenCalled();
  });
});
