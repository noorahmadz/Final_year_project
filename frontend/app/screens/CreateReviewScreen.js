import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { createGymReview } from "../api/gymsApi";
import { mapErrorToMessage } from "../utils/errorMapper";

const PRIMARY_COLOR = "#24a731";
const PRIMARY_DARK = "#1B7F26";
const PRIMARY_TINT = "#EAF8EC";
const PRIMARY_BORDER = "#BFE7C5";

export default function CreateReviewScreen({ navigation, route }) {
  const gymId = route?.params?.gymId;
  const gymName = route?.params?.gymName;
  const onReviewCreated = route?.params?.onReviewCreated;

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!gymId) {
      setError("Missing gym ID.");
      return;
    }

    if (!comment.trim()) {
      setError("Please enter your review comment.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await createGymReview(gymId, {
        rating,
        comment: comment.trim(),
      });

      if (typeof onReviewCreated === "function") {
        onReviewCreated();
      }

      Alert.alert("Review submitted", "Your review was submitted successfully.", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (apiError) {
      const mapped = mapErrorToMessage(apiError);
      const duplicateReview =
        apiError?.data?.message?.toLowerCase().includes("already reviewed") ||
        mapped.message.toLowerCase().includes("already reviewed");

      setError(
        duplicateReview
          ? "You have already reviewed this gym."
          : mapped.message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Write a Review</Text>
        <Text style={styles.subtitle}>
          {gymName ? `Share your experience for ${gymName}.` : "Share your experience."}
        </Text>

        <Text style={styles.label}>Rating</Text>
        <View style={styles.ratingRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.ratingButton,
                rating === value && styles.ratingButtonActive,
              ]}
              onPress={() => {
                setRating(value);
                if (error) {
                  setError("");
                }
              }}
            >
              <Text
                style={[
                  styles.ratingButtonText,
                  rating === value && styles.ratingButtonTextActive,
                ]}
              >
                {value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Comment</Text>
        <TextInput
          style={styles.commentInput}
          multiline
          numberOfLines={5}
          value={comment}
          onChangeText={(value) => {
            setComment(value);
            if (error) {
              setError("");
            }
          }}
          placeholder="Write your review here"
          placeholderTextColor="#9CA3AF"
          textAlignVertical="top"
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Review</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 18,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 10,
  },
  ratingRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  ratingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  ratingButtonActive: {
    backgroundColor: PRIMARY_COLOR,
    borderColor: PRIMARY_DARK,
  },
  ratingButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  ratingButtonTextActive: {
    color: "#FFFFFF",
  },
  commentInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 12,
    backgroundColor: PRIMARY_TINT,
    padding: 14,
    fontSize: 15,
    color: "#1F2937",
    marginBottom: 12,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    marginBottom: 12,
  },
  submitButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: PRIMARY_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "600",
  },
});
