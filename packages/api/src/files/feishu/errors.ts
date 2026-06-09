export type FeishuImportErrorCode =
  | 'FEISHU_IMPORT_DISABLED'
  | 'FEISHU_AUTH_UNAVAILABLE'
  | 'FEISHU_TOKEN_UNAVAILABLE'
  | 'FEISHU_OBO_FAILED'
  | 'FEISHU_PERMISSION_DENIED'
  | 'FEISHU_UNSUPPORTED_RESOURCE'
  | 'FEISHU_CONTENT_TOO_LARGE'
  | 'FEISHU_FETCH_FAILED';

export class FeishuImportError extends Error {
  code: FeishuImportErrorCode;

  statusCode: number;

  constructor(code: FeishuImportErrorCode, message: string, statusCode = 500) {
    super(message);
    this.name = 'FeishuImportError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
