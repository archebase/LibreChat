# Feishu Doc URL Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users paste a Feishu `docx` or `wiki` URL into a chat message and LibreChat imports the document text before sending the message.

**Architecture:** Share URL parsing in `librechat-data-provider`, keep Feishu API and import logic in `packages/api`, and expose a thin authenticated `/api/feishu/docs/import` route from the legacy `api` server. The frontend detects supported URLs in `useSubmitMessage`, calls the import endpoint, and passes returned file references via `ask(..., { overrideFiles })`.

**Tech Stack:** TypeScript, React hooks, React Query mutations, Express, Jest, existing OpenID OBO token exchange, Feishu OpenAPI-compatible HTTP calls.

---

## File Map

- Create `packages/data-provider/src/feishu.ts`: shared URL parser and allowed-host helpers.
- Test `packages/data-provider/src/feishu.spec.ts`: parser coverage for docx, wiki, unsupported types, host filtering, duplicates.
- Modify `packages/data-provider/src/index.ts`: export shared Feishu helpers.
- Modify `packages/data-provider/src/types/queries.ts`: add Feishu import request/response types.
- Modify `packages/data-provider/src/api-endpoints.ts`: add `feishuDocImport()`.
- Modify `packages/data-provider/src/data-service.ts`: add `importFeishuDocs()`.
- Create `packages/api/src/files/feishu/errors.ts`: stable import error codes and HTTP status mapping inputs.
- Create `packages/api/src/files/feishu/client.ts`: Feishu API client for wiki node resolution and docx raw content fetch.
- Create `packages/api/src/files/feishu/import.ts`: OBO validation, content normalization, max-byte check, file record creation.
- Create `packages/api/src/files/feishu/index.ts`: exports.
- Test `packages/api/src/files/feishu/client.spec.ts` and `packages/api/src/files/feishu/import.spec.ts`.
- Modify `packages/api/src/files/index.ts`: export Feishu import service.
- Create `api/server/controllers/FeishuController.js`: thin controller wiring request deps into `@librechat/api`.
- Create `api/server/routes/feishu.js`: authenticated import route.
- Test `api/server/routes/feishu.spec.js`: route auth/config/error mapping.
- Modify `api/server/routes/index.js`, `api/server/index.js`, and `api/server/experimental.js`: register route.
- Modify `api/server/routes/config.js`: expose `feishuDocImportEnabled`.
- Modify `packages/data-provider/src/config.ts`: add startup config field.
- Create `client/src/data-provider/Feishu/mutations.ts` and `client/src/data-provider/Feishu/index.ts`: React Query mutation wrapper.
- Modify `client/src/data-provider/index.ts`: export Feishu hooks.
- Create `client/src/hooks/Messages/useFeishuDocImport.ts`: pre-send import hook.
- Test `client/src/hooks/Messages/useFeishuDocImport.spec.tsx`: disabled/no URL/import success/import failure behavior.
- Modify `client/src/hooks/Messages/useSubmitMessage.ts`: call pre-import before `ask`.
- Test `client/src/hooks/Messages/useSubmitMessage.spec.tsx`: import results passed as `overrideFiles`, failed import blocks send.
- Modify `client/src/locales/en/translation.json`: add Feishu import error/toast strings.

## Task 1: Shared Feishu URL Parser

**Files:**
- Create: `packages/data-provider/src/feishu.ts`
- Create: `packages/data-provider/src/feishu.spec.ts`
- Modify: `packages/data-provider/src/index.ts`

- [ ] **Step 1: Write failing parser tests**

Cover these exact behaviors:

```ts
import {
  extractFeishuDocUrls,
  isSupportedFeishuDocUrl,
  parseFeishuAllowedHosts,
} from './feishu';

describe('Feishu document URL parsing', () => {
  test('extracts the ArcheBase wiki URL shape', () => {
    expect(
      extractFeishuDocUrls(
        'read https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG please',
      ),
    ).toEqual([
      {
        url: 'https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG',
        host: 'archebase.feishu.cn',
        type: 'wiki',
        token: 'QcXRwepEGiApKykeshKc0T5KnGG',
      },
    ]);
  });

  test('deduplicates equivalent document links', () => {
    const text =
      'https://archebase.feishu.cn/docx/AbCd123?from=chat https://archebase.feishu.cn/docx/AbCd123';
    expect(extractFeishuDocUrls(text)).toHaveLength(1);
  });

  test('rejects unsupported Feishu resource paths', () => {
    expect(isSupportedFeishuDocUrl('https://archebase.feishu.cn/sheets/abc')).toBe(false);
  });

  test('honors configured host suffixes', () => {
    expect(
      extractFeishuDocUrls('https://docs.example.com/wiki/Wiki123', {
        allowedHostSuffixes: ['example.com'],
      }),
    ).toHaveLength(1);
  });

  test('normalizes comma-separated allowed host config', () => {
    expect(parseFeishuAllowedHosts(' feishu.cn, larksuite.com ,,')).toEqual([
      'feishu.cn',
      'larksuite.com',
    ]);
  });
});
```

Run: `cd packages/data-provider && npx jest src/feishu.spec.ts --runInBand`
Expected: FAIL because `./feishu` does not exist.

- [ ] **Step 2: Implement parser**

Implement:

```ts
export type FeishuDocType = 'docx' | 'wiki';

export type FeishuDocUrl = {
  url: string;
  host: string;
  type: FeishuDocType;
  token: string;
};

export function parseFeishuAllowedHosts(value?: string): string[];
export function extractFeishuDocUrls(text: string, options?: { allowedHostSuffixes?: string[] }): FeishuDocUrl[];
export function isSupportedFeishuDocUrl(url: string, options?: { allowedHostSuffixes?: string[] }): boolean;
```

Use `new URL()` for parsing, require `https`, accept default host suffixes `feishu.cn` and `larksuite.com`, accept only `/docx/<token>` and `/wiki/<token>`, trim trailing punctuation from URL matches, and dedupe by `${type}:${token}`.

- [ ] **Step 3: Export and verify**

Add `export * from './feishu';` to `packages/data-provider/src/index.ts`.

Run: `cd packages/data-provider && npx jest src/feishu.spec.ts --runInBand`
Expected: PASS.

Commit: `git add packages/data-provider/src/feishu.ts packages/data-provider/src/feishu.spec.ts packages/data-provider/src/index.ts && git commit -m "feat: parse feishu document urls"`

## Task 2: Data Provider API Contract

**Files:**
- Modify: `packages/data-provider/src/types/queries.ts`
- Modify: `packages/data-provider/src/api-endpoints.ts`
- Modify: `packages/data-provider/src/data-service.ts`
- Modify: `packages/data-provider/src/keys.ts`

- [ ] **Step 1: Add Feishu import types**

Add these types near the existing token query types:

```ts
export type FeishuDocImportRequest = {
  urls: string[];
};

export type FeishuDocImportSkipped = {
  url: string;
  reason: string;
};

export type FeishuDocImportResponse = {
  files: t.TFile[];
  skipped: FeishuDocImportSkipped[];
};
```

- [ ] **Step 2: Add endpoint and service wrapper**

Add endpoint:

```ts
export const feishuDocImport = () => `${BASE_URL}/api/feishu/docs/import`;
```

Add data service:

```ts
export function importFeishuDocs(
  data: q.FeishuDocImportRequest,
): Promise<q.FeishuDocImportResponse> {
  return request.post(endpoints.feishuDocImport(), data);
}
```

Add mutation key:

```ts
feishuDocImport = 'feishuDocImport',
```

- [ ] **Step 3: Build data-provider**

Run: `npm run build:data-provider`
Expected: build completes.

Commit: `git add packages/data-provider/src/types/queries.ts packages/data-provider/src/api-endpoints.ts packages/data-provider/src/data-service.ts packages/data-provider/src/keys.ts && git commit -m "feat: add feishu import data contract"`

## Task 3: Backend Feishu Client And Import Service

**Files:**
- Create: `packages/api/src/files/feishu/errors.ts`
- Create: `packages/api/src/files/feishu/client.ts`
- Create: `packages/api/src/files/feishu/import.ts`
- Create: `packages/api/src/files/feishu/index.ts`
- Create: `packages/api/src/files/feishu/client.spec.ts`
- Create: `packages/api/src/files/feishu/import.spec.ts`
- Modify: `packages/api/src/files/index.ts`

- [ ] **Step 1: Write failing client tests**

Cover:

- `fetchDocxRawContent` calls `/open-apis/docx/v1/documents/<token>/raw_content`.
- `resolveWikiNode` calls `/open-apis/wiki/v2/spaces/get_node?token=<token>`.
- non-zero Feishu `code` throws a permission/fetch error.
- wiki node whose `obj_type` is not `docx` throws unsupported resource.

Run: `cd packages/api && npx jest src/files/feishu/client.spec.ts --runInBand`
Expected: FAIL because files do not exist.

- [ ] **Step 2: Implement client and errors**

Create stable error codes:

```ts
export type FeishuImportErrorCode =
  | 'FEISHU_IMPORT_DISABLED'
  | 'FEISHU_AUTH_UNAVAILABLE'
  | 'FEISHU_TOKEN_UNAVAILABLE'
  | 'FEISHU_OBO_FAILED'
  | 'FEISHU_PERMISSION_DENIED'
  | 'FEISHU_UNSUPPORTED_RESOURCE'
  | 'FEISHU_CONTENT_TOO_LARGE'
  | 'FEISHU_FETCH_FAILED';
```

Implement `FeishuImportError extends Error`.

Implement client with injected `fetchImpl` and base URL normalization. Use `Authorization: Bearer ${accessToken}` and never fetch the pasted document URL directly.

- [ ] **Step 3: Write failing import service tests**

Cover:

- rejects when feature disabled.
- rejects non-OpenID user.
- rejects missing federated access token.
- calls `exchangeOboToken(user, accessToken, scope)`.
- creates `FileSources.text` and `FileContext.message_attachment` records.
- rejects text larger than configured max bytes.
- imports the ArcheBase wiki URL by resolving wiki token to docx token.

Run: `cd packages/api && npx jest src/files/feishu/import.spec.ts --runInBand`
Expected: FAIL because service does not exist.

- [ ] **Step 4: Implement import service**

Create:

```ts
export async function importFeishuDocs(params: FeishuImportParams): Promise<FeishuDocImportResponse>;
```

Dependencies:

```ts
type FeishuImportDeps = {
  createFile: (file: FeishuCreateFileInput, save?: boolean) => Promise<TFile>;
  exchangeOboToken: (user: FeishuUser, accessToken: string, scope: string) => Promise<{ access_token: string }>;
  getRetentionExpiry?: () => Promise<{ expiresAt?: Date; expiredAt?: Date }>;
  fetchImpl?: typeof fetch;
};
```

Use `extractFeishuDocUrls(urls.join('\n'), { allowedHostSuffixes })`, normalize content to markdown as:

```md
# <title>

<content>
```

Create file IDs with `uuid.v4()`, filename as sanitized title plus `.md`, filepath as `feishu://<type>/<token>`, type `text/markdown`, textFormat `text`, source `FileSources.text`, embedded `false`, usage `0`, and tenant/user from request.

- [ ] **Step 5: Export and verify**

Export from `packages/api/src/files/feishu/index.ts` and `packages/api/src/files/index.ts`.

Run:

```bash
cd packages/api && npx jest src/files/feishu/client.spec.ts src/files/feishu/import.spec.ts --runInBand
```

Expected: PASS.

Commit: `git add packages/api/src/files/feishu packages/api/src/files/index.ts && git commit -m "feat: import feishu docs as text files"`

## Task 4: Legacy API Route And Startup Config

**Files:**
- Create: `api/server/controllers/FeishuController.js`
- Create: `api/server/routes/feishu.js`
- Create: `api/server/routes/feishu.spec.js`
- Modify: `api/server/routes/index.js`
- Modify: `api/server/index.js`
- Modify: `api/server/experimental.js`
- Modify: `api/server/routes/config.js`
- Modify: `packages/data-provider/src/config.ts`

- [ ] **Step 1: Write failing route tests**

Cover:

- `POST /docs/import` requires JWT middleware user.
- disabled config returns 403.
- successful request returns `{ files, skipped }`.
- service error code maps to HTTP status and JSON `code`.

Run: `cd api && npx jest server/routes/feishu.spec.js --runInBand`
Expected: FAIL because route does not exist.

- [ ] **Step 2: Implement thin controller and route**

Controller calls `@librechat/api.importFeishuDocs` with:

- `req.body.urls`
- `req.user`
- `process.env.FEISHU_DOC_IMPORT_ENABLED`
- `process.env.FEISHU_DOC_OBO_SCOPE`
- `process.env.FEISHU_DOC_API_BASE_URL`
- `process.env.FEISHU_DOC_ALLOWED_HOSTS`
- `process.env.FEISHU_DOC_IMPORT_MAX_BYTES`
- `db.createFile`
- `exchangeOboToken`
- `getRetentionExpiry(req)`

Route applies `requireJwtAuth`, `configMiddleware`, `checkBan`, and `uaParser`, then `POST /docs/import`.

- [ ] **Step 3: Register route and config**

Add `feishu` to `api/server/routes/index.js`, mount before `/api` 404:

```js
app.use('/api/feishu', routes.feishu);
```

Expose `feishuDocImportEnabled` in startup config and type it in `TStartupConfig`.

- [ ] **Step 4: Verify route tests**

Run: `cd api && npx jest server/routes/feishu.spec.js server/routes/__tests__/config.spec.js --runInBand`
Expected: PASS.

Commit: `git add api/server/controllers/FeishuController.js api/server/routes/feishu.js api/server/routes/feishu.spec.js api/server/routes/index.js api/server/index.js api/server/experimental.js api/server/routes/config.js packages/data-provider/src/config.ts && git commit -m "feat: expose feishu doc import api"`

## Task 5: Frontend Pre-Send Import

**Files:**
- Create: `client/src/data-provider/Feishu/mutations.ts`
- Create: `client/src/data-provider/Feishu/index.ts`
- Create: `client/src/hooks/Messages/useFeishuDocImport.ts`
- Create: `client/src/hooks/Messages/useFeishuDocImport.spec.tsx`
- Create: `client/src/hooks/Messages/useSubmitMessage.spec.tsx`
- Modify: `client/src/data-provider/index.ts`
- Modify: `client/src/hooks/Messages/useSubmitMessage.ts`
- Modify: `client/src/locales/en/translation.json`

- [ ] **Step 1: Write failing hook tests**

Cover:

- disabled startup config returns no files and does not call mutation.
- no supported URL returns no files and does not call mutation.
- supported ArcheBase wiki URL calls mutation with only the URL list.
- returned files become `TMessage['files']` refs.
- mutation error throws a user-visible error.

Run: `cd client && npx jest src/hooks/Messages/useFeishuDocImport.spec.tsx --runInBand`
Expected: FAIL because hook does not exist.

- [ ] **Step 2: Implement data-provider mutation and hook**

Use `useMutation([MutationKeys.feishuDocImport], ...)` and `dataService.importFeishuDocs`.

Hook behavior:

```ts
const links = extractFeishuDocUrls(text);
if (!startupConfig?.feishuDocImportEnabled || links.length === 0) return [];
const response = await importMutation.mutateAsync({ urls: links.map((link) => link.url) });
return response.files.map((file) => ({
  file_id: file.file_id,
  filepath: file.filepath,
  type: file.type ?? '',
  height: file.height,
  width: file.width,
}));
```

Show info/success/error toast strings from English locale.

- [ ] **Step 3: Write failing submit tests**

Cover:

- submit without Feishu URLs calls `ask({ text })` normally.
- submit with imported files calls `ask({ text }, { overrideFiles })`.
- failed import does not call `ask` or `methods.reset`.

Run: `cd client && npx jest src/hooks/Messages/useSubmitMessage.spec.tsx --runInBand`
Expected: FAIL before `useSubmitMessage` integration.

- [ ] **Step 4: Integrate in `useSubmitMessage`**

Make `submitMessage` async, call `importFeishuDocsForMessage(data.text)` before `ask`, pass `overrideFiles` only when imported files exist, and reset the form after successful `ask`.

- [ ] **Step 5: Verify frontend tests**

Run:

```bash
cd client && npx jest src/hooks/Messages/useFeishuDocImport.spec.tsx src/hooks/Messages/useSubmitMessage.spec.tsx --runInBand
```

Expected: PASS.

Commit: `git add client/src/data-provider/Feishu client/src/data-provider/index.ts client/src/hooks/Messages/useFeishuDocImport.ts client/src/hooks/Messages/useFeishuDocImport.spec.tsx client/src/hooks/Messages/useSubmitMessage.ts client/src/hooks/Messages/useSubmitMessage.spec.tsx client/src/locales/en/translation.json && git commit -m "feat: import feishu links before send"`

## Task 6: Build And Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Build shared packages**

Run:

```bash
npm run build:data-provider
npm run build:api
```

Expected: both commands exit 0. Existing repository diagnostics may print, but no new Feishu-specific TypeScript failures should appear.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
cd packages/data-provider && npx jest src/feishu.spec.ts --runInBand
cd ../api && npx jest src/files/feishu/client.spec.ts src/files/feishu/import.spec.ts --runInBand
cd ../../api && npx jest server/routes/feishu.spec.js --runInBand
cd ../client && npx jest src/hooks/Messages/useFeishuDocImport.spec.tsx src/hooks/Messages/useSubmitMessage.spec.tsx --runInBand
```

Expected: all targeted tests pass.

- [ ] **Step 3: Inspect git state**

Run: `git status --short`

Expected: Feishu-related files are clean after commits; pre-existing unrelated dirty files may remain:

- `api/server/services/Files/Code/process.spec.js`
- `packages/api/src/agents/handlers.spec.ts`
- old untracked `docs/superpowers/plans/2026-06-05-custom-endpoint-memory-bridge.md`

- [ ] **Step 4: Push and create PR to fork**

Push branch `archebase` to remote `archebase`, then create a PR targeting the fork's `archebase` branch. Do not include unrelated dirty files in commits.
