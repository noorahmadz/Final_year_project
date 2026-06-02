import client from "./client";

const buildRevenuesPath = (basePath, params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
};

export const getOwnerRevenues = async (params = {}) => {
  return client.get(buildRevenuesPath("/api/revenues/", params), {
    auth: true,
  });
};

export const getOwnerRevenueSummary = async (params = {}) => {
  return client.get(buildRevenuesPath("/api/revenues/summary/", params), {
    auth: true,
  });
};

export const getOwnerFinanceSummary = async (params = {}) => {
  return client.get(
    buildRevenuesPath("/api/revenues/owner-finance-summary/", params),
    { auth: true },
  );
};

const revenuesApi = {
  getOwnerRevenues,
  getOwnerRevenueSummary,
  getOwnerFinanceSummary,
};

export default revenuesApi;
