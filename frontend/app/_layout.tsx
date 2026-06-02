import AsyncStorage from "@react-native-async-storage/async-storage";
import { StripeProvider } from "@stripe/stripe-react-native";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";

import { AuthProvider } from "./context/AuthContext";
import { GymProvider } from "./context/GymContext";
import i18n from "./i18n";
import { syncNativeRTL } from "./utils/rtl";

const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const LANGUAGE_STORAGE_KEY = "app_language";

export default function RootLayout() {
  const [isLanguageReady, setIsLanguageReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const bootstrapLanguageAndDirection = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        const language = savedLanguage || i18n.language || "en";
        if (i18n.resolvedLanguage !== language) {
          await i18n.changeLanguage(language);
        }

        syncNativeRTL(language);
      } catch (error) {
        console.log("Language bootstrap error:", error);
      } finally {
        if (isMounted) {
          setIsLanguageReady(true);
        }
      }
    };

    bootstrapLanguageAndDirection();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isLanguageReady) {
    return null;
  }

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <GymProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
          </Stack>
        </AuthProvider>
      </GymProvider>
    </StripeProvider>
  );
}
