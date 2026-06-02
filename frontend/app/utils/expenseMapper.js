export const toNumber = (value, fallback = 0) => {
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

export const adaptExpense = (item = {}) => ({
  id: item?.id ?? null,
  gym: item?.gym ?? null,
  gymName: item?.gym_name ?? "",
  expenseType: item?.expense_type ?? "",
  expenseTypeDisplay: item?.expense_type_display ?? "",
  amount: toNumber(item?.amount),
  expenseDate: item?.expense_date ?? "",
  notes: item?.notes ?? "",
  createdBy: item?.created_by ?? null,
  createdAt: item?.created_at ?? null,
  updatedAt: item?.updated_at ?? null,
});

export const adaptExpenseList = (response) =>
  getListItems(response).map((item) => adaptExpense(item));

export const adaptExpenseSummary = (data = {}) => {
  const source = unwrapData(data) || {};

  return {
    totalExpenses: toNumber(source?.total_expenses),
    rentTotal: toNumber(source?.rent_total),
    electricityTotal: toNumber(source?.electricity_total),
    staffSalaryTotal: toNumber(source?.staff_salary_total),
  };
};

export default {
  toNumber,
  adaptExpense,
  adaptExpenseList,
  adaptExpenseSummary,
};
