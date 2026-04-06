import { CardField, useStripe } from "@stripe/stripe-react-native";
import { useState } from "react";
import {
  Alert,
  Button,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useGym } from "../context/GymContext";

export default function PaymentScreen({ route, navigation }) {
  const {
    court,
    duration,
    date,
    time,
    price,
    gymId,
    originalPrice,
    hasDiscount,
  } = route.params || {};
  const { addBooking } = useGym();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [cardError, setCardError] = useState("");
  const [cardComplete, setCardComplete] = useState(false);
  const { confirmPayment } = useStripe();

  // Note: For full production, fetch real clientSecret from your backend /create-payment-intent
  // For demo/testing, using a test client secret that always succeeds with test cards
  const TEST_CLIENT_SECRET =
    "pi_test_51TAkUwJaxnZCeAuJ_aw12345_secret_xyz_demo_success"; // Replace with real from Stripe Dashboard

  // Validate email
  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  // Handle payment
  const handlePayment = async () => {
    // Validate email
    if (!email.trim()) {
      setEmailError("Email is required");
      return;
    }
    if (!validateEmail(email)) {
      setEmailError("Please enter a valid email");
      return;
    }
    setEmailError("");

    if (!cardComplete) {
      setCardError("Please complete card details");
      return;
    }

    setLoading(true);
    setCardError("");

    try {
      // 1. Confirm payment (creates PaymentMethod internally if using CardField)
      const { error, paymentIntent } = await confirmPayment(
        TEST_CLIENT_SECRET,
        {
          paymentMethodType: "Card",
          paymentMethodData: {
            billingDetails: {
              email: email,
            },
          },
        },
      );

      if (error) {
        console.log("Payment confirmation error", error);
        setCardError(error.message || "Payment failed");
        setLoading(false);
        return;
      }

      // 2. Payment succeeded - create booking with Stripe data
      const newBooking = addBooking({
        gymId: gymId,
        court: court,
        duration: duration,
        date: date,
        time: time,
        price: price,
        status: "confirmed",
        customerEmail: email,
        paymentStatus: "succeeded",
        stripePaymentIntentId: paymentIntent?.id || "test_pi",
        stripePaymentMethodId: paymentIntent?.paymentMethod?.id || "test_pm",
        bookedAt: new Date().toISOString(),
      });

      setLoading(false);
      Alert.alert(
        "Payment Successful!",
        `✅ Your booking for ${court} has been confirmed!\n\nReceipt sent to: ${email}\n\nDetails:\n• Court: ${court}\n• Date: ${date}\n• Time: ${time}\n• Amount: ${price} AFG\n• Stripe ID: ${paymentIntent?.id || "test"}`,
        [{ text: "OK", onPress: () => navigation.navigate("Home") }],
      );
    } catch (error) {
      setLoading(false);
      setCardError("Payment processing failed. Try again.");
      console.error("Payment error:", error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Booking Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.title}>Booking Summary</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Court:</Text>
            <Text style={styles.value}>{court || "N/A"}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Duration:</Text>
            <Text style={styles.value}>{duration || 0} Minutes</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Date:</Text>
            <Text style={styles.value}>{date || "N/A"}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Time:</Text>
            <Text style={styles.value}>{time || "N/A"}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>{price || 0} AFG</Text>
          </View>
        </View>

        {/* Email Input */}
        <View style={styles.inputCard}>
          <Text style={styles.sectionTitle}>Your Email</Text>
          <Text style={styles.subtitle}>
            Receipt will be sent to this email
          </Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            placeholder="Enter your email"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError("");
            }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {emailError ? (
            <Text style={styles.errorText}>{emailError}</Text>
          ) : null}
        </View>

        {/* Stripe Card Field */}
        <View style={styles.cardCard}>
          <Text style={styles.sectionTitle}>Card Details</Text>
          <Text style={styles.subtitle}>Securely powered by Stripe</Text>

          <CardField
            postalCodeEnabled={true}
            autofocus={true}
            cardStyle={{
              backgroundColor: "#F9FAFB",
              borderWidth: 1,
              borderColor: "#D1D5DB",
              borderRadius: 8,
            }}
            style={{ width: "100%", height: 55, marginVertical: 10 }}
            onCardChange={(cardDetails) => {
              setCardComplete(cardDetails.complete);
              setCardError("");
            }}
            onFocus={() => setCardError("")}
          />
          {cardError ? <Text style={styles.errorText}>{cardError}</Text> : null}
        </View>

        {/* Test Card Info */}
        <View style={styles.testCardInfo}>
          <Text style={styles.testCardTitle}>Stripe Test Cards</Text>
          <Text style={styles.testCardText}>
            • 4242 4242 4242 4242 (Success)
          </Text>
          <Text style={styles.testCardText}>
            • 4000 0000 0000 0002 (Decline)
          </Text>
          <Text style={styles.testCardText}>Any future expiry/CVC</Text>
        </View>

        {/* Pay Button */}
        <View style={styles.buttonContainer}>
          <Button
            title={loading ? "Processing..." : `Pay Securely ${price || 0} AFG`}
            onPress={handlePayment}
            disabled={loading || !cardComplete}
            color="#48bd31"
          />
        </View>

        {/* Back Button */}
        <View style={styles.backButtonContainer}>
          <Button
            title="Back to Booking"
            onPress={() => navigation.goBack()}
            disabled={loading}
            color="#6B7280"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  label: {
    fontSize: 16,
    color: "#6B7280",
  },
  value: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
  },
  totalValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#48bd31",
  },
  inputCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: "#1F2937",
  },
  inputError: {
    borderColor: "#EF4444",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 4,
  },
  cardCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  testCardInfo: {
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  testCardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#92400E",
    marginBottom: 4,
  },
  testCardText: {
    fontSize: 12,
    color: "#92400E",
  },
  buttonContainer: {
    marginBottom: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  backButtonContainer: {
    marginBottom: 30,
    borderRadius: 8,
    overflow: "hidden",
  },
});
