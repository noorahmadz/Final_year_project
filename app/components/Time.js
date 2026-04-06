import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useGym } from "../context/GymContext";

// Helper function to calculate end time based on start time and duration
const calculateEndTime = (startTime, durationMinutes) => {
  if (!startTime) return null;

  // Handle if startTime is an object (timeSlot) or string
  const timeString =
    typeof startTime === "string" ? startTime : startTime.start;

  if (!timeString || typeof timeString !== "string") return null;

  // Parse the time string (format: "12:00 AM")
  const parts = timeString.split(" ");
  if (parts.length < 2) return null;

  const [timePart, period] = parts;
  const [hours, minutes] = timePart.split(":").map(Number);

  // Convert to 24-hour format
  let hours24 = hours;
  if (period === "AM" && hours === 12) {
    hours24 = 0;
  } else if (period === "PM" && hours !== 12) {
    hours24 = hours + 12;
  }

  // Add duration
  const totalMinutes = hours24 * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;

  // Convert back to 12-hour format
  const endPeriod = endHours >= 12 ? "PM" : "AM";
  let displayHours = endHours % 12;
  if (displayHours === 0) displayHours = 12;

  return `${displayHours}:${endMinutes.toString().padStart(2, "0")} ${endPeriod}`;
};

// Helper function to generate time slots based on duration
const generateTimeSlots = (
  durationMinutes,
  baseStartHour = 6,
  baseEndHour = 20,
  priceIntervals = null,
) => {
  const slots = [];
  const startHour = baseStartHour; // 6 AM
  const endHour = baseEndHour; // 8 PM

  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += durationMinutes) {
      // Calculate start time
      const startHours24 = hour;
      const startMins = minute;

      // Calculate end time
      const totalStartMins = hour * 60 + minute;
      const totalEndMins = totalStartMins + durationMinutes;

      if (totalEndMins > endHour * 60) break;

      const endHours24 = Math.floor(totalEndMins / 60);
      const endMins = totalEndMins % 60;

      // Convert to 12-hour format
      const startPeriod = startHours24 >= 12 ? "PM" : "AM";
      let startDisplayHours = startHours24 % 12;
      if (startDisplayHours === 0) startDisplayHours = 12;

      const endPeriod = endHours24 >= 12 ? "PM" : "AM";
      let endDisplayHours = endHours24 % 12;
      if (endDisplayHours === 0) endDisplayHours = 12;

      const startTime = `${startDisplayHours}:${startMins.toString().padStart(2, "0")} ${startPeriod}`;
      const endTime = `${endDisplayHours}:${endMins.toString().padStart(2, "0")} ${endPeriod}`;

      // Calculate price - use price intervals if available
      let slotPrice;
      if (priceIntervals && priceIntervals.length > 0) {
        // Find the interval that contains this hour
        const interval = priceIntervals.find(
          (i) => startHours24 >= i.startHour && startHours24 < i.endHour,
        );
        if (interval && interval.price) {
          // Use the interval price directly (already calculated for the selected duration)
          slotPrice = interval.price;
        } else {
          // Fallback to default calculation
          slotPrice = 2500 * (durationMinutes / 30);
        }
      } else {
        // Default pricing based on time of day
        let basePrice = 2500; // Default base price
        if (startHours24 < 8) basePrice = 1500;
        else if (startHours24 < 10) basePrice = 1800;
        else if (startHours24 < 12) basePrice = 2000;
        else if (startHours24 < 14) basePrice = 3000;
        else if (startHours24 < 18) basePrice = 2500;
        else basePrice = 3500;

        slotPrice = basePrice * (durationMinutes / 30);
      }

      slots.push({
        start: startTime,
        end: endTime,
        price: Math.round(slotPrice),
      });
    }
  }

  return slots;
};

const Time = ({ route, navigation }) => {
  const {
    court,
    duration,
    date,
    time,
    price,
    priceIntervals,
    gymId,
    originalPrice,
    appliedDiscount,
  } = route.params;
  const { getBookingsForCourtAndDate, getActiveDiscounts } = useGym();

  // Get booked time slots for this court and date
  const bookedTimeSlots = getBookingsForCourtAndDate(gymId, court, date) || [];

  // Helper function to convert time string to minutes since midnight
  const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== "string") return null;

    const parts = timeStr.trim().split(" ");
    if (parts.length < 2) return null;

    const [timePart, period] = parts;
    const [hours, minutes] = timePart.split(":").map(Number);

    if (isNaN(hours) || isNaN(minutes)) return null;

    let hours24 = hours;
    if (period === "AM" && hours === 12) {
      hours24 = 0;
    } else if (period === "PM" && hours !== 12) {
      hours24 = hours + 12;
    }

    return hours24 * 60 + minutes;
  };

  // Helper function to check if a time slot is already booked
  const isTimeSlotBooked = (timeSlot) => {
    return bookedTimeSlots.some((booking) => {
      // Parse the booking time (format: "7:00 PM - 7:30 PM")
      const bookingTimeParts = booking.time ? booking.time.split(" - ") : [];
      if (bookingTimeParts.length !== 2) return false;

      const bookingStart = bookingTimeParts[0].trim();
      const bookingEnd = bookingTimeParts[1].trim();

      // Convert times to minutes for proper comparison
      const slotStartMins = timeToMinutes(timeSlot.start);
      const slotEndMins = timeToMinutes(timeSlot.end);
      const bookStartMins = timeToMinutes(bookingStart);
      const bookEndMins = timeToMinutes(bookingEnd);

      // If any time conversion fails, fall back to false
      if (
        slotStartMins === null ||
        slotEndMins === null ||
        bookStartMins === null ||
        bookEndMins === null
      ) {
        return false;
      }

      // Check if the time slot overlaps with the booked time
      return (
        (slotStartMins >= bookStartMins && slotStartMins < bookEndMins) ||
        (slotEndMins > bookStartMins && slotEndMins <= bookEndMins) ||
        (slotStartMins <= bookStartMins && slotEndMins >= bookEndMins)
      );
    });
  };

  // Get active discounts for the gym
  const activeDiscounts = getActiveDiscounts(gymId);
  const percentageDiscount = activeDiscounts.find(
    (d) => d.type === "percentage",
  );

  // Calculate prices when time is selected
  const getPriceInfo = () => {
    if (!selectedTime) return null;

    const originalSlotPrice = selectedTime.price;
    let discountedSlotPrice = originalSlotPrice;
    let discountPercent = 0;

    if (percentageDiscount) {
      discountPercent = percentageDiscount.value;
      discountedSlotPrice = Math.round(
        originalSlotPrice * (1 - discountPercent / 100),
      );
    }

    return {
      originalPrice: originalSlotPrice,
      discountPercent: discountPercent,
      totalPrice: discountedSlotPrice,
    };
  };

  // Use price from ServiceDetails, fallback to calculated price if not available
  const baseTotalPrice = price || duration * (3600 / 60);

  // Get price info after selectedTime changes
  const priceInfo = getPriceInfo();

  // Helper function to get price for a specific hour from price intervals
  const getPriceForHour = (hour) => {
    if (!priceIntervals || priceIntervals.length === 0) {
      return null; // No custom pricing
    }
    // Find the interval that contains this hour
    const interval = priceIntervals.find(
      (i) => hour >= i.startHour && hour < i.endHour,
    );
    return interval ? interval.price : null;
  };

  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedYear, setSelectedYear] = useState("2026");
  const [selectedDay, setSelectedDay] = useState(null);

  // Times with 30-minute intervals and different prices for each day
  const timesByDay = {
    Sun: [
      { start: "6:00 AM", end: "6:30 AM", price: 1500 },
      { start: "6:30 AM", end: "7:00 AM", price: 1500 },
      { start: "7:00 AM", end: "7:30 AM", price: 1800 },
      { start: "7:30 AM", end: "8:00 AM", price: 1800 },
      { start: "8:00 AM", end: "8:30 AM", price: 2000 },
      { start: "8:30 AM", end: "9:00 AM", price: 2000 },
      { start: "9:00 AM", end: "9:30 AM", price: 2500 },
      { start: "9:30 AM", end: "10:00 AM", price: 2500 },
      { start: "10:00 AM", end: "10:30 AM", price: 2500 },
      { start: "10:30 AM", end: "11:00 AM", price: 2500 },
      { start: "11:00 AM", end: "11:30 AM", price: 2500 },
      { start: "11:30 AM", end: "12:00 PM", price: 2500 },
      { start: "12:00 PM", end: "12:30 PM", price: 3000 },
      { start: "12:30 PM", end: "1:00 PM", price: 3000 },
      { start: "1:00 PM", end: "1:30 PM", price: 2500 },
      { start: "1:30 PM", end: "2:00 PM", price: 2500 },
      { start: "2:00 PM", end: "2:30 PM", price: 2500 },
      { start: "2:30 PM", end: "3:00 PM", price: 2500 },
      { start: "3:00 PM", end: "3:30 PM", price: 2500 },
      { start: "3:30 PM", end: "4:00 PM", price: 2500 },
      { start: "4:00 PM", end: "4:30 PM", price: 3000 },
      { start: "4:30 PM", end: "5:00 PM", price: 3000 },
      { start: "5:00 PM", end: "5:30 PM", price: 3500 },
      { start: "5:30 PM", end: "6:00 PM", price: 3500 },
    ],
    Mon: [
      { start: "7:00 AM", end: "7:30 AM", price: 1800 },
      { start: "7:30 AM", end: "8:00 AM", price: 1800 },
      { start: "8:00 AM", end: "8:30 AM", price: 2000 },
      { start: "8:30 AM", end: "9:00 AM", price: 2000 },
      { start: "9:00 AM", end: "9:30 AM", price: 2500 },
      { start: "9:30 AM", end: "10:00 AM", price: 2500 },
      { start: "10:00 AM", end: "10:30 AM", price: 2500 },
      { start: "10:30 AM", end: "11:00 AM", price: 2500 },
      { start: "11:00 AM", end: "11:30 AM", price: 2500 },
      { start: "11:30 AM", end: "12:00 PM", price: 2500 },
      { start: "12:00 PM", end: "12:30 PM", price: 3000 },
      { start: "12:30 PM", end: "1:00 PM", price: 3000 },
      { start: "1:00 PM", end: "1:30 PM", price: 2500 },
      { start: "1:30 PM", end: "2:00 PM", price: 2500 },
      { start: "2:00 PM", end: "2:30 PM", price: 2500 },
      { start: "2:30 PM", end: "3:00 PM", price: 2500 },
      { start: "3:00 PM", end: "3:30 PM", price: 2500 },
      { start: "3:30 PM", end: "4:00 PM", price: 2500 },
      { start: "4:00 PM", end: "4:30 PM", price: 3000 },
      { start: "4:30 PM", end: "5:00 PM", price: 3000 },
      { start: "5:00 PM", end: "5:30 PM", price: 3500 },
      { start: "5:30 PM", end: "6:00 PM", price: 3500 },
      { start: "6:00 PM", end: "6:30 PM", price: 3500 },
      { start: "6:30 PM", end: "7:00 PM", price: 3500 },
    ],
    Tue: [
      { start: "6:00 AM", end: "6:30 AM", price: 1500 },
      { start: "6:30 AM", end: "7:00 AM", price: 1500 },
      { start: "7:00 AM", end: "7:30 AM", price: 1800 },
      { start: "7:30 AM", end: "8:00 AM", price: 1800 },
      { start: "8:00 AM", end: "8:30 AM", price: 2000 },
      { start: "8:30 AM", end: "9:00 AM", price: 2000 },
      { start: "9:00 AM", end: "9:30 AM", price: 2500 },
      { start: "9:30 AM", end: "10:00 AM", price: 2500 },
      { start: "10:00 AM", end: "10:30 AM", price: 2500 },
      { start: "10:30 AM", end: "11:00 AM", price: 2500 },
      { start: "11:00 AM", end: "11:30 AM", price: 2500 },
      { start: "11:30 AM", end: "12:00 PM", price: 2500 },
      { start: "12:00 PM", end: "12:30 PM", price: 3000 },
      { start: "12:30 PM", end: "1:00 PM", price: 3000 },
      { start: "1:00 PM", end: "1:30 PM", price: 2500 },
      { start: "1:30 PM", end: "2:00 PM", price: 2500 },
      { start: "2:00 PM", end: "2:30 PM", price: 2500 },
      { start: "2:30 PM", end: "3:00 PM", price: 2500 },
      { start: "3:00 PM", end: "3:30 PM", price: 2500 },
      { start: "3:30 PM", end: "4:00 PM", price: 2500 },
      { start: "4:00 PM", end: "4:30 PM", price: 3000 },
      { start: "4:30 PM", end: "5:00 PM", price: 3000 },
      { start: "5:00 PM", end: "5:30 PM", price: 3500 },
      { start: "5:30 PM", end: "6:00 PM", price: 3500 },
    ],
    Wed: [
      { start: "7:00 AM", end: "7:30 AM", price: 1800 },
      { start: "7:30 AM", end: "8:00 AM", price: 1800 },
      { start: "8:00 AM", end: "8:30 AM", price: 2000 },
      { start: "8:30 AM", end: "9:00 AM", price: 2000 },
      { start: "9:00 AM", end: "9:30 AM", price: 2500 },
      { start: "9:30 AM", end: "10:00 AM", price: 2500 },
      { start: "10:00 AM", end: "10:30 AM", price: 2500 },
      { start: "10:30 AM", end: "11:00 AM", price: 2500 },
      { start: "11:00 AM", end: "11:30 AM", price: 2500 },
      { start: "11:30 AM", end: "12:00 PM", price: 2500 },
      { start: "12:00 PM", end: "12:30 PM", price: 3000 },
      { start: "12:30 PM", end: "1:00 PM", price: 3000 },
      { start: "1:00 PM", end: "1:30 PM", price: 2500 },
      { start: "1:30 PM", end: "2:00 PM", price: 2500 },
      { start: "2:00 PM", end: "2:30 PM", price: 2500 },
      { start: "2:30 PM", end: "3:00 PM", price: 2500 },
      { start: "3:00 PM", end: "3:30 PM", price: 2500 },
      { start: "3:30 PM", end: "4:00 PM", price: 2500 },
      { start: "4:00 PM", end: "4:30 PM", price: 3000 },
      { start: "4:30 PM", end: "5:00 PM", price: 3000 },
      { start: "5:00 PM", end: "5:30 PM", price: 3500 },
      { start: "5:30 PM", end: "6:00 PM", price: 3500 },
      { start: "6:00 PM", end: "6:30 PM", price: 3500 },
      { start: "6:30 PM", end: "7:00 PM", price: 3500 },
    ],
    Thu: [
      { start: "6:00 AM", end: "6:30 AM", price: 1500 },
      { start: "6:30 AM", end: "7:00 AM", price: 1500 },
      { start: "7:00 AM", end: "7:30 AM", price: 1800 },
      { start: "7:30 AM", end: "8:00 AM", price: 1800 },
      { start: "8:00 AM", end: "8:30 AM", price: 2000 },
      { start: "8:30 AM", end: "9:00 AM", price: 2000 },
      { start: "9:00 AM", end: "9:30 AM", price: 2500 },
      { start: "9:30 AM", end: "10:00 AM", price: 2500 },
      { start: "10:00 AM", end: "10:30 AM", price: 2500 },
      { start: "10:30 AM", end: "11:00 AM", price: 2500 },
      { start: "11:00 AM", end: "11:30 AM", price: 2500 },
      { start: "11:30 AM", end: "12:00 PM", price: 2500 },
      { start: "12:00 PM", end: "12:30 PM", price: 3000 },
      { start: "12:30 PM", end: "1:00 PM", price: 3000 },
      { start: "1:00 PM", end: "1:30 PM", price: 2500 },
      { start: "1:30 PM", end: "2:00 PM", price: 2500 },
      { start: "2:00 PM", end: "2:30 PM", price: 2500 },
      { start: "2:30 PM", end: "3:00 PM", price: 2500 },
      { start: "3:00 PM", end: "3:30 PM", price: 2500 },
      { start: "3:30 PM", end: "4:00 PM", price: 2500 },
      { start: "4:00 PM", end: "4:30 PM", price: 3000 },
      { start: "4:30 PM", end: "5:00 PM", price: 3000 },
      { start: "5:00 PM", end: "5:30 PM", price: 3500 },
      { start: "5:30 PM", end: "6:00 PM", price: 3500 },
    ],
    Fri: [
      { start: "7:00 AM", end: "7:30 AM", price: 1800 },
      { start: "7:30 AM", end: "8:00 AM", price: 1800 },
      { start: "8:00 AM", end: "8:30 AM", price: 2000 },
      { start: "8:30 AM", end: "9:00 AM", price: 2000 },
      { start: "9:00 AM", end: "9:30 AM", price: 2500 },
      { start: "9:30 AM", end: "10:00 AM", price: 2500 },
      { start: "10:00 AM", end: "10:30 AM", price: 2500 },
      { start: "10:30 AM", end: "11:00 AM", price: 2500 },
      { start: "11:00 AM", end: "11:30 AM", price: 2500 },
      { start: "11:30 AM", end: "12:00 PM", price: 2500 },
      { start: "12:00 PM", end: "12:30 PM", price: 3000 },
      { start: "12:30 PM", end: "1:00 PM", price: 3000 },
      { start: "1:00 PM", end: "1:30 PM", price: 2500 },
      { start: "1:30 PM", end: "2:00 PM", price: 2500 },
      { start: "2:00 PM", end: "2:30 PM", price: 2500 },
      { start: "2:30 PM", end: "3:00 PM", price: 2500 },
      { start: "3:00 PM", end: "3:30 PM", price: 2500 },
      { start: "3:30 PM", end: "4:00 PM", price: 2500 },
      { start: "4:00 PM", end: "4:30 PM", price: 3000 },
      { start: "4:30 PM", end: "5:00 PM", price: 3000 },
      { start: "5:00 PM", end: "5:30 PM", price: 3500 },
      { start: "5:30 PM", end: "6:00 PM", price: 3500 },
      { start: "6:00 PM", end: "6:30 PM", price: 3500 },
      { start: "6:30 PM", end: "7:00 PM", price: 3500 },
    ],
    Sat: [
      { start: "6:00 AM", end: "6:30 AM", price: 1500 },
      { start: "6:30 AM", end: "7:00 AM", price: 1500 },
      { start: "7:00 AM", end: "7:30 AM", price: 1800 },
      { start: "7:30 AM", end: "8:00 AM", price: 1800 },
      { start: "8:00 AM", end: "8:30 AM", price: 2000 },
      { start: "8:30 AM", end: "9:00 AM", price: 2000 },
      { start: "9:00 AM", end: "9:30 AM", price: 2500 },
      { start: "9:30 AM", end: "10:00 AM", price: 2500 },
      { start: "10:00 AM", end: "10:30 AM", price: 2500 },
      { start: "10:30 AM", end: "11:00 AM", price: 2500 },
      { start: "11:00 AM", end: "11:30 AM", price: 2500 },
      { start: "11:30 AM", end: "12:00 PM", price: 2500 },
      { start: "12:00 PM", end: "12:30 PM", price: 3000 },
      { start: "12:30 PM", end: "1:00 PM", price: 3000 },
      { start: "1:00 PM", end: "1:30 PM", price: 2500 },
      { start: "1:30 PM", end: "2:00 PM", price: 2500 },
      { start: "2:00 PM", end: "2:30 PM", price: 2500 },
      { start: "2:30 PM", end: "3:00 PM", price: 2500 },
      { start: "3:00 PM", end: "3:30 PM", price: 2500 },
      { start: "3:30 PM", end: "4:00 PM", price: 2500 },
      { start: "4:00 PM", end: "4:30 PM", price: 3000 },
      { start: "4:30 PM", end: "5:00 PM", price: 3000 },
      { start: "5:00 PM", end: "5:30 PM", price: 3500 },
      { start: "5:30 PM", end: "6:00 PM", price: 3500 },
      { start: "6:00 PM", end: "6:30 PM", price: 3500 },
      { start: "6:30 PM", end: "7:00 PM", price: 3500 },
      { start: "7:00 PM", end: "7:30 PM", price: 4000 },
      { start: "7:30 PM", end: "8:00 PM", price: 4000 },
    ],
  };

  // Generate time slots based on the duration and price intervals
  const dynamicTimeSlots = generateTimeSlots(duration, 6, 20, priceIntervals);

  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);

  // Calculate end time based on selected time and duration
  const endTime = calculateEndTime(selectedTime, duration);

  const handleConfirm = () => {
    if (!selectedTime) return;

    const priceData = getPriceInfo();

    navigation?.navigate("BookingForm", {
      gymId: gymId,
      court: court,
      duration: duration,
      date: date,
      time: `${selectedTime.start} - ${selectedTime.end}`,
      price: priceData ? priceData.totalPrice : selectedTime.price,
      originalPrice: selectedTime.price,
      discountPercent: priceData ? priceData.discountPercent : 0,
    });
  };

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekDates = [8, 9, 10, 11, 12, 13, 14];

  // Get times - use dynamic slots based on duration
  const currentTimes = dynamicTimeSlots;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {/* {`${selectedYear}, March - ${duration} Minutes`} */}
        {` ${duration} Minutes`}
      </Text>
      {/* this is the start comment of the weak day */}
      {/* <Picker
        selectedValue={selectedYear}
        style={styles.picker}
        onValueChange={(itemValue) => setSelectedYear(itemValue)}
      >
        <Picker.Item label="2026" value="2026" />
        <Picker.Item label="2027" value="2027" />
        <Picker.Item label="2028" value="2028" />
        <Picker.Item label="2029" value="2029" />
        <Picker.Item label="2030" value="2030" />
      </Picker> */}

      {/* <View style={styles.weekdayContainer}>
        {days.map((day, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => {
              setSelectedDay(day);
              setSelectedTime(null); // Reset time when day changes
            }}
          >
            <Text
              style={[
                styles.dayText,
                selectedDay === day && styles.selectedDayText,
              ]}
            >
              {day}
            </Text>
          </TouchableOpacity>
        ))}
      </View> */}
      {/* <View style={styles.dateContainer}>
        {weekDates.map((date, index) => (
          <Text key={index} style={styles.dateText}>
            {date}
          </Text>
        ))}
      </View> */}
      {/* this is the start comment of the weak day */}

      <Text style={styles.selectText}>Select A Time Slot</Text>
      <ScrollView style={styles.timeContainer}>
        {currentTimes.map((timeSlot, index) => {
          const isBooked = isTimeSlotBooked(timeSlot);
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.timeButton,
                selectedTime?.start === timeSlot.start &&
                  selectedTime?.end === timeSlot.end &&
                  styles.selectedButton,
                selectedTime &&
                  !(
                    selectedTime.start === timeSlot.start &&
                    selectedTime.end === timeSlot.end
                  ) &&
                  styles.disabledButton,
                isBooked && styles.bookedButton,
              ]}
              onPress={() => {
                if (isBooked) return; // Don't allow selection of booked slots
                // Check if this specific time slot is already selected (by value)
                const isAlreadySelected =
                  selectedTime &&
                  selectedTime.start === timeSlot.start &&
                  selectedTime.end === timeSlot.end;

                if (isAlreadySelected) {
                  setSelectedTime(null); // Deselect
                } else {
                  setSelectedTime(timeSlot); // Select this slot (replaces any existing selection)
                }
              }}
              disabled={
                isBooked ||
                (selectedTime !== null &&
                  !(
                    selectedTime.start === timeSlot.start &&
                    selectedTime.end === timeSlot.end
                  ))
              }
            >
              <Text style={[styles.timeText, isBooked && styles.bookedText]}>
                {timeSlot.start} - {timeSlot.end}
              </Text>
              <Text style={[styles.priceText, isBooked && styles.bookedText]}>
                {isBooked ? "BOOKED" : `${timeSlot.price.toLocaleString()} AFG`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Show the time interval and price when a time is selected */}
      {selectedTime && (
        <View style={styles.priceInfoContainer}>
          <Text style={styles.intervalText}>
            Time: {selectedTime.start} - {selectedTime.end} ({duration} min)
          </Text>

          {priceInfo && (
            <>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Original Price</Text>
                <Text style={styles.priceValue}>
                  {priceInfo.originalPrice.toLocaleString()} AFG
                </Text>
              </View>

              {priceInfo.discountPercent > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.discountLabel}>
                    Discount ({priceInfo.discountPercent}% off)
                  </Text>
                  <Text style={styles.discountValue}>
                    -
                    {Math.round(
                      (priceInfo.originalPrice * priceInfo.discountPercent) /
                        100,
                    ).toLocaleString()}{" "}
                    AFG
                  </Text>
                </View>
              )}

              <View style={styles.priceRow}>
                <Text style={styles.totalLabel}>Total Price</Text>
                <Text style={styles.totalValue}>
                  {priceInfo.totalPrice.toLocaleString()} AFG
                </Text>
              </View>
            </>
          )}
        </View>
      )}

      {!selectedTime && (
        <Text style={styles.totalText}>
          Total: {baseTotalPrice.toLocaleString()} AFG
        </Text>
      )}
      <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
        <Text style={styles.confirmText}>Confirm Details</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
  },
  header: {
    color: "#FFF",
    fontSize: 24,
    textAlign: "center",
    marginBottom: 10,
  },
  picker: {
    height: 50,
    width: "100%",
    color: "#FFF",
    marginBottom: 20,
  },
  weekdayContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayText: {
    color: "#FFF",
    fontSize: 16,
  },
  selectedDayText: {
    color: "#00FF00",
    fontWeight: "bold",
    fontSize: 18,
  },
  dateContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  dateText: {
    color: "#FFF",
    fontSize: 16,
  },
  selectText: {
    color: "#FFF",
    fontSize: 18,
    marginBottom: 10,
  },
  timeContainer: {
    maxHeight: 200,
    marginBottom: 20,
  },
  timeButton: {
    backgroundColor: "#333",
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  disabledButton: {
    backgroundColor: "#222",
    opacity: 0.5,
  },
  selectedButton: {
    backgroundColor: "#00FF00",
  },
  bookedButton: {
    backgroundColor: "#442222",
    borderWidth: 1,
    borderColor: "#FF0000",
  },
  bookedText: {
    color: "#FF6666",
  },
  timeText: {
    color: "#FFF",
    fontSize: 16,
  },
  priceText: {
    color: "#FFD700",
    fontSize: 14,
    marginTop: 5,
  },
  totalText: {
    color: "#FFF",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  intervalText: {
    color: "#00FF00",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "bold",
  },
  priceInfoContainer: {
    backgroundColor: "#222",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  priceLabel: {
    color: "#FFF",
    fontSize: 16,
  },
  priceValue: {
    color: "#FFD700",
    fontSize: 16,
  },
  discountLabel: {
    color: "#10B981",
    fontSize: 14,
  },
  discountValue: {
    color: "#10B981",
    fontSize: 14,
  },
  totalLabel: {
    color: "#00FF00",
    fontSize: 18,
    fontWeight: "bold",
  },
  totalValue: {
    color: "#00FF00",
    fontSize: 18,
    fontWeight: "bold",
  },
  confirmButton: {
    backgroundColor: "#00FF00",
    padding: 15,
    borderRadius: 5,
    alignItems: "center",
  },
  confirmText: {
    color: "#000",
    fontSize: 18,
  },
});

export default Time;
