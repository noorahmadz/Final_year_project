import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { mapErrorToMessage } from "../utils/errorMapper";
import {
  getFlexDirection,
  getTextAlign,
  getWritingDirection,
  isRTL,
} from "../utils/rtl";

const PRIMARY_COLOR = "#24a731";
const PRIMARY_DARK = "#1B7F26";
const PRIMARY_TINT = "#EAF8EC";
const PRIMARY_BORDER = "#BFE7C5";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function OwnerLoginScreen({ navigation }) {
  const { t } = useTranslation();
  const { login, loading } = useAuth();
  const router = useRouter();
  const rtl = isRTL();
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };

  const [selectedRole, setSelectedRole] = useState("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError(t("auth.validation.emailRequired"));
      return;
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError(t("auth.validation.invalidEmail"));
      return;
    }
    if (!password.trim()) {
      setError(t("auth.validation.passwordRequired"));
      return;
    }

    setError("");

    try {
      const result = await login(normalizedEmail, password, {
        expectedRole: selectedRole,
      });

      if (result.user?.role === "owner") {
        router.replace("/owner/dashboard");
        return;
      }

      if (result.user?.role !== "owner") {
        navigation.replace("Home");
      }
    } catch (apiError) {
      const backendErrorCode = apiError?.data?.error_code;
      const mapped = mapErrorToMessage(apiError);

      if (backendErrorCode === "email_not_verified") {
        Alert.alert(t("auth.verification.title"), mapped.message, [
          {
            text: t("auth.verification.verifyNow"),
            onPress: () =>
              navigation.navigate("OtpVerification", {
                email: normalizedEmail,
                redirectTo: "OwnerLogin",
              }),
          },
          { text: t("common.cancel"), style: "cancel" },
        ]);
        return;
      }

      setError(mapped.message);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="fitness" size={60} color="#FFFFFF" />
            </View>
            <Text
              style={[styles.title, localizedTextStyle]}
            >
              {t("auth.login.title")}
            </Text>
            <Text
              style={[styles.subtitle, localizedTextStyle]}
            >
              {t("auth.login.subtitle")}
            </Text>
          </View>

          <View style={styles.form}>
            <View
              style={[
                styles.roleSelector,
                {
                  flexDirection: getFlexDirection(),
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  selectedRole === "customer" && styles.roleButtonActive,
                  {
                    flexDirection: getFlexDirection(),
                  },
                ]}
                onPress={() => {
                  setSelectedRole("customer");
                  setError("");
                }}
              >
                <Ionicons
                  name="person-outline"
                  size={18}
                  color="block"
                />
                <Text
                  style={[
                    styles.roleButtonText,
                    selectedRole === "customer" && styles.roleButtonTextActive,
                    localizedTextStyle,
                  ]}
                >
                  {t("auth.roles.customer")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleButton,
                  selectedRole === "owner" && styles.roleButtonActive,
                  {
                    flexDirection: getFlexDirection(),
                  },
                ]}
                onPress={() => {
                  setSelectedRole("owner");
                  setError("");
                }}
              >
                <Ionicons
                  name="business-outline"
                  size={18}
                  color="block"
                />
                <Text
                  style={[
                    styles.roleButtonText,
                    selectedRole === "owner" && styles.roleButtonTextActive,
                    localizedTextStyle,
                  ]}
                >
                  {t("auth.roles.gymOwner")}
                </Text>
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.inputContainer,
                {
                  flexDirection: getFlexDirection(),
                },
              ]}
            >
              <Ionicons
                name="mail-outline"
                size={20}
                color="#24a731"
                style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
              />
              <TextInput
                style={[styles.input, localizedTextStyle]}
                placeholder={t("auth.fields.email")}
                placeholderTextColor="#999"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (error) setError("");
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View
              style={[
                styles.inputContainer,
                {
                  flexDirection: getFlexDirection(),
                },
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color="#24a731"
                style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
              />
              <TextInput
                style={[styles.input, localizedTextStyle]}
                placeholder={t("auth.fields.password")}
                placeholderTextColor="#999"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  if (error) setError("");
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#24a731"
                />
              </TouchableOpacity>
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Text style={styles.buttonText}>{t("auth.login.loginButton")}</Text>
              )}
            </TouchableOpacity>

            <View
              style={[
                styles.registerContainer,
                {
                  flexDirection: getFlexDirection(),
                },
              ]}
            >
              <Text
                style={[styles.registerText, localizedTextStyle]}
              >
                {t("auth.login.noAccount")}{" "}
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate("OwnerRegister")}
              >
                <Text style={styles.registerLink}>{t("auth.login.register")}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.backButton,
                {
                  flexDirection: getFlexDirection(),
                },
              ]}
              onPress={() => navigation.navigate("Home")}
            >
              <Ionicons
                name={rtl ? "arrow-forward" : "arrow-back"}
                size={20}
                color="#FFFFFF"
              />
              <Text style={[styles.backText, localizedTextStyle]}>
                {t("auth.login.backToHome")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#24a731",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#24a731",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
  },
  form: {
    width: "100%",
  },
  roleSelector: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  roleButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    // backgroundColor: PRIMARY_TINT,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    gap: 8,
  },
  roleButtonActive: {
    backgroundColor: PRIMARY_COLOR,
    borderColor: PRIMARY_DARK,
  },
  roleButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  roleButtonTextActive: {
    color: "#FFFFFF",
  },
  inputContainer: {
    alignItems: "center",
    // backgroundColor: PRIMARY_TINT,
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
  },
  inputIconLtr: {
    marginRight: 12,
  },
  inputIconRtl: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
  },
  eyeIcon: {
    padding: 4,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    marginTop: -4,
    marginBottom: 8,
  },
  button: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 12,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  registerContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  registerText: {
    fontSize: 16,
    color: "#6B7280",
  },
  registerLink: {
    fontSize: 16,
    color: PRIMARY_COLOR,
    fontWeight: "600",
  },
  backButton: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    padding: 10,
    gap: 8,
  },
  backText: {
    fontSize: 16,
    color: PRIMARY_DARK,
  },
});
