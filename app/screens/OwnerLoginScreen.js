import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
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
import { useGym } from "../context/GymContext";

export default function OwnerLoginScreen({ navigation }) {
  const { loginOwner } = useGym();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    // Validate inputs
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email");
      return;
    }
    if (!password.trim()) {
      Alert.alert("Error", "Please enter your password");
      return;
    }

    setLoading(true);

    // Simulate API call
    setTimeout(() => {
      const result = loginOwner(email.trim(), password);
      setLoading(false);

      if (result.success) {
        Alert.alert("Success", "Login successful!", [
          { text: "OK", onPress: () => navigation.replace("OwnerDashboard") },
        ]);
      } else {
        Alert.alert("Error", result.message);
      }
    }, 500);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="fitness" size={60} color="#3edb17" />
            </View>
            <Text style={styles.title}>Gym Owner</Text>
            <Text style={styles.subtitle}>Login to manage your gyms</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Ionicons
                name="mail-outline"
                size={20}
                color="#666"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color="#666"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
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
                  color="#666"
                />
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? "Logging in..." : "Login"}
              </Text>
            </TouchableOpacity>

            {/* Register Link */}
            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>Don't have an account? </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate("OwnerRegister")}
              >
                <Text style={styles.registerLink}>Register</Text>
              </TouchableOpacity>
            </View>

            {/* Back to Home */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.navigate("Home")}
            >
              <Ionicons name="arrow-back" size={20} color="#666" />
              <Text style={styles.backText}>Back to Home</Text>
            </TouchableOpacity>
          </View>

          {/* Demo Credentials */}
          <View style={styles.demoContainer}>
            <Text style={styles.demoTitle}>Demo Credentials:</Text>
            <Text style={styles.demoText}>Email: admin@gym.com</Text>
            <Text style={styles.demoText}>Password: admin123</Text>
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
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
  },
  form: {
    width: "100%",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
  },
  eyeIcon: {
    padding: 4,
  },
  button: {
    backgroundColor: "#3edb17",
    borderRadius: 12,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: "#93C5FD",
  },
  buttonText: {
    color: "black",
    fontSize: 18,
    fontWeight: "600",
  },
  registerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  registerText: {
    fontSize: 16,
    color: "#6B7280",
  },
  registerLink: {
    fontSize: 16,
    color: "black",
    fontWeight: "600",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    padding: 10,
  },
  backText: {
    fontSize: 16,
    color: "#666",
    marginLeft: 8,
  },
  demoContainer: {
    marginTop: 40,
    padding: 16,
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
  },
  demoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
  },
  demoText: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
});
