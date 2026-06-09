import { act, renderHook } from '@testing-library/react';
import useSubmitMessage from './useSubmitMessage';

const mockAsk = jest.fn();
const mockSetMessages = jest.fn();
const mockGetMessages = jest.fn();
const mockReset = jest.fn();
const mockGetValues = jest.fn();
const mockSetActivePrompt = jest.fn();
const mockImportFeishuDocsForMessage = jest.fn();

let mockAutoSendPrompts = false;
let mockLatestMessage: { messageId: string } | undefined;
let mockRootMessages: Array<{ messageId: string }> | undefined;
let mockAddedConvo: { conversationId: string } | undefined;

jest.mock('recoil', () => ({
  useRecoilValue: () => mockAutoSendPrompts,
  useSetRecoilState: () => mockSetActivePrompt,
}));

jest.mock('librechat-data-provider', () => ({
  replaceSpecialVars: jest.fn(({ text }: { text: string }) => text),
}));

jest.mock('~/Providers', () => ({
  useAddedChatContext: () => ({
    conversation: mockAddedConvo,
  }),
  useChatContext: () => ({
    ask: mockAsk,
    index: 0,
    getMessages: mockGetMessages,
    setMessages: mockSetMessages,
  }),
  useChatFormContext: () => ({
    reset: mockReset,
    getValues: mockGetValues,
  }),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'user-1' },
  }),
}));

jest.mock('~/hooks/Messages/useLatestMessage', () => ({
  useLatestMessage: () => mockLatestMessage,
}));

jest.mock('~/common', () => ({
  mainTextareaId: 'main-textarea',
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    autoSendPrompts: 'autoSendPrompts',
    activePromptByIndex: jest.fn(() => 'activePromptByIndex'),
  },
}));

jest.mock('./useFeishuDocImport', () => ({
  __esModule: true,
  default: () => ({
    importFeishuDocsForMessage: mockImportFeishuDocsForMessage,
    isImporting: false,
  }),
}));

describe('useSubmitMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAutoSendPrompts = false;
    mockLatestMessage = { messageId: 'latest-message' };
    mockRootMessages = [{ messageId: 'latest-message' }];
    mockAddedConvo = undefined;
    mockGetMessages.mockImplementation(() => mockRootMessages);
    mockGetValues.mockReturnValue('');
    mockImportFeishuDocsForMessage.mockResolvedValue([]);
  });

  test('submits normally when no Feishu documents are imported', async () => {
    const { result } = renderHook(() => useSubmitMessage());

    await act(async () => {
      await result.current.submitMessage({ text: 'hello' });
    });

    expect(mockImportFeishuDocsForMessage).toHaveBeenCalledWith('hello');
    expect(mockAsk).toHaveBeenCalledWith(
      { text: 'hello' },
      {
        addedConvo: undefined,
      },
    );
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  test('passes imported Feishu documents as override files', async () => {
    const importedFiles = [
      {
        file_id: 'file-1',
        filepath: 'feishu://wiki/QcXRwepEGiApKykeshKc0T5KnGG',
        type: 'text/markdown',
      },
    ];
    mockImportFeishuDocsForMessage.mockResolvedValue(importedFiles);
    const { result } = renderHook(() => useSubmitMessage());

    await act(async () => {
      await result.current.submitMessage({
        text: 'read https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG',
      });
    });

    expect(mockAsk).toHaveBeenCalledWith(
      {
        text: 'read https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG',
      },
      {
        addedConvo: undefined,
        overrideFiles: importedFiles,
      },
    );
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  test('does not send or reset when Feishu import fails', async () => {
    mockImportFeishuDocsForMessage.mockRejectedValue(new Error('import failed'));
    const { result } = renderHook(() => useSubmitMessage());

    await expect(
      act(async () => {
        await result.current.submitMessage({
          text: 'https://archebase.feishu.cn/wiki/QcXRwepEGiApKykeshKc0T5KnGG',
        });
      }),
    ).rejects.toThrow('import failed');

    expect(mockAsk).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
  });
});
