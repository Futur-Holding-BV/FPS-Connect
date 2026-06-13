import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "fps.monteur.token";

const isWeb = Platform.OS === "web";

// De bearer-token is een credential en hoort in de beveiligde sleutelbos
// (SecureStore) op iOS/Android. SecureStore werkt niet op web, dus daar
// vallen we terug op AsyncStorage zodat de web-preview blijft werken.
export async function leesToken(): Promise<string | null> {
  if (isWeb) {
    return AsyncStorage.getItem(TOKEN_KEY);
  }
  // Eerst SecureStore; daarna eenmalige migratie vanuit AsyncStorage.
  const veilig = await SecureStore.getItemAsync(TOKEN_KEY);
  if (veilig) return veilig;

  const oud = await AsyncStorage.getItem(TOKEN_KEY);
  if (oud) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, oud);
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch {
      // Migratie mislukt: laat het AsyncStorage-token staan als fallback.
      return oud;
    }
    return oud;
  }
  return null;
}

export async function bewaarToken(token: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function wisToken(): Promise<void> {
  if (isWeb) {
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  // Verwijder ook een eventueel achtergebleven AsyncStorage-token (pre-migratie).
  await AsyncStorage.removeItem(TOKEN_KEY);
}
