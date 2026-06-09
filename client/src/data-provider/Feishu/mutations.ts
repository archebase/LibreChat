import { useMutation } from '@tanstack/react-query';
import { MutationKeys, dataService } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

export const useImportFeishuDocsMutation = (): UseMutationResult<
  t.FeishuDocImportResponse,
  unknown,
  t.FeishuDocImportRequest,
  unknown
> => {
  return useMutation([MutationKeys.feishuDocImport], {
    mutationFn: (body: t.FeishuDocImportRequest) => dataService.importFeishuDocs(body),
  });
};
