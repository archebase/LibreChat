# Feishu Doc URL Import Design

Date: 2026-06-09

## Goal

Users can paste a Feishu cloud document URL directly into a chat message. LibreChat detects supported Feishu document links, imports the document content through the user's ArcheGate-authenticated session, and sends the model the document text as normal file context.

The first version intentionally has no popup, picker, search UI, or separate Feishu login. The user experience is "paste the document link and send."

## Scope

In scope:

- Detect Feishu `docx` and `wiki` URLs in message text before the message is sent.
- Import matching documents through a backend API using the current user's OpenID/ArcheGate session.
- Exchange the user's federated OpenID access token through the existing OBO flow.
- Read the Feishu document as user-authorized content.
- Save imported content as an existing LibreChat text file record with `FileSources.text`.
- Attach the imported file to the outgoing message so existing `extractFileContext` behavior injects the content.
- Surface clear user-facing errors for unsupported URL types, missing auth, permission denial, token exchange failure, and oversized content.

Out of scope for the first version:

- Feishu document picker/search UI.
- Manual import popup.
- Direct browser-side Feishu API access.
- Bot-token or `lark-cli` based runtime access.
- Editing Feishu documents.
- Reading sheets, bitables, slides, comments, media, or embedded child resources.
- Model tool calls that read Feishu documents on demand after a message has started.

## Authentication

Feishu document access must go through ArcheGate/OBO. Runtime code must not rely on `lark-cli`, app secrets, a separate Feishu OAuth flow, or a token copied into the browser.

The backend accepts imports only when:

- The user is authenticated via OpenID.
- `OPENID_REUSE_TOKENS=true`.
- `req.user.federatedTokens.access_token` exists.
- Feishu document import is enabled by server config.

The backend uses the existing `OboTokenService.exchangeOboToken()` pattern:

1. Use the user's federated OpenID access token as the assertion.
2. Request the configured Feishu document scope/audience from ArcheGate.
3. Cache the exchanged token using the existing OBO cache behavior.
4. Use the exchanged token to call the configured Feishu document API base URL.

Config values:

- `FEISHU_DOC_IMPORT_ENABLED`: enables URL import.
- `FEISHU_DOC_OBO_SCOPE`: scope/audience requested from ArcheGate for Feishu document access.
- `FEISHU_DOC_API_BASE_URL`: Feishu OpenAPI or ArcheGate proxy base URL.
- `FEISHU_DOC_ALLOWED_HOSTS`: comma-separated document URL host suffixes, defaulting to `feishu.cn,larksuite.com`.
- `FEISHU_DOC_IMPORT_MAX_BYTES`: maximum extracted text bytes, default aligned with the existing 15 MB text storage limit.

## Architecture

### Frontend

Add a lightweight "URL pre-import" step to the chat send flow:

- Scan the outgoing message text for supported Feishu document URLs.
- If no supported URL exists, keep the current send path unchanged.
- If supported URLs exist, call a backend import endpoint before sending.
- Add returned file records to the same attachment collection used by normal uploads.
- Continue sending the message with those file IDs.

The attachment UI can show the imported document as a normal file chip. This keeps user feedback visible without adding a modal flow.

### Shared Data Provider

Add typed endpoint and data-service methods for Feishu imports:

- Request: explicit URL list plus the upload metadata needed to create message attachments.
- Response: imported LibreChat file records and any skipped URLs with reasons.

Endpoint constants and data-service wrappers belong in `packages/data-provider` so frontend and backend stay aligned.

### Backend

Keep new backend logic in `packages/api` where possible, with a thin `/api` route wrapper:

- URL parser: extracts Feishu `docx` tokens and `wiki` node tokens from message text.
- Token service wrapper: validates OpenID reuse requirements and calls `exchangeOboToken`.
- Feishu document client: reads document title/body through the configured API base URL.
- Import service: normalizes content to markdown/plain text and creates a `FileSources.text` file record.
- Route handler: validates input, enforces auth, calls the import service, and returns created files.

The legacy `api` layer should only register the route, pass request context, and send HTTP responses.

## URL Handling

Supported:

- `https://*.feishu.cn/docx/<token>`
- `https://*.larksuite.com/docx/<token>`
- `https://*.feishu.cn/wiki/<node_token>`
- `https://*.larksuite.com/wiki/<node_token>`
- Equivalent host suffixes listed in `FEISHU_DOC_ALLOWED_HOSTS`.

Example supported URL:

- `https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG`

Unsupported URLs are ignored unless the message contains only unsupported Feishu links, in which case the frontend should show a clear unsupported-resource error.

Wiki links are resolved to their backing document object before fetching content. If a wiki node points to a non-docx resource, the import fails for that URL with an unsupported-resource message.

## Data Flow

1. User pastes a Feishu document URL into the message box and sends.
2. Frontend scans message text and finds supported Feishu URLs.
3. Frontend calls `POST /api/feishu/docs/import` with the URLs and upload metadata.
4. Backend checks feature flags and OpenID/OBO prerequisites.
5. Backend exchanges the user's ArcheGate token for the configured Feishu document token.
6. Backend reads the Feishu document title and textual content.
7. Backend creates a LibreChat file record:
   - `source: FileSources.text`
   - `context: FileContext.message_attachment`
   - `filename: <document title>.md`
   - `type: text/markdown`
   - `text: <normalized document content>`
   - `bytes: Buffer.byteLength(text, 'utf8')`
   - `user` and `tenantId` from the request user
8. Frontend adds the returned file to the outgoing message attachment set.
9. Existing message processing calls `extractFileContext`, which injects the imported document text into the model context.

## Error Handling

Backend errors should be specific and map to stable client messages:

- Feature disabled: Feishu document import is not enabled.
- Auth unavailable: OpenID token reuse is not enabled or the user is not an OpenID user.
- Token unavailable: the current session has no reusable ArcheGate access token.
- OBO failure: ArcheGate token exchange failed.
- Permission denied: the user cannot access the Feishu document.
- Unsupported resource: the URL is not a supported Feishu docx/wiki document.
- Content too large: extracted text exceeds the configured storage limit.
- Fetch failure: Feishu API returned an unexpected response or temporary error.

The send flow should fail before the model request starts if a detected supported Feishu URL cannot be imported. This avoids silently answering without the document.

## Security And Privacy

- Feishu access tokens stay server-side.
- The imported file is owned by the current LibreChat user and tenant.
- Document content is stored only as the existing text attachment format already used for OCR/document parsing.
- Logs must not include access tokens or full document content.
- URL parsing must avoid SSRF-style arbitrary fetches by calling only configured Feishu API hosts, never the pasted URL directly.

## Testing

Backend tests:

- Parses supported `docx` and `wiki` URLs from mixed message text.
- Ignores duplicate URLs in a single message.
- Rejects unsupported Feishu resource types.
- Requires OpenID user, `OPENID_REUSE_TOKENS`, and federated access token.
- Calls `exchangeOboToken` with the configured Feishu scope.
- Maps permission, token, unsupported resource, and oversized-content errors.
- Creates `FileSources.text` records with expected owner, tenant, filename, type, context, text, and byte count.

Frontend tests:

- Message without Feishu URLs sends unchanged.
- Message with supported Feishu URLs calls import before send.
- Imported files are added to the outgoing attachment set.
- Import failure blocks send and shows a clear error.
- Feature flag disabled keeps the send flow unchanged.

## Rollout

The feature is off by default. Enable it only after ArcheGate can mint the configured Feishu document token and the deployment has the correct Feishu API base URL.

This design keeps the first PR small enough to merge into the ArcheBase fork quickly while leaving room for later picker/search support if users need it.
