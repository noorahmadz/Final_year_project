import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useGym } from "../context/GymContext";

export default function AddGymScreen({ navigation }) {
  const { addGYM, addCourtToGym, owner, getGymById } = useGym();

  const totalSteps = 4;
  const [step, setStep] = useState(1);

  const progress = (step / totalSteps) * 100;

  /* ---------------- BASIC INFO ---------------- */

  const [gymName, setGymName] = useState("");
  const [description, setDescription] = useState("");

  /* ---------------- LOCATION ---------------- */

  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");

  /* ---------------- CONTACT ---------------- */

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  /* ---------------- COURTS ---------------- */

  const [currentCourts, setCurrentCourts] = useState([]);
  const [courtModal, setCourtModal] = useState(false);

  const [courtName, setCourtName] = useState("");
  const [price30, setPrice30] = useState("");
  const [price60, setPrice60] = useState("");
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");

  // Track the saved gym ID for adding courts
  const [savedGymId, setSavedGymId] = useState(null);
  const [isGymSaved, setIsGymSaved] = useState(false);

  /* ---------------- VALIDATION ---------------- */

  // initial gym save should not require courts; only ensure basic info is present
  const validateSave = () => {
    if (!gymName) {
      Alert.alert("Enter gym name");
      return false;
    }
    // add additional basic field checks here if needed
    return true;
  };

  /* ---------------- NAVIGATION ---------------- */

  const next = () => {
    // Allow going to next step without strict validation
    // Users can fill in missing info later
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const back = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  /* ---------------- COURT ---------------- */

  /* ---------------- SAVE ---------------- */

  const saveGym = () => {
    // Validate minimal gym info before saving (courts added afterward)
    if (!validateSave()) {
      return;
    }

    const gym = {
      name: gymName,
      description,
      address,
      city,
      phone,
      email,
      ownerId: owner?.id,
      courts: currentCourts,
    };

    const savedGym = addGYM(gym);
    setSavedGymId(savedGym.id);
    setIsGymSaved(true);

    // open court modal right away so owner can start adding courts
    setCourtModal(true);

    Alert.alert("Success", "Gym Added! You can now add courts below.");
    // remain on current step so modal is accessible (courts step is step 4)
  };

  // Handle adding court after gym is saved
  const handleAddCourtAfterSave = () => {
    if (!courtName) {
      Alert.alert("Enter court name");
      return;
    }

    // Create court data without ID - let context generate it
    const newCourt = {
      name: courtName,
      price30,
      price60,
      timing: { open: openTime, close: closeTime },
    };

    // Add court to the saved gym in context (this generates the ID)
    const savedCourt = addCourtToGym(savedGymId, newCourt);

    if (savedCourt) {
      // Fetch fresh gym data from context to get the actual courts
      const updatedGym = getGymById(savedGymId);
      if (updatedGym) {
        // Update local state with courts from context (avoids duplicates)
        setCurrentCourts(updatedGym.courts || []);
      }

      // Clear form fields
      setCourtName("");
      setPrice30("");
      setPrice60("");
      setOpenTime("");
      setCloseTime("");
      setCourtModal(false);
    }
  };

  /* ---------------- STEP RENDER ---------------- */

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View>
            <Text style={styles.title}>Basic Info</Text>

            <TextInput
              placeholder="Gym Name"
              style={styles.input}
              value={gymName}
              onChangeText={setGymName}
            />

            <TextInput
              placeholder="Description"
              style={styles.input}
              value={description}
              onChangeText={setDescription}
            />
          </View>
        );

      case 2:
        return (
          <View>
            <Text style={styles.title}>Location</Text>

            <TextInput
              placeholder="Address"
              style={styles.input}
              value={address}
              onChangeText={setAddress}
            />

            <TextInput
              placeholder="City"
              style={styles.input}
              value={city}
              onChangeText={setCity}
            />
          </View>
        );

      case 3:
        return (
          <View>
            <Text style={styles.title}>Contact</Text>

            <TextInput
              placeholder="Phone"
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
            />

            <TextInput
              placeholder="Email"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
            />
          </View>
        );

      case 4:
        return (
          <View>
            <Text style={styles.title}>Courts</Text>

            <FlatList
              data={currentCourts}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <View style={styles.court}>
                  <Text>{item.name}</Text>

                  <Text>
                    30m {item.price30} | 60m {item.price60}
                  </Text>
                  <Text>
                    {item.timing?.open} - {item.timing?.close}
                  </Text>
                </View>
              )}
            />

            {isGymSaved ? (
              <TouchableOpacity
                style={styles.addCourt}
                onPress={() => setCourtModal(true)}
              >
                <Text>Add Court</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ textAlign: "center", marginTop: 20 }}>
                Save gym first to start adding courts
              </Text>
            )}
          </View>
        );
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <View style={styles.container}>
      {/* HEADER */}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Add Gym</Text>

        <View style={{ width: 24 }} />
      </View>

      {/* PROGRESS BAR */}

      <View style={styles.progressBar}>
        <View style={[styles.progress, { width: `${progress}%` }]} />
      </View>

      {/* STEP CONTENT */}

      <ScrollView style={{ flex: 1, padding: 20 }}>{renderStep()}</ScrollView>

      {/* NAV BUTTONS */}

      <View style={styles.nav}>
        {step > 1 && (
          <TouchableOpacity onPress={back}>
            <Text>Back</Text>
          </TouchableOpacity>
        )}

        {step < totalSteps ? (
          <TouchableOpacity onPress={next}>
            <Text>Next</Text>
          </TouchableOpacity>
        ) : isGymSaved ? (
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => {
              if (currentCourts.length === 0) {
                Alert.alert(
                  "Add at least one court",
                  "Please add a court before finishing",
                );
                return;
              }
              navigation.goBack();
            }}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={saveGym}>
            <Text>Save Gym</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* COURT MODAL */}

      <Modal visible={courtModal} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modal}>
            <View style={styles.modalBox}>
              <Text>Add Court</Text>

              <TextInput
                placeholder="Court name"
                style={styles.input}
                value={courtName}
                onChangeText={setCourtName}
              />

              <TextInput
                placeholder="30 min price"
                style={styles.input}
                value={price30}
                onChangeText={setPrice30}
              />

              <TextInput
                placeholder="60 min price"
                style={styles.input}
                value={price60}
                onChangeText={setPrice60}
              />

              <TextInput
                placeholder="Open Time (e.g., 6:00 AM)"
                style={styles.input}
                value={openTime}
                onChangeText={setOpenTime}
              />

              <TextInput
                placeholder="Close Time (e.g., 10:00 PM)"
                style={styles.input}
                value={closeTime}
                onChangeText={setCloseTime}
              />

              <TouchableOpacity onPress={handleAddCourtAfterSave}>
                <Text>Add</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setCourtModal(false)}
                style={{ marginTop: 10 }}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },

  progressBar: {
    height: 6,
    backgroundColor: "#eee",
  },

  progress: {
    height: 6,
    backgroundColor: "#2563EB",
  },

  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  time: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 6,
    marginHorizontal: 5,
    flex: 1,
  },

  court: {
    padding: 15,
    backgroundColor: "#f3f4f6",
    marginBottom: 10,
    borderRadius: 10,
  },

  addCourt: {
    padding: 15,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
  },

  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
  },

  doneButton: {
    flex: 1,
    backgroundColor: "#10B981",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },

  doneButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },

  modal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
  },

  modalBox: {
    backgroundColor: "#fff",
    margin: 20,
    padding: 20,
    borderRadius: 15,
  },
});
