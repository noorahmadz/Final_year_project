import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import GymList from "../components/GymList";

import { useEffect, useRef } from "react";

function FootballAnimation() {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounceAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );

    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
    );

    bounceAnimation.start();
    rotateAnimation.start();

    return () => {
      bounceAnimation.stop();
      rotateAnimation.stop();
    };
  }, [bounceAnim, rotateAnim]);

  const bounce = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={{
        transform: [{ translateY: bounce }, { rotate }],
        marginRight: 8,
      }}
    >
      <Ionicons name="football" size={24} color="#16A34A" />
    </Animated.View>
  );
}

export default function HomeScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState("");

  const clearSearch = () => {
    setSearchQuery("");
  };

  return (
    <View style={styles.container}>
      {/* Header with Owner, Text with Animation, and Admin Login */}
      <View style={styles.header}>
        {/* Owner Portal Button - Left */}
        <TouchableOpacity
          style={styles.ownerButton}
          onPress={() => navigation.navigate("OwnerLogin")}
        >
          <Ionicons name="business-outline" size={20} color="#2563EB" />
          <Text style={styles.ownerButtonText}>Owner</Text>
        </TouchableOpacity>

        {/* Center - Text with Football Animation */}
        <View style={styles.centerContent}>
          <View style={styles.titleContainer}>
            <FootballAnimation />
            <Text style={styles.title}>Find Gym</Text>
          </View>
          <Text style={styles.subtitle}>Book courts near you</Text>
        </View>

        {/* Admin Portal Button - Right */}
        <TouchableOpacity
          style={styles.adminButton}
          onPress={() => navigation.navigate("AdminLogin")}
        >
          <Ionicons name="shield-checkmark" size={20} color="#7C3AED" />
          <Text style={styles.adminButtonText}>Admin</Text>
        </TouchableOpacity>
      </View>

      {/* See Tournaments Button */}
      <View style={styles.tournamentButtonContainer}>
        <TouchableOpacity
          style={styles.tournamentButton}
          onPress={() => navigation.navigate("Tournaments")}
        >
          <Ionicons name="trophy" size={20} color="#fff" />
          <Text style={styles.tournamentButtonText}>See Tournaments</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color="#2563EB"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search gyms..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
            <Ionicons name="close" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Gym List */}
      <GymList navigation={navigation} searchQuery={searchQuery} />

      {/* Bottom Navigation Buttons */}
      {/* <View style={styles.bottomButtons}>
        <Button
          title="Services"
          onPress={() => navigation.navigate("Services")}
        />
        <View style={{ height: 10 }} />
        <Button title="About" onPress={() => navigation.navigate("About")} />
      </View> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 10,
    backgroundColor: "#fff",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F2937",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  ownerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3edb17",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "black",
  },
  ownerButtonText: {
    color: "#0c0b0bb9929",
    fontWeight: "600",
    marginLeft: 6,
    fontSize: 14,
  },
  adminButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3edb17",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "black",
  },
  adminButtonText: {
    color: "#0c0b0bb9929",
    fontWeight: "600",
    marginLeft: 4,
    fontSize: 12,
  },
  tournamentButtonContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  tournamentButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F59E0B",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  tournamentButtonText: {
    color: "#fff",
    fontWeight: "600",
    marginLeft: 8,
    fontSize: 16,
  },
  bottomButtons: {
    padding: 20,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
    backgroundColor: "transparent",
  },
  clearButton: {
    padding: 4,
  },
});
