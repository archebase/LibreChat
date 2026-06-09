import { act, renderHook } from '@testing-library/react';
import useFeishuDocImport from './useFeishuDocImport';

const mockMutateAsync = jest.fn();
const mockShowToast = jest.fn();
let mockStartupConfig: { feishuDocImportEnabled?: boolean } | undefined;

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({
    showToast: mockShowToast,
  }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
  useImportFeishuDocsMutation: () => ({
    mutateAsync: mockMutateAsync,
    isLoading: false,
  }),
}));

jest.mock('~/hooks/useLocalize', () => ({
  __esModule: true,
  default: () => (key: string) => key,
}));

describe('useFeishuDocImport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStartupConfig = { feishuDocImportEnabled: true };
    mockMutateAsync.mockResolvedValue({
      files: [],
      skipped: [],
    });
  });

  test('does nothing when Feishu document import is disabled', async () => {
    mockStartupConfig = { feishuDocImportEnabled: false };
    const { result } = renderHook(() => useFeishuDocImport());

    await expect(
      result.current.importFeishuDocsForMessage(
        'https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG',
      ),
    ).resolves.toEqual([]);

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  test('does nothing when the message has no supported Feishu URLs', async () => {
    const { result } = renderHook(() => useFeishuDocImport());

    await expect(result.current.importFeishuDocsForMessage('hello')).resolves.toEqual([]);

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  test('imports supported Feishu URLs and returns message file refs', async () => {
    mockMutateAsync.mockResolvedValue({
      files: [
        {
          file_id: 'file-1',
          filepath: 'feishu://wiki/QcXRwepEGiApKykeshKc0T5KnGG',
          type: 'text/markdown',
          height: 10,
          width: 20,
        },
      ],
      skipped: [],
    });
    const { result } = renderHook(() => useFeishuDocImport());

    let files;
    await act(async () => {
      files = await result.current.importFeishuDocsForMessage(
        'read https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG',
      );
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      urls: ['https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG'],
    });
    expect(files).toEqual([
      {
        file_id: 'file-1',
        filepath: 'feishu://wiki/QcXRwepEGiApKykeshKc0T5KnGG',
        type: 'text/markdown',
        height: 10,
        width: 20,
      },
    ]);
  });

  test('surfaces import failures and does not swallow the error', async () => {
    const error = new Error('permission denied');
    mockMutateAsync.mockRejectedValue(error);
    const { result } = renderHook(() => useFeishuDocImport());

    await expect(
      result.current.importFeishuDocsForMessage(
        'https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG',
      ),
    ).rejects.toThrow('permission denied');

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
      }),
    );
  });
});
