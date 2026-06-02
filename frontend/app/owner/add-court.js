import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  createGymField,
  createGymSlot,
  getGymFields,
} from "../api/ownerGymsApi";
import { mapErrorToMessage } from "../utils/errorMapper";



const formatDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
};

const isValidDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
const isValidTimeString = (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value.trim());
// *****************

// ***********************

const build12HourTime = (time, period) => {
  if (!time || typeof time !== "string") return "";

  const [hourPart, minutePart = "00"] = time.split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 1 ||
    hour > 12 ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
};

const formatTimeInput = (value) => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const toMinutesForCompare = (time12) => {
  if (!time12 || typeof time12 !== "string") return null;

  const match = time12.trim().match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }

  if (period === "AM" && hour === 12) hour = 0;
  if (period === "PM" && hour !== 12) hour += 12;

  return hour * 60 + minute;
};

const toMinutesFrom24Hour = (time24) => {
  if (!time24 || typeof time24 !== "string") return null;

  const match = time24.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
};

const getWeekday = (date) => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date(date).getDay()];
};

const formatDisplayDate = (dateString, locale = "en") => {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const addMinutes = (time, mins = 40) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) {
    return "";
  }

  const [, hours, minutes] = match;
  const date = new Date();
  date.setHours(Number(hours), Number(minutes) + mins, 0, 0);
  return date.toTimeString().slice(0, 5);
};

const getBackendDayOfWeek = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
};

export default function AddCourtScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
    const rtl = ["ps", "fa"].includes(i18n.language);

  const localizedTextStyle = {
    textAlign: rtl ? "right" : "left",
    writingDirection: rtl ? "rtl" : "ltr",
  };

  const scrollViewRef = useRef(null);
  const { gymId, gymName } = useLocalSearchParams();

  const [fieldName, setFieldName] = useState("");
  const [pricePerHour, setPricePerHour] = useState("");
  const [existingCourts, setExistingCourts] = useState([]);
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [businessHours, setBusinessHours] = useState({
    open_time: "",
    close_time: "",
  });
  const [openPeriod, setOpenPeriod] = useState("AM");
  const [closePeriod, setClosePeriod] = useState("PM");
  const [timeSlots, setTimeSlots] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCourts, setLoadingCourts] = useState(true);



  useEffect(() => {
    let mounted = true;

    const loadCourts = async () => {
      if (!gymId) {
        setLoadingCourts(false);
        return;
      }

      try {
        const response = await getGymFields(gymId);
        const courts = Array.isArray(response?.results)
          ? response.results
          : Array.isArray(response)
            ? response
            : [];

        if (!mounted) {
          return;
        }

        setExistingCourts(courts);
        if (courts.length > 0) {
          setSelectedCourt(courts[0]);
        }
      } catch (error) {
        if (!mounted) {
          return;
        }
        Alert.alert(
          t("ownerDashboard.alerts.error"),
          mapErrorToMessage(error).message,
        );
      } finally {
        if (mounted) {
          setLoadingCourts(false);
        }
      }
    };

    loadCourts();

    return () => {
      mounted = false;
    };
  }, [gymId, t]);

  useEffect(() => {
    if (selectedCourt) {
      setPricePerHour(String(selectedCourt?.price_per_hour ?? selectedCourt?.pricePerHour ?? ""));
      return;
    }
    setPricePerHour("");
  }, [selectedCourt]);

  const selectedDay = selectedDate && isValidDateString(selectedDate)
    ? getWeekday(selectedDate)
    : "";

  const getValidatedWorkingHours = () => {
    const openTime12 = build12HourTime(businessHours.open_time, openPeriod);
    const closeTime12 = build12HourTime(businessHours.close_time, closePeriod);

    const openMinutes = toMinutesForCompare(openTime12);
    const closeMinutes = toMinutesForCompare(closeTime12);

    if (!openTime12 || !closeTime12 || openMinutes === null || closeMinutes === null) {
      return { error: t("ownerDashboard.validation.enterValidOpenCloseTimes") };
    }

    if (openMinutes >= closeMinutes) {
      return { error: t("ownerDashboard.validation.openBeforeClose") };
    }

    return {
      openTime12,
      closeTime12,
      openMinutes,
      closeMinutes,
    };
  };

  const updateSlotStart = (index, value) => {
    setTimeSlots((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        start_time: value,
        end_time: addMinutes(value, 40),
      };
      return updated;
    });
  };

  const addTimeSlotRow = () => {
    if (!selectedDate || !isValidDateString(selectedDate)) {
      Alert.alert(
        t("ownerDashboard.alerts.error"),
        t("ownerDashboard.slots.selectValidDateFirst"),
      );
      return;
    }
    if (!businessHours.open_time || !businessHours.close_time) {
      Alert.alert(
        t("ownerDashboard.alerts.error"),
        t("ownerDashboard.slots.setWorkingHoursBeforeAdding"),
      );
      return;
    }

    const workingHours = getValidatedWorkingHours();
    if (workingHours.error) {
      Alert.alert(t("ownerDashboard.alerts.error"), workingHours.error);
      return;
    }

    setTimeSlots((prev) => [
      ...prev,
      {
        date: selectedDate.trim(),
        start_time: "",
        end_time: "",
      },
    ]);
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  const removeTimeSlotRow = (index) => {
    setTimeSlots((prev) => prev.filter((_, slotIndex) => slotIndex !== index));
  };

  const normalizeTimeValue = (value) => value.trim();

  const validateTimeSlots = () => {
    if (timeSlots.length === 0) {
      return { error: null };
    }

    if (!businessHours.open_time || !businessHours.close_time) {
      return { error: t("ownerDashboard.validation.enterValidOpenCloseTimes") };
    }

    const workingHours = getValidatedWorkingHours();
    if (workingHours.error) {
      return { error: workingHours.error };
    }

    const normalized = timeSlots.map((slot) => ({
      ...slot,
      date: slot.date,
      start_time: normalizeTimeValue(slot.start_time),
      end_time: normalizeTimeValue(slot.end_time),
    }));

    for (const slot of normalized) {
      if (!slot.date) {
        return { error: t("ownerDashboard.slots.eachSlotNeedsDate") };
      }
      if (!isValidDateString(slot.date)) {
        return { error: t("ownerDashboard.slots.dateFormatHint") };
      }
      if (!slot.start_time || !isValidTimeString(slot.start_time)) {
        return { error: t("ownerDashboard.slots.startTimeFormatHint") };
      }
      if (!slot.end_time || !isValidTimeString(slot.end_time)) {
        return { error: t("ownerDashboard.slots.endTimeInvalid") };
      }

      const slotStart = toMinutesFrom24Hour(slot.start_time);
      const slotEnd = toMinutesFrom24Hour(slot.end_time);

      if (slotStart === null || slotEnd === null) {
        return { error: t("ownerDashboard.slots.slotTimeInvalid") };
      }
      if (slotStart < workingHours.openMinutes) {
        return { error: t("ownerDashboard.slots.startsBeforeOpening") };
      }
      if (slotEnd > workingHours.closeMinutes) {
        return { error: t("ownerDashboard.slots.endsAfterClosing") };
      }
    }

    return {
      error: null,
      openTime12: workingHours.openTime12,
      closeTime12: workingHours.closeTime12,
    };
  };

  const handleSubmit = async () => {
    if (!gymId) {
      Alert.alert(
        t("ownerDashboard.alerts.error"),
        t("ownerDashboard.validation.selectGym"),
      );
      return;
    }
    if (!selectedCourt && !fieldName.trim()) {
      Alert.alert(
        t("ownerDashboard.alerts.error"),
        t("ownerDashboard.validation.enterCourtName"),
      );
      return;
    }
    const parsedPrice = Number(pricePerHour);
    if (!selectedCourt && (!pricePerHour.trim() || Number.isNaN(parsedPrice) || parsedPrice <= 0)) {
      Alert.alert(
        t("ownerDashboard.alerts.error"),
        t("ownerDashboard.validation.enterPricePerHour"),
      );
      return;
    }

    const { error: timeSlotError, openTime12, closeTime12 } = validateTimeSlots();
    if (timeSlotError) {
      Alert.alert(t("ownerDashboard.alerts.error"), timeSlotError);
      return;
    }

    setSubmitting(true);
    try {
      let fieldId = selectedCourt?.field_id ?? selectedCourt?.id ?? null;

      if (!fieldId) {
        const fieldResponse = await createGymField(gymId, {
          field_name: fieldName.trim(),
          field_type: "futsal",
          capacity: 10,
          price_per_hour: parsedPrice,
          is_available: true,
        });
        fieldId =
          fieldResponse?.field?.field_id ??
          fieldResponse?.field_id ??
          fieldResponse?.field?.id ??
          null;
      }

      if (!fieldId) {
        throw new Error(t("ownerDashboard.courts.fieldIdMissing"));
      }

      const workingHoursPayload = {
        open_time: openTime12,
        close_time: closeTime12,
      };
      void workingHoursPayload;

      for (const slot of timeSlots) {
        await createGymSlot(gymId, {
          field: fieldId,
          day_of_week: getBackendDayOfWeek(slot.date),
          start_time: normalizeTimeValue(slot.start_time),
          end_time: normalizeTimeValue(slot.end_time),
          is_available: true,
        });
      }

      Alert.alert(t("ownerDashboard.alerts.success"), t("ownerDashboard.courts.scheduleSaved"), [
        {
          text: t("ownerDashboard.actions.ok"),
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      Alert.alert(
        t("ownerDashboard.alerts.error"),
        mapErrorToMessage(error).message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scrollViewRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={20} color="#284d9e" />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>
                {t("ownerDashboard.courts.manageCourtSchedule")}
              </Text>
              <Text style={styles.subtitle}>
                {gymName || t("ownerDashboard.courts.selectedGym")}
              </Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
          <Text style={[styles.sectionEyebrow, localizedTextStyle]}>
  {t("ownerDashboard.courts.court")}
</Text>

<Text style={[styles.sectionTitle, localizedTextStyle]}>
  {t("ownerDashboard.courts.selectCourt")}
</Text>
            {loadingCourts ? (
              <Text style={styles.helperText}>
                {t("ownerDashboard.courts.loadingExistingCourts")}
              </Text>
            ) : existingCourts.length > 0 ? (
              <View style={styles.optionList}>
                {existingCourts.map((court) => {
                  const courtId = court?.field_id ?? court?.id;
                  const selectedCourtId = selectedCourt?.field_id ?? selectedCourt?.id;

                  return (
                    <TouchableOpacity
                      key={String(courtId)}
                      style={[
                        styles.courtOption,
                        selectedCourtId === courtId && styles.courtOptionActive,
                      ]}
                      onPress={() => setSelectedCourt(court)}
                    >
                      <View>
                        <Text
                          style={[
                            styles.courtOptionText,
                            selectedCourtId === courtId && styles.courtOptionTextActive,
                          ]}
                        >
                          {court.field_name || court.name || t("ownerDashboard.courts.court")}
                        </Text>
                        <Text style={styles.optionMeta}>
                          {t("ownerDashboard.courts.existingCourt")}
                        </Text>
                      </View>
                      {selectedCourtId === courtId ? (
                        <Ionicons name="checkmark-circle" size={20} color="#2563e9" />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.formGroup}>
                <TextInput
                  style={styles.input}
                  placeholder={t("ownerDashboard.courts.courtName")}
                  value={fieldName}
                  onChangeText={setFieldName}
                  onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                />
              </View>
            )}
          </View>

          {/* <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>
              {t("ownerDashboard.gyms.pricePerHour")}
            </Text>
            <Text style={styles.sectionTitle}>
              {t("ownerDashboard.gyms.pricePerHour")}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("ownerDashboard.validation.enterPricePerHour")}
              value={pricePerHour}
              onChangeText={setPricePerHour}
              keyboardType="numeric"
              onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            />
          </View> */}

          {/* ************* */}
<View style={styles.sectionCard}>
  <Text style={[styles.sectionEyebrow, localizedTextStyle]}>
    {t("ownerDashboard.gyms.pricePerHour")}
  </Text>

  <Text style={[styles.sectionTitle, localizedTextStyle]}>
    {t("ownerDashboard.gyms.pricePerHour")}
  </Text>

  <TextInput
    style={[
      styles.input,
      {
        textAlign: rtl ? "right" : "left",
        writingDirection: "ltr",
      },
    ]}
    textAlign={rtl ? "right" : "left"}
    placeholder={t("ownerDashboard.validation.enterPricePerHour")}
    placeholderTextColor="#999"
    value={pricePerHour}
    onChangeText={setPricePerHour}
    keyboardType="numeric"
    onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
  />
</View>
          {/* ********** */}

          {/* <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>
              {t("ownerDashboard.slots.selectDate")}
            </Text>
            <Text style={styles.sectionTitle}>
              {t("ownerDashboard.slots.selectedDate")}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={selectedDate}
              onChangeText={setSelectedDate}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            />
            <View style={styles.dateBadge}>
              <Ionicons name="calendar-outline" size={16} color="#25630" />
              <Text style={styles.dateBadgeText}>
                {selectedDay && isValidDateString(selectedDate)
                  ? formatDisplayDate(
                      selectedDate,
                      i18n.resolvedLanguage || i18n.language || "en",
                    )
                  : t("ownerDashboard.slots.selectedDateAddValidDate")}
              </Text>
            </View>
          </View> */}

          {/* *********** */}

          <View style={styles.sectionCard}>
  <Text style={[styles.sectionEyebrow, localizedTextStyle]}>
    {t("ownerDashboard.slots.selectDate")}
  </Text>

  <Text style={[styles.sectionTitle, localizedTextStyle]}>
    {t("ownerDashboard.slots.selectedDate")}
  </Text>

  <TextInput
    style={[
      styles.input,
      {
        textAlign: rtl ? "right" : "left",
        writingDirection: "ltr",
      },
    ]}
    textAlign={rtl ? "right" : "left"}
    placeholder="YYYY-MM-DD"
    placeholderTextColor="#999"
    value={selectedDate}
    onChangeText={setSelectedDate}
    autoCapitalize="none"
    autoCorrect={false}
    onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
  />

  <View
    style={[
      styles.dateBadge,
      {
        flexDirection: rtl ? "row-reverse" : "row",
        alignItems: "center",
      },
    ]}
  >
    <Ionicons name="calendar-outline" size={16} color="#25630" />

    <Text
      style={[
        styles.dateBadgeText,
        localizedTextStyle,
        {
          flex: 1,
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "ltr",
        },
      ]}
    >
      {selectedDay && isValidDateString(selectedDate)
        ? formatDisplayDate(
            selectedDate,
            i18n.resolvedLanguage || i18n.language || "en"
          )
        : t("ownerDashboard.slots.selectedDateAddValidDate")}
    </Text>
  </View>
</View>

          {/* ********* */}

          <View style={styles.workingHoursCardModern}>
            <View style={styles.workingHoursHeaderRow}>
              <View style={styles.workingHoursIconBox}>
                <Text style={styles.workingHoursIcon}>🕒</Text>
              </View>

              <View style={styles.workingHoursHeaderText}>
                <Text style={[styles.workingHoursEyebrowModern,localizedTextStyle,
        {
          flex: 1,
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "ltr",
        }, ]}>
                  {t("ownerDashboard.workingHours.eyebrow")}
                </Text>
                <Text style={[styles.workingHoursTitleModern ,localizedTextStyle,
        {
          flex: 1,
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "ltr",
        },]}>
                  {t("ownerDashboard.workingHours.title")}
                </Text>
                {/* <Text style={[styles.workingHoursDescriptionModern,localizedTextStyle,
        {
          flex: 1,
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "ltr",
        }]}>
                  {t("ownerDashboard.workingHours.description")}
                </Text> */}
              </View>
            </View>

            <View style={styles.workingHoursDivider} />


            
            <View style={styles.workingHoursTimesGrid}>
              <View style={styles.workingTimePanel}>
                <View style={styles.workingTimeLabelRow}>
                  
                  <Text style={[styles.workingTimeLabel,localizedTextStyle,
        {
          flex: 1,
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "ltr",
        }]}>
                    {t("ownerDashboard.workingHours.opensAt")}
                  </Text>
                </View>
       
                <View style={styles.workingTimeControlRow}>

                     <View style={styles.timeInputShell}>
                    <Text style={styles.timeInputIcon}>🕘</Text>
                    <TextInput
                      style={styles.workingTimeInput}
                      placeholder="08:00"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      maxLength={5}
                      value={businessHours.open_time}
                      onChangeText={(text) =>
                        setBusinessHours((prev) => ({
                          ...prev,
                          open_time: formatTimeInput(text),
                        }))
                      }
                      onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                    />
                  </View>
               
                  <View style={styles.periodSegmentModern}>
                    {["AM", "PM"].map((period) => (
                      <TouchableOpacity
                        key={period}
                        style={[
                          styles.periodSegmentButton,
                          openPeriod === period &&
                            styles.periodSegmentButtonActive,
                        ]}
                        onPress={() => setOpenPeriod(period)}
                      >
                        <Text
                          style={[
                            styles.periodSegmentText,
                            openPeriod === period &&
                              styles.periodSegmentTextActive,
                          ]}
                        >
                          {t(`ownerDashboard.workingHours.${period.toLowerCase()}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  

                </View>
              </View>

              <View style={styles.workingTimePanel}>
                <View style={styles.workingTimeLabelRow}>
                  
                  <Text style={[styles.workingTimeLabel ,localizedTextStyle,
        {
          flex: 1,
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "ltr",
        }]}>
                    {t("ownerDashboard.workingHours.closesAt")}
                  </Text>
                </View>
{/* work start from this  */}
                <View style={styles.workingTimeControlRow}>
                  <View style={styles.timeInputShell}>
                    <Text style={styles.timeInputIcon}>🕘</Text>
                    <TextInput
                      style={styles.workingTimeInput}
                      placeholder="10:00"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      maxLength={5}
                      value={businessHours.close_time}
                      onChangeText={(text) =>
                        setBusinessHours((prev) => ({
                          ...prev,
                          close_time: formatTimeInput(text),
                        }))
                      }
                      onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                    />
                  </View>

                  <View style={styles.periodSegmentModern}>
                    {["AM", "PM"].map((period) => (
                      <TouchableOpacity
                        key={period}
                        style={[
                          styles.periodSegmentButton,
                          closePeriod === period &&
                            styles.periodSegmentButtonActive,
                          closePeriod === period &&
                            period === "PM" &&
                            styles.periodSegmentButtonDanger,
                        ]}
                        onPress={() => setClosePeriod(period)}
                      >
                        <Text
                          style={[
                            styles.periodSegmentText,
                            closePeriod === period &&
                              styles.periodSegmentTextActive,
                          ]}
                        >
                          {t(`ownerDashboard.workingHours.${period.toLowerCase()}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.workingHoursNoteBox}>
              <View style={styles.noteIconCircle}>
                <Text style={styles.noteIconText
       }>i</Text>
              </View>

              <Text style={styles.noteText}>
                <Text style={[styles.noteTextBold,localizedTextStyle,
        {
          flex: 1,
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "ltr",
        }]}>
                  {t("ownerDashboard.workingHours.noteTitle")}{" "}
                </Text>
                {t("ownerDashboard.workingHours.noteText")}
              </Text>

            
            </View>
          </View>

        

          {/* new */}
          <View style={styles.sectionCard}>
  <View
    style={[
      styles.sectionHeaderRow,
      {
        flexDirection: rtl ? "row-reverse" : "row",
        alignItems: "center",
      },
    ]}
  >
    <View style={{ flex: 1 }}>
      <Text
        style={[
          styles.sectionEyebrow,
          localizedTextStyle,
          {
            textAlign: rtl ? "right" : "left",
            writingDirection: rtl ? "rtl" : "ltr",
          },
        ]}
      >
        {t("ownerDashboard.slots.addTimeSlot")}
      </Text>

      <Text
        style={[
          styles.sectionTitle,
          localizedTextStyle,
          {
            textAlign: rtl ? "right" : "left",
            writingDirection: rtl ? "rtl" : "ltr",
          },
        ]}
      >
        {t("ownerDashboard.slots.bookingTimeSlots")}
      </Text>
    </View>

    <TouchableOpacity
      style={[
        styles.addSlotButton,
        {
          flexDirection: rtl ? "row-reverse" : "row",
          alignItems: "center",
        },
        (!businessHours.open_time || !businessHours.close_time || submitting) &&
          styles.addSlotButtonDisabled,
      ]}
      onPress={addTimeSlotRow}
      disabled={!businessHours.open_time || !businessHours.close_time || submitting}
    >
      <Ionicons name="add" size={18} color="#FFFFFF" />

      <Text
        style={[
          styles.addSlotButtonText,
          {
            textAlign: rtl ? "right" : "left",
            writingDirection: rtl ? "rtl" : "ltr",
          },
        ]}
      >
        {t("ownerDashboard.slots.addTimeSlot")}
      </Text>
    </TouchableOpacity>
  </View>

  {timeSlots.length === 0 ? (
    <View style={styles.emptyState}>
      <Text
        style={[
          styles.emptyStateTitle,
          localizedTextStyle,
          {
            textAlign: rtl ? "right" : "left",
            writingDirection: rtl ? "rtl" : "ltr",
          },
        ]}
      >
        {t("ownerDashboard.slots.noSlots")}
      </Text>

      <Text
        style={[
          styles.emptyStateText,
          localizedTextStyle,
          {
            textAlign: rtl ? "right" : "left",
            writingDirection: rtl ? "rtl" : "ltr",
          },
        ]}
      >
        {t("ownerDashboard.slots.emptyStateDescription")}
      </Text>
    </View>
  ) : (
    timeSlots.map((slot, index) => (
      <View key={index} style={styles.slotCard}>
        <View
          style={[
            styles.slotHeader,
            {
              flexDirection: rtl ? "row-reverse" : "row",
              alignItems: "center",
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.slotDateText,
                {
                  textAlign: rtl ? "right" : "left",
                  writingDirection: "ltr",
                },
              ]}
            >
              {slot.date || selectedDate}
            </Text>

            <Text
              style={[
                styles.slotWeekdayText,
                localizedTextStyle,
                {
                  textAlign: rtl ? "right" : "left",
                  writingDirection: rtl ? "rtl" : "ltr",
                },
              ]}
            >
              {slot.date && isValidDateString(slot.date)
                ? formatDisplayDate(
                    slot.date,
                    i18n.resolvedLanguage || i18n.language || "en"
                  )
                : t("ownerDashboard.slots.datePending")}
            </Text>
          </View>

          <View style={styles.slotBadge}>
            <Text
              style={[
                styles.slotBadgeText,
                {
                  textAlign: "center",
                  writingDirection: rtl ? "rtl" : "ltr",
                },
              ]}
            >
              {t("ownerDashboard.slots.available")}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.slotRow,
            {
              flexDirection: rtl ? "row-reverse" : "row",
              alignItems: "center",
            },
          ]}
        >
          <View style={styles.slotTimeBox}>
            <Text
              style={[
                styles.slotLabel,
                localizedTextStyle,
                {
                  textAlign: rtl ? "right" : "left",
                  writingDirection: rtl ? "rtl" : "ltr",
                },
              ]}
            >
              {t("ownerDashboard.slots.startTime")}
            </Text>

            <TextInput
              style={[
                styles.slotInput,
                {
                  textAlign: rtl ? "right" : "left",
                  writingDirection: "ltr",
                },
              ]}
              textAlign={rtl ? "right" : "left"}
              placeholder="09:00"
              placeholderTextColor="#999"
              value={slot.start_time}
              onChangeText={(text) => updateSlotStart(index, text)}
              onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            />
          </View>

          <View style={styles.slotArrow}>
            <Ionicons
              name={rtl ? "arrow-back" : "arrow-forward"}
              size={18}
              color="#9CA3AF"
            />
          </View>

          <View style={styles.slotTimeBox}>
            <Text
              style={[
                styles.slotLabel,
                localizedTextStyle,
                {
                  textAlign: rtl ? "right" : "left",
                  writingDirection: rtl ? "rtl" : "ltr",
                },
              ]}
            >
              {t("ownerDashboard.slots.endTime")}
            </Text>

            <View style={styles.slotReadOnlyBox}>
              <Text
                style={[
                  styles.slotReadOnlyText,
                  {
                    textAlign: rtl ? "right" : "left",
                    writingDirection: "ltr",
                  },
                ]}
              >
                {slot.end_time || "--:--"}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.removeSlotButton,
            {
              flexDirection: rtl ? "row-reverse" : "row",
              alignItems: "center",
            },
          ]}
          onPress={() => removeTimeSlotRow(index)}
        >
          <Ionicons name="trash-outline" size={16} color="#DC2626" />

          <Text
            style={[
              styles.removeSlotText,
              localizedTextStyle,
              {
                textAlign: rtl ? "right" : "left",
                writingDirection: rtl ? "rtl" : "ltr",
              },
            ]}
          >
            {t("ownerDashboard.slots.removeSlot")}
          </Text>
        </TouchableOpacity>
      </View>
    ))
  )}
</View>

          {/* new */}

          <TouchableOpacity
            style={[styles.saveButton, submitting && styles.saveButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || loadingCourts}
          >
            <Text style={styles.saveButtonText}>
              {submitting
                ? t("ownerDashboard.courts.savingCourtSchedule")
                : t("ownerDashboard.courts.saveCourtSchedule")}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#24a731",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#111827",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#24a731",
    
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#24a731",
    marginBottom: 12,
  },
  helperText: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 14,
    lineHeight: 18,
  },
  optionList: {
    gap: 10,
  },
  courtOption: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  courtOptionActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  courtOptionText: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "700",
    marginBottom: 2,
  },
  courtOptionTextActive: {
    color: "#2563EB",
  },
  optionMeta: {
    fontSize: 12,
    color: "#6B7280",
  },
  formGroup: {
    gap: 2,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
    color: "#111827",
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateBadgeText: {
    marginLeft: 8,
    fontSize: 13,
    color: "#1D4ED8",
    fontWeight: "600",
  },
  workingHoursCardModern: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  workingHoursHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  workingHoursIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  workingHoursIcon: {
    fontSize: 18,
  },
  workingHoursHeaderText: {
    flex: 1,
  },
  workingHoursEyebrowModern: {
    fontSize: 11,
    fontWeight: "900",
    color: "#16A34A",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  workingHoursTitleModern: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  workingHoursDescriptionModern: {
    fontSize: 12,
    color: "red",
    lineHeight: 16,
  },
  workingHoursDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 10,
  },
  workingHoursTimesGrid: {
    gap: 8,
  },
  workingTimePanel: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  workingTimeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  openTimeIcon: {
    fontSize: 16,
    color: "#16A34A",
  },
  closeTimeIcon: {
    fontSize: 16,
    color: "#DC2626",
  },
  workingTimeLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: "#111827",
  },
  workingTimeControlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    
  },
  timeInputShell: {
    flex: 1,
    minWidth: 108,
    height: 42,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  timeInputIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  workingTimeInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
    includeFontPadding: false,
    paddingVertical: 0,
  },
  periodSegmentModern: {
    flexDirection: "row",
    flexShrink: 0,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    overflow: "hidden",
  },
  periodSegmentButton: {
    minWidth: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  periodSegmentButtonActive: {
    backgroundColor: "#24a731",
  },
  periodSegmentButtonDanger: {
  
    backgroundColor: "#24a731",
  },
  periodSegmentText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#6B7280",
  },
  periodSegmentTextActive: {
    color: "#FFFFFF",
  },
  workingHoursNoteBox: {
    marginTop: 10,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noteIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  noteIconText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  noteText: {
    flex: 1,
    fontSize: 11,
    color: "#111827",
    lineHeight: 15,
  },
  noteTextBold: {
    fontWeight: "900",
  },
  noteCalendarIcon: {
    fontSize: 16,
  },
  hoursRow: {
    flexDirection: "row",
    gap: 12,
  },
  hoursColumn: {
    flex: 1,
  },
  timeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timeInput: {
    flex: 1,
    marginBottom: 0,
  },
  periodToggle: {
    flexDirection: "row",
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  periodButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  periodButtonActive: {
    backgroundColor: "#2563EB",
  },
  periodButtonText: {
    color: "#2563EB",
    fontSize: 13,
    fontWeight: "700",
  },
  periodButtonTextActive: {
    color: "#FFFFFF",
  },
  fieldLabel: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  addSlotButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#24a731",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addSlotButtonDisabled: {
    backgroundColor: "#68c96e",
  },
  addSlotButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 4,
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    padding: 18,
    backgroundColor: "#F9FAFB",
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  emptyStateText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  slotCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },
  slotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  slotDateText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  slotWeekdayText: {
    fontSize: 12,
    color: "#6B7280",
  },
  slotBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  slotBadgeText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "700",
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  slotTimeBox: {
    flex: 1,
  },
  slotArrow: {
    paddingHorizontal: 8,
    marginTop: 22,
  },
  slotLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 8,
  },
  slotInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  slotReadOnlyBox: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  slotReadOnlyText: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "600",
  },
  removeSlotButton: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
  },
  removeSlotText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 6,
  },
  saveButton: {
    backgroundColor: "#24a731",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  
  },
});
