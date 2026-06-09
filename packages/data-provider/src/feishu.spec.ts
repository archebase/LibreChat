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
