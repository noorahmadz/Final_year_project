import { createContext, useContext, useEffect, useState } from "react";
import { defaultTimeSlots, generateId, initialGyms } from "../data/mockData";

// Create the context
const GymContext = createContext();

// Provider component
export const GymProvider = ({ children }) => {
  // ==================== USER ROLES ====================
  // role: 'user' | 'owner' | 'admin'

  // ==================== AUTH STATE ====================
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState("user"); // 'user', 'owner', 'admin'

  // ==================== OWNERS ====================
  const [owners, setOwners] = useState([]);
  const [owner, setOwner] = useState(null);

  // ==================== ADMINS ====================
  const [admins, setAdmins] = useState([
    {
      id: "admin_001",
      email: "superadmin@gym.com",
      password: "admin123",
      name: "System Admin",
    },
  ]);
  const [admin, setAdmin] = useState(null);

  // ==================== GYMS ====================
  // All gyms in the system
  const [gyms, setGyms] = useState(
    initialGyms.map((gym) => ({
      ...gym,
      status: "approved", // approved by default for existing gym
      submittedAt: gym.createdAt,
      approvedAt: gym.createdAt,
      approvedBy: "system",
    })),
  );

  // Current selected gym (for viewing details, booking)
  const [currentGym, setCurrentGym] = useState(null);

  // ==================== BOOKINGS ====================
  // All bookings in the system
  const [bookings, setBookings] = useState([]);

  // ==================== TOURNAMENTS ====================
  const [tournaments, setTournaments] = useState([]);
  const [teams, setTeams] = useState([]);

  // Initialize - load from storage if available
  useEffect(() => {
    console.log("GymContext initialized");
    console.log("Gyms:", gyms.length);
    console.log("Admins:", admins.length);
  }, []);

  // ==================== USER AUTHENTICATION ====================

  // Login as regular user
  const loginUser = (userData) => {
    const newUser = {
      ...userData,
      id: generateId("user"),
      role: "user",
      createdAt: new Date().toISOString(),
    };
    setCurrentUser(newUser);
    setCurrentUserRole("user");
    return { success: true, user: newUser };
  };

  // Login as owner
  const loginOwner = (email, password) => {
    const foundOwner = owners.find(
      (o) => o.email === email && o.password === password,
    );

    if (foundOwner) {
      setOwner(foundOwner);
      setCurrentUser(foundOwner);
      setCurrentUserRole("owner");
      return { success: true, message: "Login successful", user: foundOwner };
    }

    // Check if it's the first time (no owners registered yet)
    if (
      owners.length === 0 &&
      email === "admin@gym.com" &&
      password === "admin123"
    ) {
      const defaultOwner = {
        id: generateId("owner"),
        name: "Admin Owner",
        email: "admin@gym.com",
        password: "admin123",
        role: "owner",
        createdAt: new Date().toISOString(),
      };
      setOwners([defaultOwner]);
      setOwner(defaultOwner);
      setCurrentUser(defaultOwner);
      setCurrentUserRole("owner");
      return {
        success: true,
        message: "Login successful",
        user: defaultOwner,
      };
    }

    return { success: false, message: "Invalid email or password" };
  };

  // Register as owner
  const registerOwner = (ownerData) => {
    const existingOwner = owners.find((o) => o.email === ownerData.email);

    if (existingOwner) {
      return { success: false, message: "Email already registered" };
    }

    const newOwner = {
      ...ownerData,
      id: generateId("owner"),
      role: "owner",
      createdAt: new Date().toISOString(),
    };

    setOwners((prev) => [...prev, newOwner]);
    setOwner(newOwner);
    setCurrentUser(newOwner);
    setCurrentUserRole("owner");

    return {
      success: true,
      message: "Registration successful",
      user: newOwner,
    };
  };

  // Login as admin
  const loginAdmin = (email, password) => {
    const foundAdmin = admins.find(
      (a) => a.email === email && a.password === password,
    );

    if (foundAdmin) {
      setAdmin(foundAdmin);
      setCurrentUser(foundAdmin);
      setCurrentUserRole("admin");
      return {
        success: true,
        message: "Admin login successful",
        user: foundAdmin,
      };
    }

    return { success: false, message: "Invalid admin credentials" };
  };

  // Logout
  const logout = () => {
    setCurrentUser(null);
    setCurrentUserRole("user");
    setOwner(null);
    setAdmin(null);
  };

  // ==================== GYM CRUD OPERATIONS ====================

  // Add new gym (submitted for approval)
  const addGYM = (gymData) => {
    const newGYM = {
      ...gymData,
      id: generateId("gym"),
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      status: "pending", // Requires approval
      approvedAt: null,
      approvedBy: null,
      isActive: true,
      rating: 0,
      discounts: [], // Array of discount objects
    };
    setGyms((prev) => [...prev, newGYM]);
    return newGYM;
  };

  // Update gym
  const updateGym = (gymId, gymData) => {
    setGyms((prev) =>
      prev.map((gym) =>
        gym.id === gymId
          ? { ...gym, ...gymData, updatedAt: new Date().toISOString() }
          : gym,
      ),
    );
  };

  // Delete gym (only admin can delete)
  const deleteGym = (gymId) => {
    setGyms((prev) => prev.filter((gym) => gym.id !== gymId));
  };

  // Get gym by ID
  const getGymById = (gymId) => {
    return gyms.find((gym) => gym.id === gymId);
  };

  // ==================== GYM APPROVAL (ADMIN) ====================

  // Approve gym
  const approveGym = (gymId, adminId) => {
    setGyms((prev) =>
      prev.map((gym) =>
        gym.id === gymId
          ? {
              ...gym,
              status: "approved",
              approvedAt: new Date().toISOString(),
              approvedBy: adminId,
            }
          : gym,
      ),
    );
  };

  // Reject gym
  const rejectGym = (gymId, reason = "") => {
    setGyms((prev) =>
      prev.map((gym) =>
        gym.id === gymId
          ? {
              ...gym,
              status: "rejected",
              rejectedAt: new Date().toISOString(),
              rejectionReason: reason,
            }
          : gym,
      ),
    );
  };

  // Get pending gyms
  const getPendingGyms = () => {
    return gyms.filter((gym) => gym.status === "pending");
  };

  // Get approved gyms (for users to see)
  const getApprovedGyms = () => {
    return gyms.filter((gym) => gym.status === "approved");
  };

  // Get rejected gyms
  const getRejectedGyms = () => {
    return gyms.filter((gym) => gym.status === "rejected");
  };

  // Get gyms owned by current owner
  const getOwnerGyms = () => {
    if (!owner) return [];
    return gyms.filter((gym) => gym.ownerId === owner.id);
  };

  // ==================== COURTS ====================

  // Add court to gym
  const addCourtToGym = (gymId, courtData) => {
    const gym = getGymById(gymId);
    if (!gym) return null;

    const newCourt = {
      ...courtData,
      id: generateId("court"),
    };

    const updatedCourts = [...(gym.courts || []), newCourt];
    updateGym(gymId, { courts: updatedCourts });

    return newCourt;
  };

  // Remove court from gym
  const removeCourtFromGym = (gymId, courtId) => {
    const gym = getGymById(gymId);
    if (!gym) return;

    const updatedCourts = gym.courts.filter((c) => c.id !== courtId);
    updateGym(gymId, { courts: updatedCourts });
  };

  // Update timing for gym
  const updateGymTiming = (gymId, timing) => {
    updateGym(gymId, { timing });
  };

  // ==================== DISCOUNTS ====================

  // Add discount to gym
  const addDiscountToGym = (gymId, discountData) => {
    const gym = getGymById(gymId);
    if (!gym) return null;

    const newDiscount = {
      ...discountData,
      id: generateId("discount"),
      createdAt: new Date().toISOString(),
    };

    const updatedDiscounts = [...(gym.discounts || []), newDiscount];
    updateGym(gymId, { discounts: updatedDiscounts });

    return newDiscount;
  };

  // Update discount in gym
  const updateDiscount = (gymId, discountId, discountData) => {
    const gym = getGymById(gymId);
    if (!gym) return;

    const updatedDiscounts = gym.discounts.map((discount) =>
      discount.id === discountId
        ? { ...discount, ...discountData, updatedAt: new Date().toISOString() }
        : discount,
    );
    updateGym(gymId, { discounts: updatedDiscounts });
  };

  // Delete discount from gym
  const deleteDiscount = (gymId, discountId) => {
    const gym = getGymById(gymId);
    if (!gym) return;

    const updatedDiscounts = gym.discounts.filter((d) => d.id !== discountId);
    updateGym(gymId, { discounts: updatedDiscounts });
  };

  // Get active discounts for a gym (based on current date)
  const getActiveDiscounts = (gymId) => {
    const gym = getGymById(gymId);
    if (!gym || !gym.discounts) return [];

    const now = new Date();
    return gym.discounts.filter((discount) => {
      const validFrom = new Date(discount.validFrom);
      const validTo = new Date(discount.validTo);
      return now >= validFrom && now <= validTo;
    });
  };

  // ==================== GYM SELECTION ====================

  // Select a gym as current
  const selectGym = (gymId) => {
    const gym = getGymById(gymId);
    setCurrentGym(gym);
  };

  // Clear current gym selection
  const clearCurrentGym = () => {
    setCurrentGym(null);
  };

  // ==================== BOOKING FUNCTIONS ====================

  // Add a new booking (now supports Stripe fields)
  const addBooking = (bookingData) => {
    const newBooking = {
      ...bookingData,
      id: generateId("booking"),
      createdAt: new Date().toISOString(),
      status: "confirmed",
      // Stripe fields (optional)
      stripePaymentIntentId: bookingData.stripePaymentIntentId || null,
      stripePaymentMethodId: bookingData.stripePaymentMethodId || null,
    };
    setBookings((prev) => [...prev, newBooking]);
    return newBooking;
  };

  // Get bookings for a specific gym, court, and date
  const getBookingsForCourtAndDate = (gymId, courtName, date) => {
    return bookings.filter(
      (booking) =>
        booking.gymId === gymId &&
        booking.court === courtName &&
        booking.date === date,
    );
  };

  // Get all bookings for a specific gym
  const getBookingsForGym = (gymId) => {
    return bookings.filter((booking) => booking.gymId === gymId);
  };

  // Get all bookings
  const getAllBookings = () => {
    return bookings;
  };

  // Cancel a booking
  const cancelBooking = (bookingId) => {
    setBookings((prev) =>
      prev.map((booking) =>
        booking.id === bookingId
          ? { ...booking, status: "cancelled" }
          : booking,
      ),
    );
  };

  // Update a booking (e.g., after payment)
  const updateBooking = (bookingId, bookingData) => {
    setBookings((prev) =>
      prev.map((booking) =>
        booking.id === bookingId
          ? { ...booking, ...bookingData, updatedAt: new Date().toISOString() }
          : booking,
      ),
    );
  };

  // ==================== TOURNAMENT FUNCTIONS ====================

  // Create a new tournament
  const createTournament = (tournamentData) => {
    const newTournament = {
      ...tournamentData,
      id: generateId("tournament"),
      createdAt: new Date().toISOString(),
      status: "pending",
      result: null,
    };
    setTournaments((prev) => [...prev, newTournament]);
    return newTournament;
  };

  // Approve tournament
  const approveTournament = (tournamentId, approvedBy) => {
    setTournaments((prev) =>
      prev.map((tournament) =>
        tournament.id === tournamentId
          ? {
              ...tournament,
              status: "upcoming",
              approvedBy,
              approvedAt: new Date().toISOString(),
            }
          : tournament,
      ),
    );
  };

  // Reject tournament
  const rejectTournament = (tournamentId, rejectionReason) => {
    setTournaments((prev) =>
      prev.map((tournament) =>
        tournament.id === tournamentId
          ? {
              ...tournament,
              status: "rejected",
              rejectionReason,
              rejectedAt: new Date().toISOString(),
            }
          : tournament,
      ),
    );
  };

  // Get pending tournaments
  const getPendingTournaments = () => {
    return tournaments.filter((t) => t.status === "pending");
  };

  // Get approved tournaments
  const getApprovedTournaments = () => {
    return tournaments.filter(
      (t) =>
        t.status === "upcoming" ||
        t.status === "in_progress" ||
        t.status === "completed",
    );
  };

  // Update tournament
  const updateTournament = (tournamentId, tournamentData) => {
    setTournaments((prev) =>
      prev.map((tournament) =>
        tournament.id === tournamentId
          ? {
              ...tournament,
              ...tournamentData,
              updatedAt: new Date().toISOString(),
            }
          : tournament,
      ),
    );
  };

  // Cancel tournament
  const cancelTournament = (tournamentId) => {
    setTournaments((prev) =>
      prev.map((tournament) =>
        tournament.id === tournamentId
          ? {
              ...tournament,
              status: "canceled",
              updatedAt: new Date().toISOString(),
            }
          : tournament,
      ),
    );
  };

  // Complete tournament and add result
  const completeTournament = (tournamentId, result) => {
    setTournaments((prev) =>
      prev.map((tournament) =>
        tournament.id === tournamentId
          ? {
              ...tournament,
              status: "completed",
              result,
              updatedAt: new Date().toISOString(),
            }
          : tournament,
      ),
    );
  };

  // Get tournaments by gym
  const getTournamentsByGym = (gymId) => {
    return tournaments.filter((t) => t.gymId === gymId);
  };

  // Get tournaments by status
  const getTournamentsByStatus = (status) => {
    return tournaments.filter((t) => t.status === status);
  };

  // Get all tournaments
  const getAllTournaments = () => {
    return tournaments;
  };

  // Delete tournament
  const deleteTournament = (tournamentId) => {
    setTournaments((prev) => prev.filter((t) => t.id !== tournamentId));
  };

  // ==================== TEAM FUNCTIONS ====================

  // Register a team
  const registerTeam = (teamData) => {
    const newTeam = {
      ...teamData,
      id: generateId("team"),
      status: "registered",
      paymentStatus: "pending",
      registeredAt: new Date().toISOString(),
    };
    setTeams((prev) => [...prev, newTeam]);
    return newTeam;
  };

  // Update team
  const updateTeam = (teamId, teamData) => {
    setTeams((prev) =>
      prev.map((team) =>
        team.id === teamId
          ? { ...team, ...teamData, updatedAt: new Date().toISOString() }
          : team,
      ),
    );
  };

  // Confirm team payment
  const confirmTeamPayment = (teamId, paymentId) => {
    setTeams((prev) =>
      prev.map((team) =>
        team.id === teamId
          ? { ...team, paymentStatus: "paid", status: "confirmed", paymentId }
          : team,
      ),
    );
  };

  // Get teams by tournament
  const getTeamsByTournament = (tournamentId) => {
    return teams.filter((t) => t.tournamentId === tournamentId);
  };

  // Register a team to a specific tournament
  const registerTeamToTournament = (tournamentId, teamData) => {
    const newTeam = {
      ...teamData,
      id: generateId("team"),
      tournamentId,
      status: "registered",
      registeredAt: new Date().toISOString(),
    };

    // Add team to teams array
    setTeams((prev) => [...prev, newTeam]);

    // Also add team to tournament's registeredTeams for easy access
    setTournaments((prev) =>
      prev.map((tournament) =>
        tournament.id === tournamentId
          ? {
              ...tournament,
              registeredTeams: [
                ...(tournament.registeredTeams || []),
                newTeam,
              ],
            }
          : tournament,
      ),
    );

    return newTeam;
  };

  // Context value
  const value = {
    // User & Auth
    currentUser,
    currentUserRole,
    loginUser,
    loginOwner,
    loginAdmin,
    registerOwner,
    logout,

    // Owner
    owners,
    owner,

    // Admin
    admins,
    admin,

    // Gyms
    gyms,
    currentGym,
    addGYM,
    updateGym,
    deleteGym,
    getGymById,
    selectGym,
    clearCurrentGym,

    // Gym Approval
    approveGym,
    rejectGym,
    getPendingGyms,
    getApprovedGyms,
    getRejectedGyms,
    getOwnerGyms,

    // Courts
    addCourtToGym,
    removeCourtFromGym,

    // Timing
    updateGymTiming,

    // Discounts
    addDiscountToGym,
    updateDiscount,
    deleteDiscount,
    getActiveDiscounts,

    // Default time slots
    defaultTimeSlots,

    // Bookings
    bookings,
    addBooking,
    getBookingsForCourtAndDate,
    getBookingsForGym,
    getAllBookings,
    cancelBooking,
    updateBooking,

    // Tournaments
    tournaments,
    createTournament,
    updateTournament,
    cancelTournament,
    completeTournament,
    approveTournament,
    rejectTournament,
    getPendingTournaments,
    getApprovedTournaments,
    getTournamentsByGym,
    getTournamentsByStatus,
    getAllTournaments,
    deleteTournament,

    // Teams
    teams,
    registerTeam,
    registerTeamToTournament,
    updateTeam,
    confirmTeamPayment,
    getTeamsByTournament,
  };

  return <GymContext.Provider value={value}>{children}</GymContext.Provider>;
};

// Custom hook to use the context
export const useGym = () => {
  const context = useContext(GymContext);
  if (!context) {
    throw new Error("useGym must be used within a GymProvider");
  }
  return context;
};

export default GymContext;
