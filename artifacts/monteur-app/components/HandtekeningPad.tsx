import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { ruimte } from "@workspace/ontwerp";

import { useColors } from "@/hooks/useColors";

type Punt = { x: number; y: number };
type Lijn = Punt[];

function lijnNaarPad(lijn: Lijn): string {
  if (lijn.length === 0) return "";
  const [eerste, ...rest] = lijn;
  if (!eerste) return "";
  const start = `M ${eerste.x.toFixed(1)} ${eerste.y.toFixed(1)}`;
  if (rest.length === 0) {
    // Enkel punt — teken klein segment zodat het zichtbaar is
    return `${start} l 0.1 0.1`;
  }
  return `${start} ${rest.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}`;
}

function lijnenNaarSvg(lijnen: Lijn[], breedte: number, hoogte: number): string {
  const paden = lijnen
    .map(lijnNaarPad)
    .filter(Boolean)
    .map(
      (d) =>
        `<path d="${d}" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${breedte}" height="${hoogte}" viewBox="0 0 ${breedte} ${hoogte}" style="background:white">${paden}</svg>`;
}

type Props = {
  breedte?: number;
  hoogte?: number;
  opgeslagen?: boolean;
  bezig?: boolean;
  onOpgeslagen: (svgData: string) => void;
  onWissen?: () => void;
};

export function HandtekeningPad({
  breedte = 320,
  hoogte = 160,
  opgeslagen = false,
  bezig = false,
  onOpgeslagen,
  onWissen,
}: Props) {
  const c = useColors();
  const [lijnen, setLijnen] = useState<Lijn[]>([]);
  const huidigeLijn = useRef<Lijn>([]);
  const bevestigd = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !opgeslagen && !bezig,
      onMoveShouldSetPanResponder: () => !opgeslagen && !bezig,
      onPanResponderGrant: (event) => {
        if (opgeslagen || bevestigd.current) return;
        const { locationX, locationY } = event.nativeEvent;
        huidigeLijn.current = [
          { x: Math.round(locationX * 10) / 10, y: Math.round(locationY * 10) / 10 },
        ];
        setLijnen((prev) => [...prev, huidigeLijn.current]);
      },
      onPanResponderMove: (event) => {
        if (opgeslagen || bevestigd.current) return;
        const { locationX, locationY } = event.nativeEvent;
        const punt = {
          x: Math.round(locationX * 10) / 10,
          y: Math.round(locationY * 10) / 10,
        };
        huidigeLijn.current = [...huidigeLijn.current, punt];
        setLijnen((prev) => {
          const nieuw = [...prev];
          nieuw[nieuw.length - 1] = huidigeLijn.current;
          return nieuw;
        });
      },
      onPanResponderRelease: () => {
        huidigeLijn.current = [];
      },
    }),
  ).current;

  function wis() {
    setLijnen([]);
    huidigeLijn.current = [];
    bevestigd.current = false;
    onWissen?.();
  }

  function bevestig() {
    const svg = lijnenNaarSvg(lijnen, breedte, hoogte);
    bevestigd.current = true;
    onOpgeslagen(svg);
  }

  const heeftHandtekening = lijnen.some((l) => l.length > 0);

  return (
    <View>
      <View
        style={{
          width: breedte,
          height: hoogte,
          backgroundColor: opgeslagen ? c.success + "0D" : c.card,
          borderRadius: c.radius,
          borderWidth: 1.5,
          borderColor: opgeslagen ? c.success : c.border,
          borderStyle: heeftHandtekening ? "solid" : "dashed",
          overflow: "hidden",
        }}
        {...panResponder.panHandlers}
      >
        <Svg width={breedte} height={hoogte}>
          {lijnen.map((lijn, i) => (
            <Path
              key={i}
              d={lijnNaarPad(lijn)}
              stroke={opgeslagen ? c.success : c.foreground}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
        {!heeftHandtekening && !opgeslagen && (
          <View
            style={{
              position: "absolute",
              inset: 0,
              justifyContent: "center",
              alignItems: "center",
            }}
            pointerEvents="none"
          >
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 13,
                fontFamily: "Inter_400Regular",
              }}
            >
              Teken hier uw handtekening
            </Text>
          </View>
        )}
        {opgeslagen && (
          <View
            style={{
              position: "absolute",
              top: ruimte.s,
              right: ruimte.s,
            }}
            pointerEvents="none"
          >
            <View
              style={{
                backgroundColor: c.success + "26",
                paddingHorizontal: ruimte.s,
                paddingVertical: ruimte.xs - 1,
                borderRadius: c.radius / 2,
              }}
            >
              <Text
                style={{
                  color: c.success,
                  fontSize: 10,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                Opgeslagen
              </Text>
            </View>
          </View>
        )}
      </View>

      {!opgeslagen && (
        <View style={{ flexDirection: "row", gap: ruimte.s + 2, marginTop: ruimte.s + 2 }}>
          <Pressable
            onPress={wis}
            disabled={!heeftHandtekening || bezig}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: ruimte.s + 2,
              borderRadius: c.radius / 2,
              borderWidth: 1,
              borderColor: heeftHandtekening ? c.border : c.muted,
              alignItems: "center",
              backgroundColor: pressed ? c.muted : "transparent",
              opacity: !heeftHandtekening ? 0.4 : 1,
            })}
          >
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              Wissen
            </Text>
          </Pressable>
          <Pressable
            onPress={bevestig}
            disabled={!heeftHandtekening || bezig}
            style={({ pressed }) => ({
              flex: 2,
              paddingVertical: ruimte.s + 2,
              borderRadius: c.radius / 2,
              backgroundColor:
                heeftHandtekening && !bezig ? c.success : c.muted,
              opacity: heeftHandtekening && !bezig && pressed ? 0.85 : 1,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: ruimte.xs + 2,
            })}
          >
            {bezig ? (
              <ActivityIndicator size="small" color={c.primaryForeground} />
            ) : null}
            <Text
              style={{
                color:
                  heeftHandtekening && !bezig ? c.primaryForeground : c.mutedForeground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
              }}
            >
              {bezig ? "Opslaan..." : "Handtekening bevestigen"}
            </Text>
          </Pressable>
        </View>
      )}

      {opgeslagen && (
        <Pressable
          onPress={wis}
          style={({ pressed }) => ({
            marginTop: 8,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: c.border,
            alignItems: "center",
            backgroundColor: pressed ? c.muted : "transparent",
          })}
        >
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_500Medium",
              fontSize: 12,
            }}
          >
            Handtekening opnieuw plaatsen
          </Text>
        </Pressable>
      )}
    </View>
  );
}
