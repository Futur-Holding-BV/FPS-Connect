---
name: Expo Go native module compatibiliteit (monteur-app)
description: Welke native modules de monteur-app in Expo Go crashen en de gekozen keyboard-aanpak
---

# Expo Go native modules (monteur-app)

monteur-app draait in **Expo Go** (geen dev build, geen EAS CLI — EAS is verboden door de expo-skill). Alleen native modules die in de Expo Go-bundel zitten werken. Een native module die er NIET in zit crasht de app bij start, vaak via een root-Provider.

- **react-native-keyboard-controller zit NIET in Expo Go** → `KeyboardProvider` in de root layout (`app/_layout.tsx`) crashte de native app. Vervangen door RN built-in `KeyboardAvoidingView` + `ScrollView`. De web-bundle en het loginscherm bleven werken.
- **Spanning met de expo-skill:** die beveelt expliciet `react-native-keyboard-controller` aan voor keyboard handling. Dat advies geldt voor dev/production builds, NIET voor Expo Go.
- Modules die hier gebruikt worden en WEL in Expo Go SDK 54 zitten: gesture-handler, reanimated (+ worklets), safe-area-context, screens, svg, webview, async-storage, expo-*.

**Why:** gebruiker wil de app in Expo Go testen; de native-only crash kostte tijd om te isoleren tot één incompatibele module.

**How to apply:** voeg geen native module aan monteur-app toe zonder te checken of die in Expo Go zit; gebruik voor keyboard handling RN built-ins, niet keyboard-controller, zolang Expo Go het doel is.
