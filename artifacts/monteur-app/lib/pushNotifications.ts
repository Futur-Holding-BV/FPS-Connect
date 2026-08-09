import { API_DOMEIN } from "@/lib/apiDomein";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const DOMEIN = API_DOMEIN;

/**
 * Vraagt toestemming voor pushberichten en registreert het Expo-pushtoken
 * bij de API zodat de beheerder meldingen kan ontvangen.
 * Stille fout bij geen toestemming of simulator.
 */
export async function registreerPushToken(bearerToken: string): Promise<void> {
  if (Platform.OS === "web") return;
  if (!Device.isDevice) return;

  const { status: bestaand } = await Notifications.getPermissionsAsync();
  let status = bestaand;
  if (status !== "granted") {
    const { status: nieuw } = await Notifications.requestPermissionsAsync();
    status = nieuw;
  }
  if (status !== "granted") return;

  let pushToken: string;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    pushToken = tokenData.data;
  } catch {
    return;
  }

  const platform: "ios" | "android" | "onbekend" =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "onbekend";

  try {
    await fetch(`https://${DOMEIN}/api/wagenpark/push-tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ expo_push_token: pushToken, platform }),
    });
  } catch {
    // Stille fout — token wordt bij de volgende inlog opnieuw geprobeerd
  }
}
