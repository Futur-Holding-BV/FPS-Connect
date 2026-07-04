import {
  useListActieveDocumentStudioModellen,
  getListActieveDocumentStudioModellenQueryKey,
  type DocumentStudioModel,
} from "@workspace/api-client-react";

export interface ActiefStudioModelResultaat {
  model: DocumentStudioModel | null;
  isLoading: boolean;
  isError: boolean;
}

export function useActiefStudioModel(
  werkgeverId: number | null | undefined,
  documentType: string,
): ActiefStudioModelResultaat {
  const { data, isLoading, isError } = useListActieveDocumentStudioModellen(werkgeverId ?? 0, {
    query: {
      queryKey: getListActieveDocumentStudioModellenQueryKey(werkgeverId ?? 0),
      enabled: !!werkgeverId,
      retry: false,
      throwOnError: false,
    },
  });

  const model = data?.[documentType] ?? null;

  return {
    model,
    isLoading: !!werkgeverId && isLoading,
    isError: !!werkgeverId && isError,
  };
}
