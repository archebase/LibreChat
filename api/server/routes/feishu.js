const express = require('express');
const middleware = require('~/server/middleware');
const { importFeishuDocsController } = require('~/server/controllers/FeishuController');

const router = express.Router();

router.post(
  '/docs/import',
  middleware.requireJwtAuth,
  middleware.configMiddleware,
  middleware.checkBan,
  middleware.uaParser,
  importFeishuDocsController,
);

module.exports = router;
