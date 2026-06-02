import { Ionicons } from "@expo/vector-icons";
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

const AFGHAN_PHONE_PATTERN = /^(?:\+93|0093|0)7\d{8}$/;

export default function OwnerRegisterScreen({ navigation }) {
  const { t } = useTranslation();
  const { register, loading } = useAuth();
  const rtl = isRTL();
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };

  const [selectedRole, setSelectedRole] = useState("customer");
  const [error, setError] = useState("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const clearError = () => {
    if (error) {
      setError("");
    }
  };

  const validateBaseForm = () => {
    const normalizedPhone = phone.trim();

    if (!["customer", "owner"].includes(selectedRole)) {
      return t("auth.validation.selectValidRole");
    }
    if (!fullName.trim()) {
      return t("auth.validation.fullNameRequired");
    }
    if (!normalizedPhone) {
      return t("auth.validation.phoneRequired");
    }
    if (!AFGHAN_PHONE_PATTERN.test(normalizedPhone)) {
      return t("auth.validation.invalidPhone");
    }
    if (!email.trim()) {
      return t("auth.validation.emailRequired");
    }
    if (!password.trim()) {
      return t("auth.validation.passwordRequired");
    }
    if (!confirmPassword.trim()) {
      return t("auth.validation.confirmPasswordRequired");
    }
    if (password !== confirmPassword) {
      return t("auth.validation.passwordsDoNotMatch");
    }
    return "";
  };

  const submitRegistration = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const registrationPayload = {
      full_name: fullName.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      password,
      password_confirm: confirmPassword,
      role: selectedRole,
    };

    setError("");

    try {
      const response = await register(registrationPayload);
      const verificationEmail = response.email || registrationPayload.email;

      if (response.verification_required === true) {
        navigation.navigate("OtpVerification", {
          email: verificationEmail,
          redirectTo: "OwnerLogin",
        });
        return;
      }

      Alert.alert(
        t("auth.register.submittedTitle"),
        response.message || t("auth.register.submittedMessage"),
      );
    } catch (apiError) {
      const mapped = mapErrorToMessage(apiError);
      setError(mapped.message);
    }
  };

  const handlePrimaryAction = async () => {
    const baseValidationError = validateBaseForm();
    if (baseValidationError) {
      setError(baseValidationError);
      return;
    }

    if (loading) {
      return;
    }

    await submitRegistration();
  };

  const renderRoleSelector = () => (
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
          clearError();
        }}
      >
        <Ionicons
          name="person-outline"
          size={18}
          color={selectedRole === "customer" ? "black" : "#24a731"}
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
          clearError();
        }}
      >
        <Ionicons
          name="business-outline"
          size={18}
          color={selectedRole === "owner" ? "black" : "#24a731"}
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
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.stepContent}>
            <Text
              style={[styles.stepTitle, localizedTextStyle]}
            >
              {t("auth.register.title")}
            </Text>
            {/* <Text
              style={[styles.stepSubtitle, localizedTextStyle]}
            >
              {t("auth.register.subtitle")}
            </Text> */}

            <Text
              style={[styles.sectionLabel, localizedTextStyle]}
            >
              {t("auth.register.selectRole")}
            </Text>
            {renderRoleSelector()}

            <View
              style={[
                styles.inputContainer,
                {
                  flexDirection: getFlexDirection(),
                },
              ]}
            >
              <Ionicons
                name="person-outline"
                size={20}
                color="#24a731"
                style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
              />
              <TextInput
                style={[styles.input, localizedTextStyle]}
                placeholder={t("auth.fields.fullName")}
                placeholderTextColor="#999"
                value={fullName}
                onChangeText={(value) => {
                  setFullName(value);
                  clearError();
                }}
                autoCapitalize="words"
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
                name="call-outline"
                size={20}
                color="#24a731"
                style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
              />
              <TextInput
                style={[styles.input, localizedTextStyle]}
                placeholder={t("auth.fields.phoneNumber")}
                placeholderTextColor="#999"
                value={phone}
                onChangeText={(value) => {
                  setPhone(value);
                  clearError();
                }}
                keyboardType="phone-pad"
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
                  clearError();
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
                  clearError();
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
                placeholder={t("auth.fields.confirmPassword")}
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  clearError();
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handlePrimaryAction}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Text style={styles.buttonText}>{t("auth.register.createAccount")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View
          style={[
            styles.loginContainer,
            {
              flexDirection: getFlexDirection(),
            },
          ]}
        >
          <Text
            style={[styles.loginText, localizedTextStyle]}
          >
            {t("auth.register.alreadyHaveAccount")}{" "}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate("OwnerLogin")}>
            <Text style={styles.loginLink}>{t("auth.register.login")}</Text>
          </TouchableOpacity>
        </View>
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
  },
  stepContent: {
    width: "100%",
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#24a731",
    marginBottom: 24,
    marginTop:20,
  },
  stepSubtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 12,
  },
  roleSelector: {
    gap: 12,
    marginBottom: 16,
  },
  roleButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  roleButtonActive: {
    backgroundColor: "#3edb17",
    borderColor: "black",
  },
  roleButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  roleButtonTextActive: {
    color: "#fff",
  },
  inputContainer: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#24a731",
    borderRadius: 12,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  loginContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  loginText: {
    fontSize: 16,
    color: "block",
    // marginBottom:130,
  },
  loginLink: {
    fontSize: 16,
    color: "#24a731",
    fontWeight: "600",
    // marginBottom:130,
  },
});
