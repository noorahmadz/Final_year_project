import i18n from "../i18n";

export const TOURNAMENT_STATUS = {
  UPCOMING: "upcoming",
  ONGOING: "ongoing",
  FINISHED: "finished",
  CANCELLED: "cancelled",
};

export const getTournamentStatusLabel = (status) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const labels = {
    upcoming: ["tournaments.status.upcoming", "Upcoming"],
    ongoing: ["tournaments.status.ongoing", "In Progress"],
    in_progress: ["tournaments.status.inProgress", "In Progress"],
    finished: ["tournaments.status.finished", "Completed"],
    completed: ["tournaments.status.completed", "Completed"],
    cancelled: ["tournaments.status.cancelled", "Cancelled"],
    canceled: ["tournaments.status.canceled", "Cancelled"],
    registration_open: [
      "tournaments.status.registrationOpen",
      "Registration Open",
    ],
  };
  const labelConfig = labels[normalizedStatus];

  if (!labelConfig) {
    return status || "";
  }

  const [key, defaultValue] = labelConfig;
  return i18n.t(key, { defaultValue });
};

export const getTournamentStageLabel = (stage) => {
  const normalizedStage = String(stage || "").trim().toLowerCase();
  const labels = {
    group: ["tournaments.stage.group", "Group Stage"],
    knockout: ["tournaments.stage.knockout", "Knockout"],
    final: ["tournaments.stage.final", "Final"],
  };
  const labelConfig = labels[normalizedStage];

  if (!labelConfig) {
    return stage || "";
  }

  const [key, defaultValue] = labelConfig;
  return i18n.t(key, { defaultValue });
};

export const normalizeTournamentStatus = (status) => {
  switch (status) {
    case "upcoming":
      return TOURNAMENT_STATUS.UPCOMING;
    case "ongoing":
    case "in_progress":
      return TOURNAMENT_STATUS.ONGOING;
    case "finished":
    case "completed":
      return TOURNAMENT_STATUS.FINISHED;
    case "cancelled":
    case "canceled":
      return TOURNAMENT_STATUS.CANCELLED;
    default:
      return status || TOURNAMENT_STATUS.UPCOMING;
  }
};

export const adaptMatch = (apiData) => {
  if (!apiData) {
    return null;
  }

  const stage = apiData.stage ?? apiData.round ?? "group";
  const roundLabel =
    apiData.round ??
    ({
      group: getTournamentStageLabel("group"),
      knockout: getTournamentStageLabel("knockout"),
      final: getTournamentStageLabel("final"),
      knockout_match_1: "Match 1",
      knockout_match_2: "Match 2",
      knockout_match_3: "Challenge Match",
    }[stage] || stage);
  const knockoutPosition =
    apiData.knockoutPosition ??
    ({
      knockout_match_1: 1,
      knockout_match_2: 2,
      knockout_match_3: 3,
    }[stage] ?? null);

  return {
    ...apiData,
    id: apiData.id ?? apiData.match_id ?? null,
    tournamentId: apiData.tournamentId ?? apiData.tournament ?? null,
    team1Id: apiData.team1Id ?? apiData.team1 ?? null,
    team2Id: apiData.team2Id ?? apiData.team2 ?? null,
    team1Name: apiData.team1Name ?? apiData.team1_name ?? "TBD",
    team2Name: apiData.team2Name ?? apiData.team2_name ?? "TBD",
    round: roundLabel,
    knockoutPosition,
    score1: apiData.score1 ?? apiData.team1_score ?? null,
    score2: apiData.score2 ?? apiData.team2_score ?? null,
    winner: apiData.winner ?? apiData.winner_team ?? null,
    topPlayerId: apiData.topPlayerId ?? apiData.top_player ?? null,
    topPlayerName: apiData.topPlayerName ?? apiData.top_player_name ?? "",
    topPlayerRole: apiData.topPlayerRole ?? apiData.top_player_role ?? "",
    topPlayerTeamId: apiData.topPlayerTeamId ?? apiData.top_player_team ?? null,
    topPlayerGoals: apiData.topPlayerGoals ?? apiData.top_player_goals ?? null,
    playerGoals: Array.isArray(apiData.playerGoals)
      ? apiData.playerGoals
      : Array.isArray(apiData.player_goals)
        ? apiData.player_goals
        : [],
    status: apiData.status ?? "scheduled",
    group:
      apiData.group ??
      (apiData.group_name
        ? i18n.t("tournaments.stage.groupName", {
            name: apiData.group_name,
            defaultValue: `Group ${apiData.group_name}`,
          })
        : stage === "group"
          ? getTournamentStageLabel("group")
          : stage === "final"
            ? getTournamentStageLabel("final")
            : getTournamentStageLabel("knockout")),
  };
};

export const adaptStandings = (apiData) => {
  if (!apiData) {
    return { groupA: [], groupB: [] };
  }

  const mapEntry = (entry) => ({
    ...entry,
    teamId: entry.teamId ?? entry.team_id ?? null,
    teamName: entry.teamName ?? entry.team_name ?? "Unknown Team",
    goalsFor: entry.goalsFor ?? entry.goals_for ?? 0,
    goalsAgainst: entry.goalsAgainst ?? entry.goals_against ?? 0,
    goalDifference: entry.goalDifference ?? entry.goal_difference ?? 0,
  });

  if (Array.isArray(apiData)) {
    return apiData.map(mapEntry);
  }

  return {
    groupA: Array.isArray(apiData.groupA)
      ? apiData.groupA.map(mapEntry)
      : Array.isArray(apiData.A)
        ? apiData.A.map(mapEntry)
        : [],
    groupB: Array.isArray(apiData.groupB)
      ? apiData.groupB.map(mapEntry)
      : Array.isArray(apiData.B)
        ? apiData.B.map(mapEntry)
        : [],
  };
};

const adaptTeamMembers = (members) => {
  if (!Array.isArray(members)) {
    return [];
  }

  return members.map((member, index) => ({
    ...member,
    id: member.id ?? member.member_id ?? index + 1,
    memberId: member.memberId ?? member.member_id ?? null,
    name: member.name ?? member.member_name ?? "",
    role: member.role ?? "",
    order: member.order ?? index + 1,
  }));
};

const adaptGroups = (groups) => {
  if (!groups) {
    return { groupA: [], groupB: [] };
  }

  if (!Array.isArray(groups)) {
    return {
      groupA: Array.isArray(groups.groupA) ? groups.groupA : [],
      groupB: Array.isArray(groups.groupB) ? groups.groupB : [],
    };
  }

  const nextGroups = { groupA: [], groupB: [] };
  groups.forEach((group) => {
    const key =
      group?.name === "A" ? "groupA" : group?.name === "B" ? "groupB" : null;
    if (!key) {
      return;
    }
    nextGroups[key] = Array.isArray(group.teams)
      ? group.teams.map((team) => ({
          ...team,
          id: team.id ?? team.team_id ?? null,
          teamId: team.teamId ?? team.team_id ?? null,
          teamName: team.teamName ?? team.team_name ?? "",
          captainName: team.captainName ?? team.captain_name ?? team.team_name ?? "",
          phoneNumber: team.phoneNumber ?? team.captain_phone ?? "",
          members: adaptTeamMembers(team.members),
          status: team.status ?? "registered",
        }))
      : [];
  });
  return nextGroups;
};

const adaptRegisteredTeams = (teams) => {
  if (!Array.isArray(teams)) {
    return [];
  }

  return teams.map((team) => ({
    ...team,
    id: team.id ?? team.team_id ?? null,
    teamId: team.teamId ?? team.team_id ?? null,
    teamName: team.teamName ?? team.team_name ?? "",
    captainName: team.captainName ?? team.captain_name ?? team.team_name ?? "",
    phoneNumber: team.phoneNumber ?? team.captain_phone ?? "",
    members: adaptTeamMembers(team.members),
    status: team.status ?? "registered",
    groupName: team.groupName ?? team.group_name ?? null,
  }));
};

const adaptCommonTournament = (apiData) => {
  const mappedMatches = Array.isArray(apiData?.matches)
    ? apiData.matches.map(adaptMatch).filter(Boolean)
    : [];

  return {
    ...apiData,
    // backend -> UI mapping contract
    id: apiData?.id ?? apiData?.tournament_id ?? null,
    gymId: apiData?.gymId ?? apiData?.gym ?? null,
    gymName: apiData?.gymName ?? apiData?.gym_name ?? "",
    startDate: apiData?.startDate ?? apiData?.start_date ?? null,
    endDate: apiData?.endDate ?? apiData?.end_date ?? null,
    entryFee: apiData?.entryFee ?? apiData?.registration_fee ?? 0,
    prizeAmount: apiData?.prizeAmount ?? apiData?.prize_amount ?? null,
    firstPlaceAward: apiData?.firstPlaceAward ?? apiData?.first_place_award ?? null,
    secondPlaceAward: apiData?.secondPlaceAward ?? apiData?.second_place_award ?? null,
    thirdPlaceAward: apiData?.thirdPlaceAward ?? apiData?.third_place_award ?? null,
    topScorerAward: apiData?.topScorerAward ?? apiData?.top_scorer_award ?? null,
    status: normalizeTournamentStatus(apiData?.status),
    rawStatus: apiData?.status ?? null,
    groups: adaptGroups(apiData?.groups),
    groupMatches: Array.isArray(apiData?.groupMatches)
      ? apiData.groupMatches.map(adaptMatch).filter(Boolean)
      : mappedMatches.filter((match) =>
          String(match.round || "").toLowerCase().includes("group"),
        ),
    knockoutMatches: Array.isArray(apiData?.knockoutMatches)
      ? apiData.knockoutMatches.map(adaptMatch).filter(Boolean)
      : mappedMatches.filter(
          (match) => !String(match.round || "").toLowerCase().includes("group"),
        ),
    registeredTeams: adaptRegisteredTeams(apiData?.registeredTeams ?? apiData?.teams),
    champion:
      apiData?.champion ?? apiData?.champion_team_name ?? apiData?.result?.winner ?? null,
    topScorer: apiData?.topScorer ?? apiData?.top_scorer ?? null,
  };
};

export const adaptTournamentListItem = (apiData) => {
  if (!apiData) {
    return null;
  }

  return adaptCommonTournament(apiData);
};

export const adaptTournamentDetail = (apiData) => {
  if (!apiData) {
    return null;
  }

  return {
    ...adaptCommonTournament(apiData),
    registeredTeams: adaptRegisteredTeams(apiData.registeredTeams ?? apiData.teams),
    finalRanking: Array.isArray(apiData.finalRanking)
      ? apiData.finalRanking
      : Array.isArray(apiData.ranking)
        ? apiData.ranking
        : [],
    description: apiData.description ?? "",
  };
};

export default {
  TOURNAMENT_STATUS,
  normalizeTournamentStatus,
  adaptTournamentListItem,
  adaptTournamentDetail,
  adaptMatch,
  adaptStandings,
};
