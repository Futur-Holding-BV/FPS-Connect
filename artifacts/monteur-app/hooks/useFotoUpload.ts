import { useCallback } from "react";
import { uploadFoto as uploadFotoLib } from "@/lib/upload";

export function useFotoUpload() {
  const uploadFoto = useCallback(async (uri: string): Promise<string | null> => {
    try {
      return await uploadFotoLib(uri);
    } catch {
      return null;
    }
  }, []);

  return { uploadFoto };
}
