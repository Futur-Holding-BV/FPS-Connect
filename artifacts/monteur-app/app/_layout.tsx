import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, getHuidigToken, useAuth } from "@/context/auth";
import { SyncProvider } from "@/context/sync";
import { AchievementProvider } from "@/context/achievement";

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
setAuthTokenGetter(() => getHuidigToken());

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { bezigLaden, vergrendeld, token } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Centrale toegangspoort: voorkomt dat een vergrendelde sessie via een
  // diepe link of herstelde route langs het slotscherm komt. De per-scherm
  // redirects blijven als extra vangnet bestaan.
  useEffect(() => {
    if (bezigLaden) return;
    if (vergrendeld) {
      if (pathname !== "/vergrendeld") router.replace("/vergrendeld");
      return;
    }
    if (pathname === "/vergrendeld") {
      router.replace(token ? "/menu" : "/login");
      return;
    }
    const openbaar = pathname === "/login" || pathname === "/";
    if (!token && !openbaar) {
      router.replace("/login");
    }
  }, [bezigLaden, vergrendeld, token, pathname, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="vergrendeld" />
      <Stack.Screen name="menu" />
      <Stack.Screen name="binnenkort" />
      <Stack.Screen name="fabrikanten" />
      <Stack.Screen name="gebouwen" />
      <Stack.Screen name="documenten" />
      <Stack.Screen name="documenten/[id]" />
      <Stack.Screen name="gebouw/[id]" />
      <Stack.Screen name="plattegrond/[verdiepingId]" />
      <Stack.Screen name="document/[tekeningId]" />
      <Stack.Screen name="hrm/index" />
      <Stack.Screen name="hrm/opleidingen" />
      <Stack.Screen name="hrm/kennisbank" />
      <Stack.Screen name="uren" />
      <Stack.Screen name="info" />
      <Stack.Screen name="opname/index" />
      <Stack.Screen name="opname/[id]" />
      <Stack.Screen name="opname/item/[itemId]" />
      <Stack.Screen name="werkdag/index" />
      <Stack.Screen name="werkdag/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SyncProvider>
              <AchievementProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <RootLayoutNav />
                </GestureHandlerRootView>
              </AchievementProvider>
            </SyncProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
