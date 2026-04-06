import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Image,
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

export default function OwnerRegisterScreen({ navigation }) {
  const { registerOwner, addGYM } = useGym();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Owner Info
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Gym Info (for first gym)
  const [gymName, setGymName] = useState("");
  const [gymAddress, setGymAddress] = useState("");
  const [gymCity, setGymCity] = useState("");
  const [gymPhone, setGymPhone] = useState("");
  const [gymImage, setGymImage] = useState(null);

  // Image picker function
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setGymImage(result.assets[0].uri);
    }
  };

  const validateStep1 = () => {
    if (!ownerName.trim()) {
      Alert.alert("Error", "Please enter your name");
      return false;
    }
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email");
      return false;
    }
    if (!password.trim()) {
      Alert.alert("Error", "Please enter a password");
      return false;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!gymName.trim()) {
      Alert.alert("Error", "Please enter your gym name");
      return false;
    }
    if (!gymAddress.trim()) {
      Alert.alert("Error", "Please enter gym address");
      return false;
    }
    if (!gymPhone.trim()) {
      Alert.alert("Error", "Please enter phone number");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) {
        setStep(2);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleRegister = async () => {
    if (!validateStep2()) return;

    setLoading(true);

    // Simulate API call
    setTimeout(() => {
      // Register owner
      const ownerResult = registerOwner({
        name: ownerName.trim(),
        email: email.trim().toLowerCase(),
        password: password,
      });

      if (ownerResult.success) {
        // Create initial gym for the owner
        const newGym = addGYM({
          name: gymName.trim(),
          address: gymAddress.trim(),
          city: gymCity.trim(),
          phone: gymPhone.trim(),
          email: email.trim().toLowerCase(),
          ownerId: ownerResult.user.id,
          image: gymImage,
          description: `Welcome to ${gymName}! This gym is managed by ${ownerName}.`,
          timing: {
            Mon: { open: "6:00 AM", close: "10:00 PM" },
            Tue: { open: "6:00 AM", close: "10:00 PM" },
            Wed: { open: "6:00 AM", close: "10:00 PM" },
            Thu: { open: "6:00 AM", close: "10:00 PM" },
            Fri: { open: "6:00 AM", close: "10:00 PM" },
            Sat: { open: "6:00 AM", close: "10:00 PM" },
            Sun: { open: "6:00 AM", close: "10:00 PM" },
          },
          courts: [],
        });

        setLoading(false);
        Alert.alert(
          "Success!",
          "Your account has been created. You can now manage your gym.",
          [{ text: "OK", onPress: () => navigation.replace("OwnerDashboard") }],
        );
      } else {
        setLoading(false);
        Alert.alert("Error", ownerResult.message);
      }
    }, 500);
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Owner Information</Text>

      {/* Name Input */}
      <View style={styles.inputContainer}>
        <Ionicons
          name="person-outline"
          size={20}
          color="#666"
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#999"
          value={ownerName}
          onChangeText={setOwnerName}
          autoCapitalize="words"
        />
      </View>

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
          placeholder="Password (min 6 characters)"
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

      {/* Confirm Password Input */}
      <View style={styles.inputContainer}>
        <Ionicons
          name="lock-closed-outline"
          size={20}
          color="#666"
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          placeholderTextColor="#999"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />
      </View>

      <TouchableOpacity style={styles.button} onPress={handleNext}>
        <Text style={styles.buttonText}>Next: Gym Details</Text>
        <Ionicons name="arrow-forward" size={20} color="blak" />
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Gym Details</Text>
      <Text style={styles.stepSubtitle}>Add your first gym information</Text>

      {/* Gym Name */}
      <View style={styles.inputContainer}>
        <Ionicons
          name="business-outline"
          size={20}
          color="#666"
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          placeholder="Gym Name"
          placeholderTextColor="#999"
          value={gymName}
          onChangeText={setGymName}
          autoCapitalize="words"
        />
      </View>

      {/* Address */}
      <View style={styles.inputContainer}>
        <Ionicons
          name="location-outline"
          size={20}
          color="#666"
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          placeholder="Address"
          placeholderTextColor="#999"
          value={gymAddress}
          onChangeText={setGymAddress}
          autoCapitalize="words"
        />
      </View>

      {/* Gym Image */}
      <TouchableOpacity style={styles.imagePickerContainer} onPress={pickImage}>
        {gymImage ? (
          <Image source={{ uri: gymImage }} style={styles.selectedImage} />
        ) : (
          <View style={styles.imagePickerPlaceholder}>
            <Ionicons name="camera-outline" size={40} color="#666" />
            <Text style={styles.imagePickerText}>Tap to select gym image</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Phone */}
      <View style={styles.inputContainer}>
        <Ionicons
          name="call-outline"
          size={20}
          color="#666"
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          placeholder="Phone Number"
          placeholderTextColor="#999"
          value={gymPhone}
          onChangeText={setGymPhone}
          keyboardType="phone-pad"
        />
      </View>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButtonSmall} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color="black" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Creating..." : "Create Account"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          <View
            style={[styles.progressDot, step >= 1 && styles.progressDotActive]}
          />
          <View style={styles.progressLine} />
          <View
            style={[styles.progressDot, step >= 2 && styles.progressDotActive]}
          />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {step === 1 ? renderStep1() : renderStep2()}
        </ScrollView>

        {/* Login Link */}
        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("OwnerLogin")}>
            <Text style={styles.loginLink}>Login</Text>
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
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#E5E7EB",
  },
  progressDotActive: {
    backgroundColor: "#3edb17",
  },
  progressLine: {
    width: 60,
    height: 2,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 8,
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
    color: "#1F2937",
    marginBottom: 8,
    textAlign: "center",
  },
  stepSubtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 24,
    textAlign: "center",
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
  imagePickerContainer: {
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
  },
  selectedImage: {
    width: "100%",
    height: "100%",
  },
  imagePickerPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  imagePickerText: {
    marginTop: 8,
    fontSize: 16,
    color: "#666",
  },
  eyeIcon: {
    padding: 4,
  },
  button: {
    backgroundColor: "#3edb17",
    borderRadius: 12,
    height: 56,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: "#93C5FD",
  },
  buttonText: {
    color: "black",
    fontSize: 18,
    fontWeight: "600",
    marginRight: 8,
  },
  buttonRow: {
    flexDirection: "column",
    marginTop: 20,
  },
  backButtonSmall: {
    flex: 1,
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
    height: 56,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  backButtonText: {
    color: "black",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  loginText: {
    fontSize: 16,
    color: "#6B7280",
  },
  loginLink: {
    fontSize: 16,
    color: "black",
    fontWeight: "600",
  },
});
