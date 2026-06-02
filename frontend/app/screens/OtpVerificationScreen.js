import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { mapErrorToMessage } from "../utils/errorMapper";

export default function OtpVerificationScreen({ navigation, route }) {
  const { verifyEmailOtp, resendEmailOtp, loading } = useAuth();
  const [email, setEmail] = useState(route?.params?.email || "");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  const handleVerify = async () => {
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!otp.trim()) {
      setError("Verification code is required.");
      return;
    }

    setError("");

    try {
      const response = await verifyEmailOtp(email.trim(), otp.trim());
      Alert.alert("Success", response.message || "Email verified successfully.", [
        {
          text: "OK",
          onPress: () =>
            navigation.replace(route?.params?.redirectTo || "OwnerLogin"),
        },
      ]);
    } catch (apiError) {
      const mapped = mapErrorToMessage(apiError);
      setError(mapped.message);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) {
      setError("Email is required to resend the code.");
      return;
    }

    setError("");

    try {
      const response = await resendEmailOtp(email.trim());
      Alert.alert("Verification Code", response.message || "A new OTP has been sent.");
    } catch (apiError) {
      const mapped = mapErrorToMessage(apiError);
      setError(mapped.message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="mail-open-outline" size={42} color="#111827" />
          </View>
          <Text style={styles.title}>Verify Email</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to your email address.
            You have only 2 munites.
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="6-digit OTP"
            placeholderTextColor="#9CA3AF"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={handleVerify}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#111827" />
            ) : (
              <Text style={styles.primaryButtonText}>Verify</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleResend}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>Resend OTP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() =>
              navigation.replace(route?.params?.redirectTo || "OwnerLogin")
            }
          >
            <Text style={styles.backButtonText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#E5F4EA",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    color: "#6B7280",
  },
  form: {
    gap: 14,
  },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#F9FAFB",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
  },
  primaryButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#3EDB17",
    justifyContent: "center",
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "700",
  },
  secondaryButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    marginTop: 8,
    alignItems: "center",
  },
  backButtonText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "500",
  },
});
