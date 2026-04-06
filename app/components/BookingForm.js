import { Button, StyleSheet, Text, View } from "react-native";
import { useGym } from "../context/GymContext";

export default function BookingForm({ route, navigation }) {
  const {
    gymId,
    court,
    duration,
    date,
    time,
    price,
    originalPrice,
    discountPercent,
  } = route.params;
  const { getActiveDiscounts } = useGym();

  // Use the passed discount info, otherwise calculate from context
  const getDiscountedPrice = () => {
    // If we already have discounted price passed, use it
    if (price !== originalPrice && discountPercent > 0) {
      return price;
    }

    // Otherwise calculate from context
    const activeDiscounts = getActiveDiscounts(gymId);
    if (activeDiscounts.length === 0) return price;

    // Find applicable discounts (either all courts or specific court)
    const applicableDiscounts = activeDiscounts.filter(
      (discount) =>
        discount.courts.length === 0 || discount.courts.includes(court),
    );

    if (applicableDiscounts.length === 0) return price;

    // For simplicity, apply the first discount (could be improved to apply the best)
    const discount = applicableDiscounts[0];
    if (discount.type === "percentage") {
      return Math.round(price * (1 - discount.value / 100));
    } else {
      return Math.max(0, price - discount.value);
    }
  };

  const discountedPrice = getDiscountedPrice();
  const hasDiscount = originalPrice
    ? discountedPrice < originalPrice
    : discountedPrice < price;

  // Note: We don't add the booking here - it's added in PaymentScreen after successful payment
  // This prevents duplicate bookings

  const handleConfirmBooking = () => {
    // Navigate to payment - booking will be created there after successful payment
    navigation.navigate("PaymentScreen", {
      gymId: gymId,
      court: court,
      duration: duration,
      date: date,
      time: time,
      price: discountedPrice,
      originalPrice: originalPrice || price,
      discountPercent: discountPercent || 0,
      hasDiscount: hasDiscount,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Booking Details</Text>

      <View style={styles.detailCard}>
        <Text style={styles.item}>Court: {court}</Text>
        <Text style={styles.item}>Duration: {duration} Minutes</Text>
        <Text style={styles.item}>Date: {date}</Text>
        <Text style={styles.item}>Time: {time}</Text>
      </View>

      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>Total Price:</Text>
        {hasDiscount && originalPrice ? (
          <View>
            <Text style={styles.priceLabel}>
              originalPrice:{originalPrice} AFG
            </Text>
            <Text style={styles.priceLabel}>{discountedPrice} AFG</Text>
            {discountPercent > 0 && (
              <Text style={styles.priceLabel}>
                {discountPercent}% off applied! (saved{" "}
                {(originalPrice - discountedPrice).toFixed(0)} AFG)
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.priceValue}>{price} AFG</Text>
        )}
      </View>

      <Button title="Pay" color="#3edb17" onPress={handleConfirmBooking} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },

  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
  },

  detailCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  item: {
    fontSize: 18,
    marginBottom: 10,
    color: "#1F2937",
  },

  priceCard: {
    backgroundColor: "#48bd31",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  priceLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
  },

  priceValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  originalPrice: {
    fontSize: 18,
    textDecorationLine: "line-through",
    color: "#9CA3AF",
  },
  discountText: {
    fontSize: 14,
    color: "#10B981",
    fontWeight: "600",
    marginTop: 2,
  },
});
