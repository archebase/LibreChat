import { useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { extractFeishuDocUrls } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import { useGetStartupConfig, useImportFeishuDocsMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

type ImportedMessageFile = NonNullable<t.TMessage['files']>[number];

export default function useFeishuDocImport(): {
  importFeishuDocsForMessage: (text: string) => Promise<ImportedMessageFile[]>;
  isImporting: boolean;
} {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  const importMutation = useImportFeishuDocsMutation();

  const importFeishuDocsForMessage = useCallback(
    async (text: string): Promise<ImportedMessageFile[]> => {
      const links = extractFeishuDocUrls(text);
      if (!startupConfig?.feishuDocImportEnabled || links.length === 0) {
        return [];
      }

      showToast({
        message: localize('com_ui_feishu_doc_importing'),
        status: 'info',
      });

      try {
        const response = await importMutation.mutateAsync({
          urls: links.map((link) => link.url),
        });

        if (response.files.length > 0) {
          showToast({
            message: localize('com_ui_feishu_doc_import_success'),
            status: 'success',
          });
        }

        return response.files.map((file) => ({
          file_id: file.file_id,
          filepath: file.filepath,
          type: file.type ?? '',
          height: file.height,
          width: file.width,
        }));
      } catch (error) {
        showToast({
          message: localize('com_ui_feishu_doc_import_failed'),
          status: 'error',
        });
        throw error;
      }
    },
    [importMutation, localize, showToast, startupConfig?.feishuDocImportEnabled],
  );

  return {
    importFeishuDocsForMessage,
    isImporting: importMutation.isLoading,
  };
}
