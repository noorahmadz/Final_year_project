import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import {
  getMatches,
  getStandings,
  getTournamentDetail,
  getTournaments,
  registerTeam,
} from "../api/tournamentsApi";
import { createTournamentPaymentIntent } from "../api/paymentsApi";
import { useGym } from "../context/GymContext";
import { mapErrorToMessage } from "../utils/errorMapper";
import {
  TOURNAMENT_STATUS,
  adaptMatch,
  adaptStandings,
  adaptTournamentDetail,
  adaptTournamentListItem,
  normalizeTournamentStatus,
} from "../utils/tournamentMapper";
import {
  getEndMargin,
  getFlexDirection,
  getStartMargin,
  getTextAlign,
  getWritingDirection,
  isRTL,
} from "../utils/rtl";

const PRIMARY_COLOR = "#24a731";
const PRIMARY_DARK = "#1B7F26";
const PRIMARY_TINT = "#EAF8EC";
const PRIMARY_BORDER = "#BFE7C5";
const REQUIRED_TEAM_MEMBERS = 7;
const STANDINGS_LEGEND = [
  { key: "P", label: "Played" },
  { key: "W", label: "Wins" },
  { key: "D", label: "Draws" },
  { key: "L", label: "Losses" },
  { key: "GD", label: "Goal Difference" },
  { key: "Pts", label: "Points" },
];

const createEmptyTeamMembers = () =>
  Array.from({ length: REQUIRED_TEAM_MEMBERS }, () => ({ name: "", role: "" }));

export default function TournamentListScreen({ navigation }) {
  const { t } = useTranslation();
  const rtl = isRTL();
  const { gyms } = useGym();
  const [serverTournaments, setServerTournaments] = useState([]);
  const [serverTournamentDetails, setServerTournamentDetails] = useState({});
  const [serverMatches, setServerMatches] = useState({});
  const [serverStandings, setServerStandings] = useState({});
  const [tournamentsLoaded, setTournamentsLoaded] = useState(false);
  const [tournamentsError, setTournamentsError] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCards, setExpandedCards] = useState({});
  const [expandedTeamRoster, setExpandedTeamRoster] = useState(null);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [captainName, setCaptainName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [registrationFee, setRegistrationFee] = useState("");
  const [teamMembers, setTeamMembers] = useState(createEmptyTeamMembers);
  const [feeError, setFeeError] = useState("");
  const [submittingTeam, setSubmittingTeam] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const isFocused = useIsFocused();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };
  const ltrValueTextStyle = {
    textAlign: rtl ? "left" : "right",
    writingDirection: "ltr",
  };

  const extractResults = (payload) => {
    if (Array.isArray(payload?.results)) {
      return payload.results;
    }
    if (Array.isArray(payload)) {
      return payload;
    }
    return [];
  };

  const loadTournaments = async () => {
    try {
      const response = await getTournaments();
      const items = extractResults(response)
        .map((item) => adaptTournamentListItem(item))
        .filter(Boolean);
      setServerTournaments(items);
      setTournamentsLoaded(true);
      setTournamentsError(null);
    } catch (error) {
      console.warn("Tournament load failed", error);
      setServerTournaments([]);
      setTournamentsLoaded(false);
      setTournamentsError(mapErrorToMessage(error).message);
    }
  };

  const loadTournamentDetail = async (tournamentId, { force = false } = {}) => {
    if (!tournamentId || (!force && serverTournamentDetails[tournamentId])) {
      return serverTournamentDetails[tournamentId] || null;
    }

    const [detailResponse, matchesResponse, standingsResponse] = await Promise.all([
      getTournamentDetail(tournamentId),
      getMatches(tournamentId),
      getStandings(tournamentId),
    ]);

    const detail = adaptTournamentDetail(detailResponse);
    const matches = extractResults(matchesResponse)
      .map((match) => adaptMatch(match))
      .filter(Boolean);
    const standings = adaptStandings(standingsResponse?.standings ?? standingsResponse);

    setServerTournamentDetails((prev) => ({ ...prev, [tournamentId]: detail }));
    setServerMatches((prev) => ({ ...prev, [tournamentId]: matches }));
    setServerStandings((prev) => ({ ...prev, [tournamentId]: standings }));

    return detail;
  };

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    loadTournaments();
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isFocused]);

  const getTournamentStatus = (item) => {
    const startDate = new Date(item.startDate);
    const endDate = new Date(item.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    const currentStatus = normalizeTournamentStatus(item.status);
    if (currentStatus === TOURNAMENT_STATUS.CANCELLED) return TOURNAMENT_STATUS.CANCELLED;
    if (currentStatus === TOURNAMENT_STATUS.FINISHED) return TOURNAMENT_STATUS.FINISHED;
    if (today < startDate) return TOURNAMENT_STATUS.UPCOMING;
    if (today >= startDate && today <= endDate) return TOURNAMENT_STATUS.ONGOING;
    if (today > endDate) return TOURNAMENT_STATUS.FINISHED;
    return currentStatus || TOURNAMENT_STATUS.UPCOMING;
  };

  const getTournamentProgressStatus = (item, groups, groupMatches, knockoutMatches) => {
    const totalTeams = (groups.groupA?.length || 0) + (groups.groupB?.length || 0);
    const completedGroupMatches = groupMatches.filter(m => m.status === "completed").length;
    const totalGroupMatches = groupMatches.length;
    const hasKnockout = knockoutMatches.length > 0;
    const completedKnockout = knockoutMatches.filter(m => m.status === "completed").length;
    const isChampion = !!item.champion;
    
    if (isChampion) return { label: t("tournaments.championCrowned"), color: PRIMARY_DARK, icon: "trophy" };
    if (completedKnockout > 0 && hasKnockout) return { label: t("tournaments.knockoutStage"), color: PRIMARY_DARK, icon: "flash" };
    if (totalGroupMatches > 0 && completedGroupMatches === totalGroupMatches && totalTeams >= 4) return { label: t("tournaments.groupStageComplete"), color: PRIMARY_COLOR, icon: "checkmark-circle" };
    if (completedGroupMatches > 0) {
      return {
        label: t("tournaments.groupStageProgress", {
          completed: completedGroupMatches,
          total: totalGroupMatches,
        }),
        color: PRIMARY_COLOR,
        icon: "football",
      };
    }
    if (totalTeams > 0) {
      return {
        label: t("tournaments.teamsRegistered", { count: totalTeams }),
        color: PRIMARY_DARK,
        icon: "people",
      };
    }
    return {
      label: t("tournaments.status.registrationOpen"),
      color: "#6B7280",
      icon: "time-outline",
    };
  };

  const getTournamentStatusLabel = (status) => {
    const normalized = String(status || "").toLowerCase();

    if (normalized === "upcoming") return t("tournaments.upcoming");
    if (normalized === "ongoing" || normalized === "in_progress") {
      return t("tournaments.inProgress");
    }
    if (normalized === "finished" || normalized === "completed") {
      return t("tournaments.completed");
    }
    if (normalized === "cancelled" || normalized === "canceled") {
      return t("tournaments.canceled");
    }
    if (normalized === "registration_open") {
      return t("tournaments.registrationOpen");
    }

    return status || "";
  };

  const approvedTournaments = serverTournaments
    .filter((t) => t.status === TOURNAMENT_STATUS.UPCOMING || t.status === TOURNAMENT_STATUS.ONGOING || t.status === TOURNAMENT_STATUS.FINISHED || t.rawStatus === "pending" || !t.status)
    .map((item) => ({ ...item, calculatedStatus: getTournamentStatus(item) }));

  const baseFilteredTournaments = activeFilter === "all" ? approvedTournaments : approvedTournaments.filter((t) => t.calculatedStatus === activeFilter);
  const filteredTournaments = baseFilteredTournaments.filter((tournament) => tournament.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const openAddTeamModal = (tournament) => {
    setSelectedTournament(tournament);
    setCaptainName(""); setPhoneNumber(""); setRegistrationFee(""); setTeamMembers(createEmptyTeamMembers()); setFeeError("");
    setShowTeamModal(true);
  };

  const updateTeamMember = (index, field, value) => {
    setTeamMembers((currentMembers) =>
      currentMembers.map((member, memberIndex) =>
        memberIndex === index ? { ...member, [field]: value } : member,
      ),
    );
  };

  const handleAddTeam = async () => {
    if (submittingTeam || !selectedTournament) {
      return;
    }
    if (!captainName.trim()) { Alert.alert(t("common.error"), t("tournaments.pleaseEnterCaptainName")); return; }
    if (!phoneNumber.trim()) { Alert.alert(t("common.error"), t("tournaments.pleaseEnterPhoneNumber")); return; }
    if (!registrationFee.trim()) { Alert.alert(t("common.error"), t("tournaments.pleaseEnterRegistrationFee")); return; }
    const normalizedTeamMembers = teamMembers.map((member) => ({
      name: member.name.trim(),
      role: member.role.trim(),
    }));
    const hasMissingMember = normalizedTeamMembers.some((member) => !member.name || !member.role);
    if (normalizedTeamMembers.length !== REQUIRED_TEAM_MEMBERS || hasMissingMember) {
      Alert.alert(
        t("common.error"),
        t("tournaments.pleaseEnterTeamMembers", { count: REQUIRED_TEAM_MEMBERS }),
      );
      return;
    }
    const uniqueMemberNames = new Set(normalizedTeamMembers.map((member) => member.name.toLowerCase()));
    if (uniqueMemberNames.size !== normalizedTeamMembers.length) {
      Alert.alert(t("common.error"), t("tournaments.duplicateTeamMembers"));
      return;
    }
    const inputFee = parseFloat(registrationFee);
    const requiredFee = parseFloat(selectedTournament.entryFee);
    const isValid =
      Number.isFinite(inputFee) &&
      Number.isFinite(requiredFee) &&
      inputFee.toFixed(2) === requiredFee.toFixed(2);
    if (!isValid) {
      setFeeError(
        t("tournaments.exactRegistrationFee", {
          amount: selectedTournament.entryFee,
          currency: t("common.currency.afg", { defaultValue: "AFG" }),
        }),
      );
      return;
    }
    const existingTeams = selectedTournament.registeredTeams || [];
    if (existingTeams.some((team) => team.captainName?.toLowerCase() === captainName.trim().toLowerCase())) {
      Alert.alert(t("common.error"), t("tournaments.teamAlreadyRegistered")); return;
    }
    if (existingTeams.some((team) => team.phoneNumber === phoneNumber.trim())) {
      Alert.alert(t("common.error"), t("tournaments.phoneAlreadyRegistered")); return;
    }
    try {
      setSubmittingTeam(true);
      const response = await registerTeam(selectedTournament.id, {
        team_name: captainName.trim(),
        captain_name: captainName.trim(),
        captain_phone: phoneNumber.trim(),
        members: normalizedTeamMembers,
      });
      const data = response?.data ?? response;

      if (data?.registration_status === "payment_required") {
        if (data?.next_step?.endpoint !== "/api/payments/tournament/create-intent/") {
          throw new Error(t("payment.screen.setupFailed"));
        }

        const nextStepPayload = data?.next_step?.payload || {
          tournament_id: selectedTournament.id,
          team_name: captainName.trim(),
          captain_name: captainName.trim(),
          captain_phone: phoneNumber.trim(),
          members: normalizedTeamMembers,
        };
        const intentResponse = await createTournamentPaymentIntent(nextStepPayload);
        const intentData = intentResponse?.data ?? intentResponse;
        const clientSecret = intentData?.client_secret;
        const paymentIntentId = intentData?.payment_intent_id;

        if (!clientSecret || !paymentIntentId) {
          throw new Error(t("payment.screen.setupFailed"));
        }

        setShowTeamModal(false);
        setCaptainName("");
        setPhoneNumber("");
        setRegistrationFee("");
        setTeamMembers(createEmptyTeamMembers());
        setFeeError("");

        navigation.navigate("PaymentScreen", {
          paymentMode: "tournament_registration",
          tournamentId: selectedTournament.id,
          tournamentName: selectedTournament.name,
          teamName: captainName.trim(),
          captainName: captainName.trim(),
          captainPhone: phoneNumber.trim(),
          paymentIntentClientSecret: clientSecret,
          paymentIntentId,
          price: selectedTournament.entryFee,
          nextActions: data?.next_step ? [data.next_step.key || "create_registration_payment"] : [],
        });
        return;
      }

      await loadTournamentDetail(selectedTournament.id, { force: true });
      await loadTournaments();
      Alert.alert(t("common.success"), t("tournaments.teamRegistrationSubmitted"));
      setShowTeamModal(false);
      setCaptainName(""); setPhoneNumber(""); setRegistrationFee(""); setTeamMembers(createEmptyTeamMembers()); setFeeError("");
    } catch (error) {
      console.log("REGISTER ERROR:", error?.data || error?.message || error);
      Alert.alert(t("common.error"), mapErrorToMessage(error).message);
    } finally {
      setSubmittingTeam(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case TOURNAMENT_STATUS.UPCOMING: return { color: PRIMARY_COLOR, bg: PRIMARY_TINT, icon: "time-outline", label: t("tournaments.status.upcoming") };
      case TOURNAMENT_STATUS.FINISHED: return { color: "#6B7280", bg: "#E5E7EB", icon: "checkmark-circle", label: t("tournaments.status.completed") };
      case TOURNAMENT_STATUS.CANCELLED: return { color: "#EF4444", bg: "#FEE2E2", icon: "close-circle", label: t("tournaments.status.canceled") };
      case TOURNAMENT_STATUS.ONGOING: return { color: PRIMARY_DARK, bg: PRIMARY_TINT, icon: "play-circle", label: t("tournaments.status.inProgress") };
      default: return { color: "#6B7280", bg: "#F3F4F6", icon: "help-circle", label: status };
    }
  };

  const getCountdownParts = (targetDate) => {
    if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
      return null;
    }

    const remainingMs = targetDate.getTime() - currentTime.getTime();
    if (remainingMs <= 0 || remainingMs > 24 * 60 * 60 * 1000) {
      return null;
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      hours: String(hours).padStart(2, "0"),
      minutes: String(minutes).padStart(2, "0"),
      seconds: String(seconds).padStart(2, "0"),
    };
  };

  const handleToggleCardExpansion = async (tournamentId) => {
    const nextExpanded = !expandedCards[tournamentId];
    setExpandedCards((prev) => ({ ...prev, [tournamentId]: nextExpanded }));

    if (!nextExpanded) {
      setExpandedTeamRoster(null);
      return;
    }

    try {
      await loadTournamentDetail(tournamentId);
    } catch (error) {
      Alert.alert(t("common.error"), mapErrorToMessage(error).message);
    }
  };

  const getPublicTeamName = (team) =>
    team?.teamName || team?.captainName || team?.name || t("tournaments.unknownTeam", { defaultValue: "Unknown Team" });

  const getTeamRosterKey = (tournamentId, team, scope, index) =>
    `${tournamentId || "tournament"}-${scope}-${team?.id || team?.teamId || index}`;

  const toggleTeamRoster = (rosterKey) => {
    setExpandedTeamRoster((current) => (current === rosterKey ? null : rosterKey));
  };

  const renderPublicTeamMembers = (team) => {
    const members = Array.isArray(team?.members)
      ? team.members.filter((member) => member?.name || member?.role)
      : [];

    if (members.length === 0) {
      return null;
    }

    return (
      <View style={styles.publicTeamMembers}>
        {members.map((member, index) => (
          <Text
            key={member.id || member.memberId || `${member.name}-${index}`}
            style={[styles.publicTeamMemberText, localizedTextStyle]}
            numberOfLines={1}
          >
            {index + 1}. {member.name}
            {member.role ? ` - ${member.role}` : ""}
          </Text>
        ))}
      </View>
    );
  };

  const renderTournamentItem = ({ item }) => {
    const detail = serverTournamentDetails[item.id] || item;
    const gym = gyms.find((g) => g.id === detail.gymId);
    const status = detail.calculatedStatus || item.calculatedStatus || getTournamentStatus(detail);
    const statusBadge = getStatusBadge(status);
    const startDate = new Date(detail.startDate);
    const endDate = new Date(detail.endDate);
    const isRegistrationOpen = new Date(detail.registrationDeadline || detail.startDate) >= new Date();
    const countdown = status === TOURNAMENT_STATUS.UPCOMING
      ? getCountdownParts(startDate)
      : null;
    const isExpanded = expandedCards[detail.id];
    const registeredTeams = detail.registeredTeams || [];
    const groups = detail.groups || { groupA: [], groupB: [] };
    const allMatches = serverMatches[detail.id] || [];
    const groupMatches = allMatches.filter(
      (match) => String(match.round || "").toLowerCase().includes("group"),
    );
    const knockoutMatches = allMatches.filter(
      (match) => !String(match.round || "").toLowerCase().includes("group"),
    );
    const standings = serverStandings[detail.id] || { groupA: [], groupB: [] };
    const groupAStandings = standings.groupA || [];
    const groupBStandings = standings.groupB || [];
    const awardItems = [
      {
        label: t("ownerDashboard.tournaments.firstPlaceAward", { defaultValue: "1st Place Award" }),
        value: detail.firstPlaceAward,
        position: 1,
      },
      {
        label: t("ownerDashboard.tournaments.secondPlaceAward", { defaultValue: "2nd Place Award" }),
        value: detail.secondPlaceAward,
        position: 2,
      },
      {
        label: t("ownerDashboard.tournaments.thirdPlaceAward", { defaultValue: "3rd Place Award" }),
        value: detail.thirdPlaceAward,
        position: 3,
      },
      {
        label: t("ownerDashboard.tournaments.topScorerAward", { defaultValue: "Top Scorer Award" }),
        value: detail.topScorerAward,
        position: "top_scorer",
      },
    ]
      .map((award) => ({
        ...award,
        label: String(award.label).replace(/\s*\(AFN\)\s*/g, "").trim(),
        value: String(award.value || "").trim(),
      }))
      .filter((award) => award.value);
    const getAwardForPosition = (position) =>
      awardItems.find((award) => award.position === position) || null;
    const getPublicAwardIcon = (position) => {
      if (position === 1) return "trophy";
      if (position === 2) return "medal-outline";
      if (position === 3) return "ribbon-outline";
      return "football-outline";
    };
    const allStandings = [...groupAStandings, ...groupBStandings];
    const getTeamDisplayNameById = (teamId) => {
      const teamIdText = String(teamId || "");
      const standingsTeam = allStandings.find((stat) => String(stat.teamId) === teamIdText);
      const registeredTeam = registeredTeams.find((team) =>
        [team.id, team.teamId].some((id) => String(id || "") === teamIdText),
      );

      return standingsTeam?.teamName || getPublicTeamName(registeredTeam) || teamIdText;
    };
    const finalMatch = knockoutMatches.find((match) =>
      ["final", "match 1"].includes(String(match.round || "").toLowerCase()),
    );
    const challengeMatch = knockoutMatches.find((match) =>
      ["challenge match", "third place"].includes(String(match.round || "").toLowerCase()),
    );
    const computedFinalRanking = finalMatch?.winner
      ? [
          { position: 1, teamName: getTeamDisplayNameById(finalMatch.winner) },
          challengeMatch?.status === "completed" && challengeMatch.winner
            ? { position: 2, teamName: getTeamDisplayNameById(challengeMatch.winner) }
            : finalMatch.loser
              ? { position: 2, teamName: getTeamDisplayNameById(finalMatch.loser) }
              : null,
          challengeMatch?.status === "completed" && challengeMatch.loser
            ? { position: 3, teamName: getTeamDisplayNameById(challengeMatch.loser) }
            : null,
        ].filter(Boolean)
      : [];
    const publicFinalRanking =
      Array.isArray(detail.finalRanking) && detail.finalRanking.length > 0
        ? detail.finalRanking
        : computedFinalRanking;
    const normalizedFinalRanking = publicFinalRanking
      .map((rank, index) => {
        const position = Number(rank.position || rank.rank || index + 1);
        const teamName =
          rank.teamName ||
          rank.team_name ||
          rank.name ||
          (rank.teamId || rank.team_id
            ? getTeamDisplayNameById(rank.teamId || rank.team_id)
            : "");

        return {
          ...rank,
          position: Number.isFinite(position) ? position : index + 1,
          teamName,
        };
      })
      .filter((rank) => rank.teamName)
      .sort((a, b) => a.position - b.position);
    const topScorerName =
      detail.topScorer?.player_name ||
      detail.topScorer?.playerName ||
      detail.topScorer?.name ||
      "";
    const topScorerGoals = detail.topScorer?.total_goals ?? detail.topScorer?.totalGoals;
    const topScorerAward = getAwardForPosition("top_scorer");

    return (
      <View style={styles.tournamentCard}>
        <View style={[styles.tournamentHeader, { flexDirection: getFlexDirection() }]}>
          <View
            style={[
              styles.tournamentTitleRow,
              { flexDirection: getFlexDirection() },
            ]}
          >
            <Ionicons name="trophy" size={24} color="#24a731" />
            <Text
              style={[
                styles.tournamentName,
                getStartMargin(8),
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              {detail.name}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusBadge.bg, flexDirection: getFlexDirection() },
            ]}
          >
            <Ionicons name={statusBadge.icon} size={14} color={statusBadge.color} />
            <Text
              style={[
                styles.statusText,
                { color: statusBadge.color },
                getStartMargin(4),
                localizedTextStyle,
              ]}
            >
              {statusBadge.label}
            </Text>
          </View>
        </View>
        <View style={styles.tournamentDetails}>
          <View style={[styles.detailRow, { flexDirection: getFlexDirection() }]}>
            <Ionicons name="business" size={16} color="#6B7280" />
            <Text
              style={[
                styles.detailText,
                getStartMargin(8),
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              {detail.gymName || gym?.name || t("tournaments.unknownGym")}
            </Text>
          </View>
          <View style={[styles.detailRow, { flexDirection: getFlexDirection() }]}>
            <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            <Text
              style={[
                styles.detailText,
                getStartMargin(8),
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
            </Text>
          </View>
          {item.time && (
            <View style={[styles.detailRow, { flexDirection: getFlexDirection() }]}>
              <Ionicons name="time-outline" size={16} color="#6B7280" />
              <Text
                style={[
                  styles.detailText,
                  getStartMargin(8),
                  {
                    textAlign: getTextAlign(),
                    writingDirection: getWritingDirection(),
                  },
                ]}
              >
                {t("booking.form.duration")}: {detail.time}
              </Text>
            </View>
          )}
          <View style={[styles.detailRow, { flexDirection: getFlexDirection() }]}>
            <Ionicons name="cash-outline" size={16} color="#6B7280" />
            <Text
              style={[
                styles.detailText,
                getStartMargin(8),
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              {t("tournaments.registrationFee")}: {detail.entryFee}{" "}
              {t("common.currency.afg", { defaultValue: "AFG" })}
            </Text>
          </View>
        </View>
        {status === TOURNAMENT_STATUS.FINISHED && detail.result && (
          <View style={styles.resultSection}>
            <Text style={[styles.resultTitle, localizedTextStyle]}>
              {t("tournaments.results", { defaultValue: "Results" })}
            </Text>
            <View
              style={[
                styles.resultRow,
                { flexDirection: getFlexDirection() },
              ]}
            >
              <Text style={[styles.resultLabel, localizedTextStyle]}>
                {t("tournaments.winner", { defaultValue: "Winner" })}:
              </Text>
              <Text style={[styles.resultValue, localizedTextStyle]}>
                {detail.result.winner}
              </Text>
            </View>
          </View>
        )}
        {status === TOURNAMENT_STATUS.UPCOMING && (
          <View style={styles.registrationInfo}>
            {isRegistrationOpen ? (
              <Text style={[styles.registrationOpen, localizedTextStyle]}>
                {t("tournaments.registrationOpenUntil", {
                  date: new Date(
                    detail.registrationDeadline || detail.startDate,
                  ).toLocaleDateString(),
                })}
              </Text>
            ) : (
              <Text style={[styles.registrationClosed, localizedTextStyle]}>
                {t("tournaments.registrationClosed")}
              </Text>
            )}
          </View>
        )}
        {countdown && (
          <View
            style={[
              styles.countdownCard,
              { flexDirection: getFlexDirection() },
            ]}
          >
            <Ionicons name="timer-outline" size={16} color={PRIMARY_DARK} />
            <Text
              style={[
                styles.countdownText,
                getStartMargin(8),
                localizedTextStyle,
              ]}
            >
              {t("tournaments.startsIn", { defaultValue: "Starts in" })}{" "}
              {countdown.hours}:{countdown.minutes}:{countdown.seconds}
            </Text>
          </View>
        )}
        {detail.description && (
          <Text style={[styles.description, localizedTextStyle]} numberOfLines={2}>
            {detail.description}
          </Text>
        )}
        {(() => {
          const progress = getTournamentProgressStatus(detail, groups, groupMatches, knockoutMatches);
          return (
            <View
              style={[
                styles.progressStatus,
                {
                  backgroundColor: progress.color + "20",
                  flexDirection: getFlexDirection(),
                },
              ]}
            >
              <Ionicons name={progress.icon} size={14} color={progress.color} />
              <Text
                style={[
                  styles.progressStatusText,
                  { color: progress.color },
                  getStartMargin(6),
                  localizedTextStyle,
                ]}
              >
                {progress.label}
              </Text>
            </View>
          );
        })()}
        <View style={[styles.cardActions, { flexDirection: getFlexDirection() }]}>
          {status === TOURNAMENT_STATUS.UPCOMING && isRegistrationOpen && (
            <TouchableOpacity
              style={[
                styles.addTeamButton,
                { flexDirection: getFlexDirection() },
              ]}
              onPress={() => openAddTeamModal(detail)}
            >
              <Ionicons name="person-add" size={16} color="#fff" />
              <Text style={[styles.addTeamButtonText, getStartMargin(6), localizedTextStyle]}>
                {t("tournaments.addTeam")}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.expandButton,
              { flexDirection: getFlexDirection() },
            ]}
            onPress={() => handleToggleCardExpansion(detail.id)}
          >
            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#fff" />
            <Text style={[styles.expandButtonText, getStartMargin(4), localizedTextStyle]}>
              {isExpanded ? t("tournaments.less") : t("tournaments.more")}
            </Text>
          </TouchableOpacity>
        </View>
        {isExpanded && (
          <View style={styles.expandedContent}>
            {awardItems.length > 0 && (
              <View style={styles.publicAwardsCard}>
                <View style={[styles.publicSectionHeader, { flexDirection: getFlexDirection() }]}>
                  <Ionicons name="ribbon-outline" size={18} color={PRIMARY_DARK} />
                  <Text style={[styles.publicSectionTitle, getStartMargin(6), localizedTextStyle]}>
                    {t("ownerDashboard.tournaments.awards", { defaultValue: "Awards" })}
                  </Text>
                </View>
                <View style={styles.publicAwardsList}>
                  {awardItems.map((award) => (
                    <View
                      key={award.position}
                      style={[styles.publicAwardItem, { flexDirection: getFlexDirection() }]}
                    >
                      <View style={styles.publicAwardIconBadge}>
                        <Ionicons
                          name={getPublicAwardIcon(award.position)}
                          size={18}
                          color={PRIMARY_DARK}
                        />
                      </View>
                      <View style={[styles.publicAwardTextGroup, getStartMargin(10)]}>
                        <Text style={[styles.publicAwardLabel, localizedTextStyle]}>
                          {award.label}
                        </Text>
                        <Text
                          style={[styles.publicAwardValue, localizedTextStyle]}
                          numberOfLines={2}
                        >
                          {award.value}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {groups.groupA?.length > 0 || groups.groupB?.length > 0 ? (
              <View style={styles.groupsSection}>
                <Text style={[styles.groupsTitle, localizedTextStyle]}>
                  {t("tournaments.tournamentGroups", {
                    defaultValue: "Tournament Groups",
                  })}
                </Text>
                <View style={styles.groupCard}>
                  <View style={[styles.groupHeader, { flexDirection: getFlexDirection() }]}>
                    <View style={[styles.groupBadge, styles.groupABadge]}><Text style={styles.groupBadgeText}>A</Text></View>
                    <Text style={[styles.groupName, localizedTextStyle]}>
                      {t("tournaments.groupA", { defaultValue: "Group A" })}
                    </Text>
                    <Text style={[styles.groupCount, localizedTextStyle]}>
                      ({groups.groupA?.length || 0} {t("tournaments.teams")})
                    </Text>
                  </View>
                  {groups.groupA?.length > 0 ? (
                    <View style={styles.groupTeamsList}>
                      {groups.groupA.map((team, idx) => {
                        const rosterKey = getTeamRosterKey(detail.id, team, "group-a", idx);
                        const isRosterExpanded = expandedTeamRoster === rosterKey;

                        return (
                          <View
                            key={team.id || team.teamId || idx}
                            style={[
                              styles.groupTeamItem,
                              { flexDirection: getFlexDirection() },
                            ]}
                          >
                            <Text style={styles.groupTeamRank}>{idx + 1}.</Text>
                            <View style={styles.groupTeamDetails}>
                              <TouchableOpacity
                                activeOpacity={0.75}
                                style={[
                                  styles.teamRosterToggle,
                                  { flexDirection: getFlexDirection() },
                                ]}
                                onPress={() => toggleTeamRoster(rosterKey)}
                              >
                                <Text
                                  style={[
                                    styles.groupTeamName,
                                    getStartMargin(8),
                                    localizedTextStyle,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {getPublicTeamName(team)}
                                </Text>
                                <Ionicons
                                  name={isRosterExpanded ? "chevron-up" : "chevron-down"}
                                  size={14}
                                  color="#6B7280"
                                />
                              </TouchableOpacity>
                              {isRosterExpanded && renderPublicTeamMembers(team)}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[styles.noTeamsText, localizedTextStyle]}>
                      {t("tournaments.noTeamsYet", { defaultValue: "No teams yet" })}
                    </Text>
                  )}
                </View>
                <View style={styles.groupCard}>
                  <View style={[styles.groupHeader, { flexDirection: getFlexDirection() }]}>
                    <View style={[styles.groupBadge, styles.groupBBadge]}><Text style={styles.groupBadgeText}>B</Text></View>
                    <Text style={[styles.groupName, localizedTextStyle]}>
                      {t("tournaments.groupB", { defaultValue: "Group B" })}
                    </Text>
                    <Text style={[styles.groupCount, localizedTextStyle]}>
                      ({groups.groupB?.length || 0} {t("tournaments.teams")})
                    </Text>
                  </View>
                  {groups.groupB?.length > 0 ? (
                    <View style={styles.groupTeamsList}>
                      {groups.groupB.map((team, idx) => {
                        const rosterKey = getTeamRosterKey(detail.id, team, "group-b", idx);
                        const isRosterExpanded = expandedTeamRoster === rosterKey;

                        return (
                          <View
                            key={team.id || team.teamId || idx}
                            style={[
                              styles.groupTeamItem,
                              { flexDirection: getFlexDirection() },
                            ]}
                          >
                            <Text style={styles.groupTeamRank}>{idx + 1}.</Text>
                            <View style={styles.groupTeamDetails}>
                              <TouchableOpacity
                                activeOpacity={0.75}
                                style={[
                                  styles.teamRosterToggle,
                                  { flexDirection: getFlexDirection() },
                                ]}
                                onPress={() => toggleTeamRoster(rosterKey)}
                              >
                                <Text
                                  style={[
                                    styles.groupTeamName,
                                    getStartMargin(8),
                                    localizedTextStyle,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {getPublicTeamName(team)}
                                </Text>
                                <Ionicons
                                  name={isRosterExpanded ? "chevron-up" : "chevron-down"}
                                  size={14}
                                  color="#6B7280"
                                />
                              </TouchableOpacity>
                              {isRosterExpanded && renderPublicTeamMembers(team)}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[styles.noTeamsText, localizedTextStyle]}>
                      {t("tournaments.noTeamsYet", { defaultValue: "No teams yet" })}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.registeredTeamsSection}>
                <Text style={[styles.registeredTeamsTitle, localizedTextStyle]}>
                  {t("tournaments.registeredTeams", { count: registeredTeams.length })}
                </Text>
                {registeredTeams.length > 0 ? (
                  registeredTeams.map((team, index) => (
                    <View
                      key={team.id || index}
                      style={[styles.teamItem, { flexDirection: getFlexDirection() }]}
                    >
                      <View
                        style={[
                          styles.teamInfo,
                          { flexDirection: getFlexDirection() },
                        ]}
                      >
                        <Ionicons name="people" size={16} color={PRIMARY_DARK} />
                        <Text
                          style={[
                            styles.teamName,
                            getStartMargin(8),
                            localizedTextStyle,
                          ]}
                        >
                          {team.captainName}
                        </Text>
                      </View>
                      <Text style={[styles.teamPhone, ltrValueTextStyle]}>{team.phoneNumber}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.noTeamsText, localizedTextStyle]}>
                    {t("tournaments.noTeamsRegisteredYet")}
                  </Text>
                )}
              </View>
            )}

            {groupMatches.length > 0 && (
              <View style={styles.matchesSection}>
                <Text style={[styles.matchesSectionTitle, localizedTextStyle]}>
                  {t("tournaments.groupStageMatches", {
                    defaultValue: "Group Stage Matches",
                  })}{" "}
                  ({groupMatches.length})
                </Text>
                {groupMatches.map((match, idx) => (
                  <View key={match.id || idx} style={styles.matchItem}>
                    <View
                      style={[
                        styles.matchGroupBadge,
                        match.group === "Group A"
                          ? styles.groupABadgeMatch
                          : styles.groupBBadgeMatch,
                        rtl ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" },
                      ]}
                    >
                      <Text style={[styles.matchGroupText, localizedTextStyle]}>
                        {match.group}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.matchTeams,
                        { flexDirection: getFlexDirection() },
                      ]}
                    >
                      <Text style={[styles.matchTeamName, localizedTextStyle]}>
                        {match.team1Name ||
                          t("tournaments.tbd", { defaultValue: "TBD" })}
                      </Text>
                      <Text style={styles.matchVS}>
                        {t("tournaments.vs", { defaultValue: "vs" })}
                      </Text>
                      <Text style={[styles.matchTeamName, localizedTextStyle]}>
                        {match.team2Name ||
                          t("tournaments.tbd", { defaultValue: "TBD" })}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.matchStatusText,
                        match.status === "completed"
                          ? ltrValueTextStyle
                          : localizedTextStyle,
                      ]}
                    >
                      {match.status === "completed"
                        ? `${match.score1} - ${match.score2}`
                        : getTournamentStatusLabel(match.status)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {groupAStandings.length > 0 && (
              <View style={styles.standingsSection}>
                <Text style={[styles.standingsTitle, localizedTextStyle]}>
                  {t("tournaments.groupAStandings", {
                    defaultValue: "Group A Standings",
                  })}
                </Text>
                <View style={styles.standingsTable}>
                  <View
                    style={[
                      styles.standingsHeader,
                      { flexDirection: getFlexDirection() },
                    ]}
                  >
                    <Text
                      style={[
                        styles.standingsHeaderText,
                        styles.colTeam,
                        localizedTextStyle,
                      ]}
                    >
                      {t("tournaments.team", { defaultValue: "Team" })}
                    </Text>
                    <Text style={[styles.standingsHeaderText, styles.colP]}>P</Text>
                    <Text style={[styles.standingsHeaderText, styles.colW]}>
                      {t("tournaments.winsShort", { defaultValue: "W" })}
                    </Text>
                    <Text style={[styles.standingsHeaderText, styles.colD]}>
                      {t("tournaments.drawsShort", { defaultValue: "D" })}
                    </Text>
                    <Text style={[styles.standingsHeaderText, styles.colL]}>
                      {t("tournaments.lossesShort", { defaultValue: "L" })}
                    </Text>
                    <Text style={[styles.standingsHeaderText, styles.colGD]}>GD</Text>
                    <Text style={[styles.standingsHeaderText, styles.colPts]}>
                      {t("tournaments.pointsShort", { defaultValue: "Pts" })}
                    </Text>
                  </View>
                  {groupAStandings.map((stat, idx) => (
                    <View
                      key={stat.teamId || idx}
                      style={[
                        styles.standingsRow,
                        { flexDirection: getFlexDirection() },
                        idx < 2 && styles.qualifierRow,
                      ]}
                    >
                      <Text
                        style={[
                          styles.standingsCell,
                          styles.colTeam,
                          localizedTextStyle,
                        ]}
                      >
                        {idx + 1}. {stat.teamName}
                      </Text>
                      <Text style={[styles.standingsCell, styles.colP]}>{stat.played}</Text>
                      <Text style={[styles.standingsCell, styles.colW]}>{stat.wins}</Text>
                      <Text style={[styles.standingsCell, styles.colD]}>{stat.draws}</Text>
                      <Text style={[styles.standingsCell, styles.colL]}>{stat.losses}</Text>
                      <Text style={[styles.standingsCell, styles.colGD]}>{stat.goalDifference}</Text>
                      <Text style={[styles.standingsCellPts, styles.colPts]}>{stat.points}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {groupBStandings.length > 0 && (
              <View style={styles.standingsSection}>
                <Text style={[styles.standingsTitle, localizedTextStyle]}>
                  {t("tournaments.groupBStandings", {
                    defaultValue: "Group B Standings",
                  })}
                </Text>
                <View style={styles.standingsTable}>
                  <View
                    style={[
                      styles.standingsHeader,
                      { flexDirection: getFlexDirection() },
                    ]}
                  >
                    <Text
                      style={[
                        styles.standingsHeaderText,
                        styles.colTeam,
                        localizedTextStyle,
                      ]}
                    >
                      {t("tournaments.team", { defaultValue: "Team" })}
                    </Text>
                    <Text style={[styles.standingsHeaderText, styles.colP]}>P</Text>
                    <Text style={[styles.standingsHeaderText, styles.colW]}>
                      {t("tournaments.winsShort", { defaultValue: "W" })}
                    </Text>
                    <Text style={[styles.standingsHeaderText, styles.colD]}>
                      {t("tournaments.drawsShort", { defaultValue: "D" })}
                    </Text>
                    <Text style={[styles.standingsHeaderText, styles.colL]}>
                      {t("tournaments.lossesShort", { defaultValue: "L" })}
                    </Text>
                    <Text style={[styles.standingsHeaderText, styles.colGD]}>GD</Text>
                    <Text style={[styles.standingsHeaderText, styles.colPts]}>
                      {t("tournaments.pointsShort", { defaultValue: "Pts" })}
                    </Text>
                  </View>
                  {groupBStandings.map((stat, idx) => (
                    <View
                      key={stat.teamId || idx}
                      style={[
                        styles.standingsRow,
                        { flexDirection: getFlexDirection() },
                        idx < 2 && styles.qualifierRow,
                      ]}
                    >
                      <Text
                        style={[
                          styles.standingsCell,
                          styles.colTeam,
                          localizedTextStyle,
                        ]}
                      >
                        {idx + 1}. {stat.teamName}
                      </Text>
                      <Text style={[styles.standingsCell, styles.colP]}>{stat.played}</Text>
                      <Text style={[styles.standingsCell, styles.colW]}>{stat.wins}</Text>
                      <Text style={[styles.standingsCell, styles.colD]}>{stat.draws}</Text>
                      <Text style={[styles.standingsCell, styles.colL]}>{stat.losses}</Text>
                      <Text style={[styles.standingsCell, styles.colGD]}>{stat.goalDifference}</Text>
                      <Text style={[styles.standingsCellPts, styles.colPts]}>{stat.points}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {knockoutMatches.length > 0 && (
              <View style={styles.knockoutSection}>
                <Text style={[styles.knockoutTitle, localizedTextStyle]}>
                  {t("tournaments.knockoutStage")}
                </Text>
                {knockoutMatches.map((match, idx) => (
                  <View key={match.id || idx} style={styles.knockoutMatchItem}>
                    <View
                      style={[
                        styles.knockoutMatchHeader,
                        { flexDirection: getFlexDirection() },
                      ]}
                    >
                      <Text style={[styles.knockoutRound, localizedTextStyle]}>
                        {match.round}
                      </Text>
                      {match.status === "completed" && <View style={styles.championBadge}><Text style={styles.championBadgeText}>{t("tournaments.status.completed")}</Text></View>}
                    </View>
                    <View
                      style={[
                        styles.matchTeams,
                        { flexDirection: getFlexDirection() },
                      ]}
                    >
                      <Text style={[styles.matchTeamName, localizedTextStyle]}>
                        {match.team1Name ||
                          t("tournaments.tbd", { defaultValue: "TBD" })}
                      </Text>
                      <Text style={styles.matchVS}>
                        {t("tournaments.vs", { defaultValue: "vs" })}
                      </Text>
                      <Text style={[styles.matchTeamName, localizedTextStyle]}>
                        {match.team2Name ||
                          t("tournaments.tbd", { defaultValue: "TBD" })}
                      </Text>
                    </View>
                    {match.status === "completed" && (
                      <Text style={[styles.winnerText, localizedTextStyle]}>
                        {t("tournaments.winner", { defaultValue: "Winner" })}:{" "}
                        {match.winner === match.team1Id
                          ? match.team1Name
                          : match.team2Name}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {detail.finalRanking && detail.finalRanking.length > 0 && (
              <View style={styles.rankingSection}>
                <Text style={[styles.rankingTitle, localizedTextStyle]}>
                  {t("tournaments.finalRanking", { defaultValue: "Final Ranking" })}
                </Text>
                {detail.finalRanking.map((rank, idx) => (
                  <View
                    key={rank.teamId || idx}
                    style={[
                      styles.rankingItem,
                      { flexDirection: getFlexDirection() },
                      idx < 3 && styles.topThreeRanking,
                    ]}
                  >
                    <Text style={styles.rankingPosition}>{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${rank.position}`}</Text>
                    <Text
                      style={[
                        styles.rankingTeamName,
                        getStartMargin(8),
                        localizedTextStyle,
                      ]}
                    >
                      {rank.teamName}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.registeredTeamsTitle, localizedTextStyle]}>
              {t("tournaments.registeredTeams", { count: registeredTeams.length })}
            </Text>
            {registeredTeams.length > 0 ? (
              registeredTeams.map((team, index) => (
                <View
                  key={team.id || index}
                  style={[styles.teamItem, { flexDirection: getFlexDirection() }]}
                >
                  <View
                    style={[
                      styles.teamInfo,
                      { flexDirection: getFlexDirection() },
                    ]}
                  >
                    <Ionicons name="people" size={16} color="#24a731" />
                    <Text
                      style={[
                        styles.teamName,
                        getStartMargin(8),
                        localizedTextStyle,
                      ]}
                    >
                      {team.captainName}
                    </Text>
                  </View>
                  <Text style={[styles.teamPhone, ltrValueTextStyle]}>{team.phoneNumber}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.noTeamsText, localizedTextStyle]}>
                {t("tournaments.noTeamsRegisteredYet")}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { flexDirection: getFlexDirection() }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name={rtl ? "arrow-forward" : "arrow-back"} size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, localizedTextStyle]}>{t("tournaments.title")}</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={[styles.filterContainer, { flexDirection: getFlexDirection() }]}>
        <TouchableOpacity style={[styles.filterButton, activeFilter === "all" && styles.filterButtonActive]} onPress={() => setActiveFilter("all")}>
          <Text style={[styles.filterText, localizedTextStyle, activeFilter === "all" && styles.filterTextActive]}>{t("tournaments.all")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterButton, activeFilter === "upcoming" && styles.filterButtonActive]} onPress={() => setActiveFilter("upcoming")}>
          <Text style={[styles.filterText, localizedTextStyle, activeFilter === "upcoming" && styles.filterTextActive]}>{t("tournaments.status.upcoming")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterButton, activeFilter === TOURNAMENT_STATUS.ONGOING && styles.filterButtonActive]} onPress={() => setActiveFilter(TOURNAMENT_STATUS.ONGOING)}>
          <Text style={[styles.filterText, localizedTextStyle, activeFilter === TOURNAMENT_STATUS.ONGOING && styles.filterTextActive]}>{t("tournaments.status.inProgress")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterButton, activeFilter === TOURNAMENT_STATUS.FINISHED && styles.filterButtonActive]} onPress={() => setActiveFilter(TOURNAMENT_STATUS.FINISHED)}>
          <Text style={[styles.filterText, localizedTextStyle, activeFilter === TOURNAMENT_STATUS.FINISHED && styles.filterTextActive]}>{t("tournaments.status.completed")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterButton, activeFilter === TOURNAMENT_STATUS.CANCELLED && styles.filterButtonActive]} onPress={() => setActiveFilter(TOURNAMENT_STATUS.CANCELLED)}>
          <Text style={[styles.filterText, localizedTextStyle, activeFilter === TOURNAMENT_STATUS.CANCELLED && styles.filterTextActive]}>{t("tournaments.status.canceled")}</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.searchContainer, { flexDirection: getFlexDirection(true) }]}>
        <Ionicons
          name="search"
          size={20}
          color={PRIMARY_COLOR}
          style={[styles.searchIcon, getEndMargin(12)]}
        />
        <TextInput
          style={[
            styles.searchInput,
            {
              // textAlign: getTextAlign(),
              writingDirection: getWritingDirection(),
            },
          ]}
          placeholder={t("tournaments.searchPlaceholder")}
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearButton}>
            <Ionicons name="close" size={20} color={PRIMARY_COLOR} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.legendCard}>
        <View style={[styles.legendContent, { flexDirection: getFlexDirection() }]}>
          {STANDINGS_LEGEND.map((item) => (
            <View
              key={item.key}
              style={[styles.legendItem, { flexDirection: getFlexDirection() }]}
            >
              <Text style={styles.legendKey}>{item.key}</Text>
              <Text style={[styles.legendLabel, getStartMargin(4), localizedTextStyle]}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {!tournamentsLoaded ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={60} color={PRIMARY_COLOR} />
          <Text style={[styles.emptyTitle, localizedTextStyle]}>{t("tournaments.loading")}</Text>
          <Text style={[styles.emptySubtext, localizedTextStyle]}>{t("tournaments.loadingMessage")}</Text>
        </View>
      ) : tournamentsError ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={60} color={PRIMARY_COLOR} />
          <Text style={[styles.emptyTitle, localizedTextStyle]}>
            {t("tournaments.loadError", {
              defaultValue: t("tournaments.unableToLoad"),
            })}
          </Text>
          <Text style={[styles.emptySubtext, localizedTextStyle]}>{tournamentsError}</Text>
        </View>
      ) : filteredTournaments.length > 0 ? (
        <FlatList data={filteredTournaments} renderItem={renderTournamentItem} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={60} color={PRIMARY_COLOR} />
          <Text style={[styles.emptyTitle, localizedTextStyle]}>{t("tournaments.noTournaments")}</Text>
          <Text style={[styles.emptySubtext, localizedTextStyle]}>
            {searchQuery ? `"${searchQuery}"` : t("tournaments.noTournaments")}
          </Text>
        </View>
      )}
      <Modal visible={showTeamModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTeamModal(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContainer}>
            <View style={[styles.modalHeader, { flexDirection: getFlexDirection() }]}>
              <TouchableOpacity onPress={() => setShowTeamModal(false)}>
                <Ionicons name="close" size={28} color={PRIMARY_COLOR} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, localizedTextStyle]}>{t("tournaments.registerTeam")}</Text>
              <View style={{ width: 28 }} />
            </View>
            <ScrollView style={styles.modalContent}>
              <Text
                style={[
                  styles.tournamentInfo,
                  {
                    textAlign: getTextAlign(),
                    writingDirection: getWritingDirection(),
                  },
                ]}
              >
                {t("tournaments.tournamentLabel")}: {selectedTournament?.name}
              </Text>
              <Text
                style={[
                  styles.tournamentInfo,
                  {
                    textAlign: getTextAlign(),
                    writingDirection: getWritingDirection(),
                  },
                ]}
              >
                {t("tournaments.registrationFee")}: {selectedTournament?.entryFee}{" "}
                {t("common.currency.afg", { defaultValue: "AFG" })}
              </Text>
              <Text style={[styles.inputLabel, localizedTextStyle]}>{t("tournaments.captainName")} *</Text>
              <View style={[styles.inputContainer, { flexDirection: getFlexDirection() }]}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={PRIMARY_COLOR}
                  style={[styles.inputIcon, getEndMargin(12)]}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      textAlign: getTextAlign(),
                      writingDirection: getWritingDirection(),
                    },
                  ]}
                  placeholder={t("tournaments.captainName")}
                  placeholderTextColor="#999"
                  value={captainName}
                  onChangeText={setCaptainName}
                />
              </View>
              <Text style={[styles.inputLabel, localizedTextStyle]}>{t("tournaments.phoneNumber")} *</Text>
              <View style={[styles.inputContainer, { flexDirection: getFlexDirection() }]}>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={PRIMARY_COLOR}
                  style={[styles.inputIcon, getEndMargin(12)]}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      textAlign: "left",
                      writingDirection: "ltr",
                    },
                  ]}
                  placeholder={t("tournaments.phoneNumber")}
                  placeholderTextColor="#999"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                />
              </View>
              <Text style={[styles.inputLabel, localizedTextStyle]}>{t("tournaments.registrationFee")} *</Text>
              <View style={[styles.inputContainer, { flexDirection: getFlexDirection() }]}>
                <Ionicons
                  name="cash-outline"
                  size={20}
                  color={PRIMARY_COLOR}
                  style={[styles.inputIcon, getEndMargin(12)]}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      textAlign: "left",
                      writingDirection: "ltr",
                    },
                  ]}
                  placeholder={`${selectedTournament?.entryFee || 0} ${t("common.currency.afg", { defaultValue: "AFG" })}`}
                  placeholderTextColor="#999"
                  value={registrationFee}
                  onChangeText={(text) => { setRegistrationFee(text); setFeeError(""); }}
                  keyboardType="numeric"
                />
              </View>
              {feeError ? <Text style={[styles.errorText, localizedTextStyle]}>{feeError}</Text> : null}
              <Text style={[styles.inputLabel, localizedTextStyle]}>
                {t("tournaments.teamMembers", { count: REQUIRED_TEAM_MEMBERS })} *
              </Text>
              {teamMembers.map((member, index) => (
                <View key={`team-member-${index}`} style={styles.memberRow}>
                  <Text style={[styles.memberIndex, localizedTextStyle]}>
                    {t("tournaments.memberNumber", { number: index + 1 })}
                  </Text>
                  <View style={[styles.inputContainer, styles.memberInputContainer, { flexDirection: getFlexDirection() }]}>
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={PRIMARY_COLOR}
                      style={[styles.inputIcon, getEndMargin(10)]}
                    />
                    <TextInput
                      style={[
                        styles.input,
                        {
                          textAlign: getTextAlign(),
                          writingDirection: getWritingDirection(),
                        },
                      ]}
                      placeholder={t("tournaments.memberName")}
                      placeholderTextColor="#999"
                      value={member.name}
                      onChangeText={(text) => updateTeamMember(index, "name", text)}
                    />
                  </View>
                  <View style={[styles.inputContainer, styles.memberInputContainer, { flexDirection: getFlexDirection() }]}>
                    <Ionicons
                      name="football-outline"
                      size={18}
                      color={PRIMARY_COLOR}
                      style={[styles.inputIcon, getEndMargin(10)]}
                    />
                    <TextInput
                      style={[
                        styles.input,
                        {
                          textAlign: getTextAlign(),
                          writingDirection: getWritingDirection(),
                        },
                      ]}
                      placeholder={t("tournaments.memberRole")}
                      placeholderTextColor="#999"
                      value={member.role}
                      onChangeText={(text) => updateTeamMember(index, "role", text)}
                    />
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.submitButton, { flexDirection: getFlexDirection() }]}
                onPress={handleAddTeam}
                disabled={submittingTeam}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                {submittingTeam ? (
                  <ActivityIndicator
                    color="#fff"
                    style={[styles.submitButtonLoader, getStartMargin(8)]}
                  />
                ) : (
                    <Text style={[styles.submitButtonText, getStartMargin(8), localizedTextStyle]}>
                      {t("tournaments.registerTeam")}
                    </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1,
     backgroundColor: "#F3F4F6" 
    
    },
  searchContainer: { alignItems: "center", backgroundColor: "#fff", marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 25, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 16, color: "#1F2937", backgroundColor: "transparent" },
  clearButton: { padding: 4 },
  legendCard: {
    backgroundColor: "#fff",
    borderColor: PRIMARY_BORDER,
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  legendContent: {
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  legendItem: {
    alignItems: "center",
    backgroundColor: PRIMARY_TINT,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  legendKey: {
    color: PRIMARY_DARK,
    fontSize: 12,
    fontWeight: "800",
    minWidth: 20,
    textAlign: "center",
    writingDirection: "ltr",
  },
  legendLabel: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "500",
  },
  header: { backgroundColor: "#24a731", padding: 20, paddingTop: 50, justifyContent: "space-between", alignItems: "center" },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: "bold",
     color: "#fff" 
    
    },
    filterContainer: {
      width: "100%",
       padding: 12,
  backgroundColor: "#fff",
  // borderBottomWidth:,
  borderBottomColor: "#E5E7EB",


  flexDirection: "row",
  justifyContent: "space-around",
  alignItems: "center",

  // flexWrap: "wrap",
  gap: 8,
},



  // filterContainer: { padding: 12, backgroundColor: "#bc3939", borderBottomWidth: 1, borderBottomColor: "#E5E7EB", 
  //   flexWrap: "wrap", gap: 4  },
 
  filterButton: { paddingVertical: 8, paddingHorizontal:8, borderRadius: 20, backgroundColor: "#24a731" },
  filterButtonActive: { backgroundColor: PRIMARY_DARK },
  filterText: { fontSize: 13, color: "#fff", fontWeight: "500" },
  filterTextActive: { color: "#fff" },
  listContent: { padding: 16 },
  tournamentCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10 },
  tournamentHeader: { justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  tournamentTitleRow: { alignItems: "center", flex: 1 },
  tournamentName: { fontSize: 18, fontWeight: "bold", color: "#1F2937" },
  statusBadge: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: "600" },
  tournamentDetails: { marginBottom: 8 },
  detailRow: { alignItems: "center", marginBottom: 6 },
  detailText: { fontSize: 14, color: "#6B7280" },
  resultSection: { backgroundColor: "#FEF3C7", borderRadius: 8, padding: 12, marginTop: 8 },
  resultTitle: { fontSize: 14, fontWeight: "bold", color: "#92400E", marginBottom: 8 },
  resultRow: { marginBottom: 4, justifyContent: "space-between", gap: 12 },
  resultLabel: { fontSize: 14, color: "#92400E", fontWeight: "600", width: 80 },
  resultValue: { fontSize: 14, color: "#92400E" },
  registrationInfo: { marginTop: 8 },
  registrationOpen: { fontSize: 13, color: PRIMARY_COLOR, fontWeight: "500" },
  registrationClosed: { fontSize: 13, color: "#EF4444", fontWeight: "500" },
  countdownCard: {
    alignItems: "center",
    backgroundColor: PRIMARY_TINT,
    borderRadius: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  countdownText: {
    color: PRIMARY_DARK,
    fontSize: 13,
    fontWeight: "600",
  },
  description: { fontSize: 13, color: "#6B7280", marginTop: 8, fontStyle: "italic" },
  cardActions: { justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  addTeamButton: { alignItems: "center", backgroundColor: PRIMARY_COLOR, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  addTeamButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  expandButton: { alignItems: "center", backgroundColor: PRIMARY_DARK, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  expandButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  expandedContent: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  publicAwardsCard: {
    backgroundColor: "#F9FAFB",
    borderColor: PRIMARY_BORDER,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    padding: 12,
  },
  publicSectionHeader: {
    alignItems: "center",
    marginBottom: 10,
  },
  publicSectionTitle: {
    color: "#1F2937",
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
  },
  publicAwardsList: {
    gap: 8,
  },
  publicAwardItem: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#E5E7EB",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  publicAwardIconBadge: {
    alignItems: "center",
    backgroundColor: PRIMARY_TINT,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  publicAwardTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  publicAwardLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  publicAwardValue: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  groupsSection: { marginBottom: 16 },
  groupsTitle: { fontSize: 16, fontWeight: "bold", color: "#1F2937", marginBottom: 12 },
  groupCard: { backgroundColor: "#F3F4F6", borderRadius: 12, marginBottom: 12, overflow: "hidden" },
  groupHeader: { alignItems: "center", padding: 12 },
  groupBadge: { width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  groupABadge: { backgroundColor: PRIMARY_DARK },
  groupBBadge: { backgroundColor: PRIMARY_COLOR },
  groupBadgeText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  groupName: { fontSize: 14, fontWeight: "bold", color: "#1F2937", flex: 1 },
  groupCount: { fontSize: 12, color: "#6B7280" },
  groupTeamsList: { padding: 12, paddingTop: 0, overflow: "hidden" },
  groupTeamItem: { alignItems: "center", paddingVertical: 6 },
  groupTeamRank: { fontSize: 14, fontWeight: "600", color: "#6B7280", width: 24 },
  groupTeamDetails: { flex: 1 },
  teamRosterToggle: { alignItems: "center", gap: 6, minHeight: 28 },
  groupTeamName: { flex: 1, fontSize: 14, color: "#1F2937" },
  publicTeamMembers: { marginTop: 4, maxHeight: 132, overflow: "hidden", gap: 2 },
  publicTeamMemberText: { fontSize: 12, lineHeight: 16, color: "#6B7280" },
  registeredTeamsSection: { marginBottom: 16 },
  registeredTeamsTitle: { fontSize: 14, fontWeight: "bold", color: "#1F2937", marginBottom: 8 },
  teamItem: { justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  teamInfo: { alignItems: "center" },
  teamName: { fontSize: 14, color: "#1F2937" },
  teamPhone: { fontSize: 13, color: "#6B7280" },
  noTeamsText: { fontSize: 13, color: "#9CA3AF", fontStyle: "italic", padding: 12 },
  matchesSection: { marginBottom: 16 },
  matchesSectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1F2937", marginBottom: 12 },
  matchItem: { padding: 12, backgroundColor: "#F3F4F6", borderRadius: 8, marginBottom: 8 },
  matchGroupBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 8 },
  groupABadgeMatch: { backgroundColor: PRIMARY_TINT },
  groupBBadgeMatch: { backgroundColor: PRIMARY_TINT },
  matchGroupText: { fontSize: 10, fontWeight: "600", color: "#6B7280" },
  matchTeams: { justifyContent: "space-between", alignItems: "center" },
  matchTeamName: { fontSize: 14, fontWeight: "600", color: "#1F2937", flex: 1, textAlign: "center" },
  matchVS: { fontSize: 12, fontWeight: "bold", color: "#6B7280", marginHorizontal: 8 },
  matchStatusText: { fontSize: 12, color: "#6B7280", textAlign: "center", marginTop: 4 },
  standingsSection: { marginBottom: 16 },
  standingsTitle: { fontSize: 16, fontWeight: "bold", color: "#1F2937", marginBottom: 12 },
  standingsTable: { backgroundColor: "#fff", borderRadius: 12, overflow: "hidden" },
  standingsHeader: { backgroundColor: "#F3F4F6", paddingVertical: 8, paddingHorizontal: 12 },
  standingsHeaderText: { fontSize: 12, fontWeight: "600", color: "#6B7280", textAlign: "center" },
  standingsRow: { paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  qualifierRow: { backgroundColor: PRIMARY_TINT },
  standingsCell: { fontSize: 12, color: "#1F2937", textAlign: "center" },
  standingsCellPts: { fontSize: 12, fontWeight: "bold", color: PRIMARY_DARK, textAlign: "center" },
  colTeam: { flex: 2 },
  colP: { width: 25 }, colW: { width: 25 }, colD: { width: 25 }, colL: { width: 25 }, colGD: { width: 30 }, colPts: { width: 30 },
  knockoutSection: { marginBottom: 16 },
  knockoutTitle: { fontSize: 16, fontWeight: "bold", color: "#92400E", marginBottom: 12 },
  knockoutMatchItem: { backgroundColor: "#FEF3C7", padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 2, borderColor: "#F59E0B" },
  knockoutMatchHeader: { justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  knockoutRound: { fontSize: 12, fontWeight: "600", color: "#92400E" },
  championBadge: { backgroundColor: PRIMARY_COLOR, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  championBadgeText: { fontSize: 10, color: "#fff", fontWeight: "600" },
  winnerText: { fontSize: 12, color: PRIMARY_COLOR, fontWeight: "600", marginTop: 4, textAlign: "center" },
  championSection: { backgroundColor: "#FEF3C7", padding: 20, borderRadius: 12, alignItems: "center", marginBottom: 16 },
  championLabel: { fontSize: 14, color: "#92400E", marginTop: 8 },
  championName: { fontSize: 20, fontWeight: "bold", color: "#92400E", marginTop: 4 },
  rankingSection: { marginBottom: 16 },
  rankingTitle: { fontSize: 16, fontWeight: "bold", color: "#1F2937", marginBottom: 12 },
  rankingItem: { alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#F3F4F6", borderRadius: 8, marginBottom: 6 },
  topThreeRanking: { backgroundColor: "#FEF3C7" },
  rankingPosition: { fontSize: 16, fontWeight: "bold", width: 40 },
  rankingTeamName: { fontSize: 14, color: "#1F2937" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: "#6B7280", marginTop: 16 },
  emptySubtext: { fontSize: 14, color: "#9CA3AF", textAlign: "center", marginTop: 8 },
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: { justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#1F2937" },
  modalContent: { flex: 1, padding: 16 },
  tournamentInfo: { fontSize: 14, color: "#6B7280", marginBottom: 8 },
  inputLabel: { fontSize: 14, fontWeight: "600", color: "#1F2937", marginTop: 16, marginBottom: 8 },
  inputContainer: { alignItems: "center", backgroundColor: PRIMARY_TINT, borderRadius: 12, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: PRIMARY_BORDER },
  inputIcon: {},
  input: { flex: 1, fontSize: 16, color: "#1F2937" },
  memberRow: { marginBottom: 12 },
  memberIndex: { fontSize: 13, fontWeight: "600", color: "#4B5563", marginBottom: 6 },
  memberInputContainer: { marginBottom: 8 },
  errorText: { fontSize: 12, color: "#EF4444", marginTop: 4 },
  submitButton: { alignItems: "center", justifyContent: "center", backgroundColor: PRIMARY_COLOR, padding: 14, borderRadius: 12, marginTop: 24 },
  submitButtonLoader: {},
  submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  progressStatus: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginTop: 8 },
  progressStatusText: { fontSize: 12, fontWeight: "600" },
});
