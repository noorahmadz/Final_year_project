import client from "./client";

const buildExpensesPath = (basePath, params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
};

export const getOwnerExpenses = async (params = {}) => {
  return client.get(buildExpensesPath("/api/expenses/", params), { auth: true });
};

export const createExpense = async (payload) => {
  return client.post("/api/expenses/", payload, { auth: true });
};

export const updateExpense = async (id, payload) => {
  return client.patch(`/api/expenses/${id}/`, payload, { auth: true });
};

export const deleteExpense = async (id) => {
  return client.delete(`/api/expenses/${id}/`, { auth: true });
};

export const getExpenseSummary = async (params = {}) => {
  return client.get(buildExpensesPath("/api/expenses/summary/", params), {
    auth: true,
  });
};

const expensesApi = {
  getOwnerExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
};

export default expensesApi;
