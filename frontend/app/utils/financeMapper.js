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

export const adaptFinanceSummary = (data = {}) => {
  const source = unwrapData(data) || {};

  return {
    bookingRevenue: toNumber(source?.booking_revenue),
    tournamentRevenue: toNumber(source?.tournament_revenue),
    totalRevenue: toNumber(source?.total_revenue),
    commission: toNumber(source?.commission),
    netRevenue: toNumber(source?.net_revenue),
    totalExpenses: toNumber(source?.total_expenses),
    rentTotal: toNumber(source?.rent_total),
    electricityTotal: toNumber(source?.electricity_total),
    staffSalaryTotal: toNumber(source?.staff_salary_total),
    finalProfit: toNumber(source?.final_profit),
  };
};

export default {
  adaptFinanceSummary,
};
