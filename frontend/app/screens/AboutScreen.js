import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

export default function AboutScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Ionicons name="information-circle" size={50} color="orange" />
      <Text style={{ fontSize: 24, marginTop: 10 }}>About Paghjhje</Text>
    </View>
  );
}
