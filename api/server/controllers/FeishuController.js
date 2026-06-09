const { importFeishuDocs } = require('@librechat/api');
const { parseFeishuAllowedHosts } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { createFile } = require('~/models');
const { exchangeOboToken } = require('~/server/services/OboTokenService');
const { getRetentionExpiry } = require('~/server/services/Files/retention');

const isEnabled = (value) => value === true || String(value).toLowerCase() === 'true';

function parseMaxBytes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeUser(user) {
  return {
    ...user,
    id: user?.id ?? user?._id?.toString?.(),
  };
}

async function importFeishuDocsController(req, res) {
  const urls = req.body?.urls;
  if (!Array.isArray(urls) || urls.length === 0 || urls.some((url) => typeof url !== 'string')) {
    return res.status(400).json({
      code: 'FEISHU_INVALID_REQUEST',
      message: 'A non-empty urls array is required',
    });
  }

  try {
    const result = await importFeishuDocs({
      urls,
      user: normalizeUser(req.user),
      config: {
        enabled: isEnabled(process.env.FEISHU_DOC_IMPORT_ENABLED),
        oboScope: process.env.FEISHU_DOC_OBO_SCOPE ?? '',
        apiBaseUrl: process.env.FEISHU_DOC_API_BASE_URL ?? '',
        allowedHostSuffixes: parseFeishuAllowedHosts(process.env.FEISHU_DOC_ALLOWED_HOSTS),
        maxBytes: parseMaxBytes(process.env.FEISHU_DOC_IMPORT_MAX_BYTES),
      },
      deps: {
        createFile,
        exchangeOboToken,
        getRetentionExpiry: () => getRetentionExpiry(req),
      },
    });

    return res.status(200).json(result);
  } catch (error) {
    const code = error?.code ?? 'FEISHU_IMPORT_FAILED';
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    const message = error?.message ?? 'Failed to import Feishu document';

    if (statusCode >= 500) {
      logger.error('[importFeishuDocsController] Failed to import Feishu document:', error);
    }

    return res.status(statusCode).json({
      code,
      message,
    });
  }
}

module.exports = {
  importFeishuDocsController,
};
