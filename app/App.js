import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StripeProvider } from "@stripe/stripe-react-native";
import React from "react";

import BookingForm from "./components/BookingForm";
import PaymentScreen from "./components/PaymentScreen";
import ServiceDetails from "./components/ServiceDetails";
import Time from "./components/Time";
import HomeScreen from "./screens/HomeScreen";
import TournamentListScreen from "./screens/TournamentListScreen";

// Owner Screens
import AddGymScreen from "./screens/AddGymScreen";
import OwnerDashboard from "./screens/OwnerDashboard";
import OwnerLoginScreen from "./screens/OwnerLoginScreen";
import OwnerRegisterScreen from "./screens/OwnerRegisterScreen";

// Admin Screens
import AdminDashboard from "./screens/AdminDashboard";
import AdminLoginScreen from "./screens/AdminLoginScreen";

// Context Provider
import { GymProvider } from "./context/GymContext";

const STRIPE_PUBLISHABLE_KEY =
  "pk_test_51TAkUwJaxnZCeAuJ4pfGvUI5ClBQiosRSLIJQk9wlyHSLOmZGInqqqyBjh4RkOIidq2LA3ROfl6AoMXyo3RHo0ct004ItF4QFK";

const Stack = createNativeStackNavigator();

function MainNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home">
      {/* Main App Screens */}
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Home Page" }}
      />
      {/* <Stack.Screen
        name="Services"
        component={ServicesScreen}
        options={{ title: "Services" }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ title: "About Us" }}
      /> */}
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

      {/* Tournament Screen */}
      <Stack.Screen
        name="Tournaments"
        component={TournamentListScreen}
        options={{ title: "Tournaments" }}
      />

      {/* Owner Authentication Screens */}
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
        name="OwnerDashboard"
        component={OwnerDashboard}
        options={{
          title: "Dashboard",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AddGym"
        component={AddGymScreen}
        options={{
          title: "Add Gym",
          headerShown: false,
        }}
      />

      {/* Admin Authentication Screens */}
      <Stack.Screen
        name="AdminLogin"
        component={AdminLoginScreen}
        options={{
          title: "Admin Login",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboard}
        options={{
          title: "Admin Dashboard",
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <GymProvider>
        <MainNavigator />
      </GymProvider>
    </StripeProvider>
  );
}
