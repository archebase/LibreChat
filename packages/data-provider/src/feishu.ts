export type FeishuDocType = 'docx' | 'wiki';

export type FeishuDocUrl = {
  url: string;
  host: string;
  type: FeishuDocType;
  token: string;
};

export type FeishuDocUrlOptions = {
  allowedHostSuffixes?: string[];
};

const DEFAULT_ALLOWED_HOST_SUFFIXES = ['feishu.cn', 'larksuite.com'];
const URL_PATTERN = /https:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[),.;!?，。；！？）]+$/;

export function parseFeishuAllowedHosts(value?: string): string[] {
  if (!value) {
    return [...DEFAULT_ALLOWED_HOST_SUFFIXES];
  }

  return value
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
}

function normalizeAllowedHosts(options?: FeishuDocUrlOptions): string[] {
  const hosts = options?.allowedHostSuffixes?.length
    ? options.allowedHostSuffixes
    : DEFAULT_ALLOWED_HOST_SUFFIXES;

  return hosts.map((host) => host.trim().toLowerCase()).filter((host) => host.length > 0);
}

function hostMatches(host: string, allowedHostSuffixes: string[]): boolean {
  return allowedHostSuffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function trimUrlCandidate(candidate: string): string {
  return candidate.replace(TRAILING_PUNCTUATION, '');
}

function parseFeishuDocUrl(url: string, options?: FeishuDocUrlOptions): FeishuDocUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(trimUrlCandidate(url));
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!hostMatches(host, normalizeAllowedHosts(options))) {
    return null;
  }

  const [, type, token] = parsed.pathname.split('/');
  if ((type !== 'docx' && type !== 'wiki') || !token) {
    return null;
  }

  return {
    url: parsed.href,
    host,
    type,
    token,
  };
}

export function extractFeishuDocUrls(
  text: string,
  options?: FeishuDocUrlOptions,
): FeishuDocUrl[] {
  const matches = text.match(URL_PATTERN) ?? [];
  const seen = new Set<string>();
  const links: FeishuDocUrl[] = [];

  for (const match of matches) {
    const parsed = parseFeishuDocUrl(match, options);
    if (!parsed) {
      continue;
    }

    const key = `${parsed.type}:${parsed.token}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push(parsed);
  }

  return links;
}

export function isSupportedFeishuDocUrl(url: string, options?: FeishuDocUrlOptions): boolean {
  return parseFeishuDocUrl(url, options) != null;
}
