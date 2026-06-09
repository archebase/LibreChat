import { FeishuImportError } from './errors';

export type FeishuFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type FeishuClientOptions = {
  apiBaseUrl: string;
  accessToken: string;
  fetchImpl?: FeishuFetch;
};

export type FeishuDocxRawContent = {
  content: string;
  title?: string;
};

export type FeishuWikiNode = {
  objToken: string;
  objType: string;
  title?: string;
};

type FeishuNodePayload = {
  obj_token?: string;
  obj_type?: string;
  title?: string;
};

type FeishuApiData = {
  content?: string;
  title?: string;
  node?: FeishuNodePayload;
};

type FeishuApiEnvelope = {
  code?: number;
  msg?: string;
  data?: FeishuApiData;
};

function normalizeBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, '');
}

function apiUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function mapFetchFailure(status: number, message: string): FeishuImportError {
  if (status === 401 || status === 403) {
    return new FeishuImportError('FEISHU_PERMISSION_DENIED', message, 403);
  }

  return new FeishuImportError('FEISHU_FETCH_FAILED', message, 502);
}

async function parseFeishuResponse(response: Response): Promise<FeishuApiEnvelope> {
  let body: FeishuApiEnvelope;
  try {
    body = (await response.json()) as FeishuApiEnvelope;
  } catch {
    throw new FeishuImportError('FEISHU_FETCH_FAILED', 'Feishu returned a non-JSON response', 502);
  }

  if (!response.ok) {
    throw mapFetchFailure(response.status, body.msg ?? `Feishu request failed: ${response.status}`);
  }

  if (body.code != null && body.code !== 0) {
    throw mapFetchFailure(response.status, body.msg ?? `Feishu request failed: ${body.code}`);
  }

  return body;
}

export function createFeishuClient({
  apiBaseUrl,
  accessToken,
  fetchImpl = fetch,
}: FeishuClientOptions) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };

  const fetchDocxRawContent = async (documentToken: string): Promise<FeishuDocxRawContent> => {
    const response = await fetchImpl(
      apiUrl(
        apiBaseUrl,
        `/open-apis/docx/v1/documents/${encodeURIComponent(documentToken)}/raw_content`,
      ),
      { headers },
    );
    const body = await parseFeishuResponse(response);
    const content = body.data?.content;
    if (typeof content !== 'string') {
      throw new FeishuImportError(
        'FEISHU_FETCH_FAILED',
        'Feishu raw content response did not include text content',
        502,
      );
    }

    return {
      content,
      title: body.data?.title,
    };
  };

  const resolveWikiNode = async (nodeToken: string): Promise<FeishuWikiNode> => {
    const response = await fetchImpl(
      apiUrl(
        apiBaseUrl,
        `/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(nodeToken)}`,
      ),
      { headers },
    );
    const body = await parseFeishuResponse(response);
    const node = body.data?.node;
    if (!node?.obj_token || !node.obj_type) {
      throw new FeishuImportError(
        'FEISHU_FETCH_FAILED',
        'Feishu wiki node response did not include object metadata',
        502,
      );
    }

    if (node.obj_type !== 'docx') {
      throw new FeishuImportError(
        'FEISHU_UNSUPPORTED_RESOURCE',
        `Feishu wiki node points to unsupported resource type: ${node.obj_type}`,
        400,
      );
    }

    return {
      objToken: node.obj_token,
      objType: node.obj_type,
      title: node.title,
    };
  };

  return {
    fetchDocxRawContent,
    resolveWikiNode,
  };
}
