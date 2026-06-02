import client from "./client";

export const getTournaments = async () => {
  return client.get("/api/tournaments/", { auth: true });
};

export const getTournamentDetail = async (tournamentId) => {
  return client.get(`/api/tournaments/${tournamentId}/`, { auth: true });
};

export const getTournamentTeams = async (tournamentId) => {
  return client.get(`/api/tournaments/${tournamentId}/teams/`, { auth: true });
};

export const createTournament = async (payload) => {
  return client.post("/api/tournaments/", payload, { auth: true });
};

export const updateTournament = async (tournamentId, payload) => {
  return client.patch(`/api/tournaments/${tournamentId}/`, payload, {
    auth: true,
  });
};

export const registerTeam = async (tournamentId, payload) => {
  return client.post(`/api/tournaments/${tournamentId}/register/`, payload, {
    auth: true,
  });
};

export const approveTournamentTeam = async (teamId) => {
  return client.post(`/api/tournaments/teams/${teamId}/approve/`, {}, {
    auth: true,
  });
};

export const rejectTournamentTeam = async (teamId) => {
  return client.post(`/api/tournaments/teams/${teamId}/reject/`, {}, {
    auth: true,
  });
};

export const assignTournamentTeamGroup = async (teamId, group) => {
  return client.post(`/api/tournaments/teams/${teamId}/assign-group/`, { group }, {
    auth: true,
  });
};

export const submitMatchResult = async (matchId, payload) => {
  return client.post(`/api/tournaments/matches/${matchId}/result/`, payload, {
    auth: true,
  });
};

export const startTournament = async (tournamentId) => {
  return client.post(`/api/tournaments/${tournamentId}/start_tournament/`, {}, {
    auth: true,
  });
};

export const finishTournament = async (tournamentId) => {
  return client.post(
    `/api/tournaments/${tournamentId}/finish_tournament/`,
    {},
    { auth: true },
  );
};

export const getMatches = async (tournamentId, options = {}) => {
  const query = options.paginated ? "?paginated=true" : "";
  return client.get(`/api/tournaments/${tournamentId}/matches/${query}`, {
    auth: true,
  });
};

export const getStandings = async (tournamentId) => {
  return client.get(`/api/tournaments/${tournamentId}/standings/`, {
    auth: true,
  });
};

export const getRanking = async (tournamentId) => {
  return client.get(`/api/tournaments/${tournamentId}/ranking/`, {
    auth: true,
  });
};

const tournamentsApi = {
  getTournaments,
  getTournamentDetail,
  getTournamentTeams,
  createTournament,
  updateTournament,
  registerTeam,
  approveTournamentTeam,
  rejectTournamentTeam,
  assignTournamentTeamGroup,
  submitMatchResult,
  startTournament,
  finishTournament,
  getMatches,
  getStandings,
  getRanking,
};

export default tournamentsApi;
