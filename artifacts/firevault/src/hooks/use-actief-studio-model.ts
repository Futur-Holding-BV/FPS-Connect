import {
  useListActieveDocumentStudioModellen,
  getListActieveDocumentStudioModellenQueryKey,
  type DocumentStudioModel,
} from "@workspace/api-client-react";

export function useActiefStudioModel(
  werkgeverId: number | null | undefined,
  documentType: string,
): DocumentStudioModel | null {
  const { data } = useListActieveDocumentStudioModellen(werkgeverId ?? 0, {
    query: {
      queryKey: getListActieveDocumentStudioModellenQueryKey(werkgeverId ?? 0),
      enabled: !!werkgeverId,
      retry: false,
      throwOnError: false,
    },
  });
  return data?.[documentType] ?? null;
}
