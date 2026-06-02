import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StripeProvider } from "@stripe/stripe-react-native";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import BookingForm from "./components/BookingForm";
import PaymentScreen from "./components/PaymentScreen";
import ServiceDetails from "./components/ServiceDetails";
import Time from "./components/Time";
import { AuthProvider, useAuth } from "./context/AuthContext";
import CreateReviewScreen from "./screens/CreateReviewScreen";
import { GymProvider } from "./context/GymContext";
import AdminDashboard from "./screens/AdminDashboard";
import AdminLoginScreen from "./screens/AdminLoginScreen";
import CustomerBookingDetailScreen from "./screens/CustomerBookingDetailScreen";
import CustomerBookingHistoryScreen from "./screens/CustomerBookingHistoryScreen";
import CustomerPaymentHistoryScreen from "./screens/CustomerPaymentHistoryScreen";
import HomeScreen from "./screens/HomeScreen";
import OtpVerificationScreen from "./screens/OtpVerificationScreen";
import OwnerDashboard from "./screens/OwnerDashboard";
import OwnerLoginScreen from "./screens/OwnerLoginScreen";
import OwnerRegisterScreen from "./screens/OwnerRegisterScreen";
import TournamentListScreen from "./screens/TournamentListScreen";

const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

if (!STRIPE_PUBLISHABLE_KEY) {
  console.warn("Stripe key is missing");
}

const Stack = createNativeStackNavigator();

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#111827" />
    </View>
  );
}

function MainNavigator() {
  const { isBootstrapping, isAuthenticated, role } = useAuth();

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  const stackKey = isAuthenticated ? role || "authenticated" : "guest";
  const initialRouteName =
    role === "owner"
      ? "OwnerDashboard"
      : role === "admin"
        ? "AdminDashboard"
        : "Home";

  return (
    <Stack.Navigator key={stackKey} initialRouteName={initialRouteName}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Home Page" }}
      />
      <Stack.Screen
        name="ServiceDetails"
        component={ServiceDetails}
        options={{ title: "Service Details" }}
      />
      <Stack.Screen
        name="BookingForm"
        component={BookingForm}
        options={{ title: "Booking Form" }}
      />
      <Stack.Screen
        name="Time"
        component={Time}
        options={{ title: "Select Time" }}
      />
      <Stack.Screen
        name="PaymentScreen"
        component={PaymentScreen}
        options={{ title: "Payment" }}
      />
      <Stack.Screen
        name="CustomerBookingHistory"
        component={CustomerBookingHistoryScreen}
        options={{ title: "Booking History" }}
      />
      <Stack.Screen
        name="CustomerBookingDetail"
        component={CustomerBookingDetailScreen}
        options={{ title: "Booking Detail" }}
      />
      <Stack.Screen
        name="CustomerPaymentHistory"
        component={CustomerPaymentHistoryScreen}
        options={{ title: "Payment History" }}
      />
      <Stack.Screen
        name="CreateReview"
        component={CreateReviewScreen}
        options={{ title: "Write Review" }}
      />
      <Stack.Screen
        name="Tournaments"
        component={TournamentListScreen}
        options={{ title: "Tournaments" }}
      />

      <Stack.Screen
        name="OwnerLogin"
        component={OwnerLoginScreen}
        options={{
          title: "Owner Login",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="OwnerRegister"
        component={OwnerRegisterScreen}
        options={{
          title: "Register",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="OtpVerification"
        component={OtpVerificationScreen}
        options={{
          title: "Verify Email",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AdminLogin"
        component={AdminLoginScreen}
        options={{
          title: "Admin Login",
          headerShown: false,
        }}
      />

      {isAuthenticated && role === "owner" && (
        <Stack.Screen
          name="OwnerDashboard"
          component={OwnerDashboard}
          options={{
            title: "Dashboard",
            headerShown: false,
          }}
        />
      )}

      {isAuthenticated && role === "admin" && (
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboard}
          options={{
            title: "Admin Dashboard",
            headerShown: false,
          }}
        />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <GymProvider>
        <AuthProvider>
          <MainNavigator />
        </AuthProvider>
      </GymProvider>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
});
