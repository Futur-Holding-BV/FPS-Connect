import { useCallback } from "react";
import { Audio } from "expo-av";

export function useMeldingGeluid() {
  const speel = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: false });
      const { sound } = await Audio.Sound.createAsync(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../assets/sounds/fps-bericht.wav") as number,
      );
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          void sound.unloadAsync();
        }
      });
    } catch {
      // Stil falen — geluid is niet kritisch voor de werking van de app
    }
  }, []);

  return { speel };
}
