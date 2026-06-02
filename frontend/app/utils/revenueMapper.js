const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const unwrapData = (value) => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "data")
  ) {
    return value.data;
  }

  return value;
};

const getListItems = (response) => {
  const unwrapped = unwrapData(response);

  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }

  if (Array.isArray(unwrapped?.results)) {
    return unwrapped.results;
  }

  return [];
};

export const adaptRevenue = (item = {}) => ({
  id: item?.id ?? item?.revenue_id ?? null,
  gym: item?.gym ?? null,
  gymName: item?.gym_name ?? "",
  revenueType: item?.revenue_type ?? "",
  amount: toNumber(item?.amount),
  commissionAmount: toNumber(item?.commission_amount),
  netAmount: toNumber(item?.net_amount),
  status: item?.status ?? "",
  createdAt: item?.created_at ?? null,
  bookingDetails: item?.booking_details ?? null,
  tournamentDetails: item?.tournament_details ?? null,
});

export const adaptRevenueList = (response) =>
  getListItems(response).map((item) => adaptRevenue(item));

export const adaptRevenueSummary = (data = {}) => {
  const source = unwrapData(data) || {};

  return {
    totalRevenue: toNumber(source?.total_revenue),
    totalCommission: toNumber(source?.total_commission),
    totalNet: toNumber(source?.total_net),
    bookingRevenue: toNumber(source?.booking_revenue),
    tournamentRevenue: toNumber(source?.tournament_revenue),
    totalBookings: toNumber(source?.total_bookings),
    totalTournaments: toNumber(source?.total_tournaments),
  };
};

export default {
  adaptRevenue,
  adaptRevenueList,
  adaptRevenueSummary,
};
