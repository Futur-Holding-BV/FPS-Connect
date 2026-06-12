import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

export default function Index() {
  const { token, bezigLaden } = useAuth();
  const c = useColors();

  if (bezigLaden) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.dark,
        }}
      >
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  return <Redirect href={token ? "/menu" : "/login"} />;
}
