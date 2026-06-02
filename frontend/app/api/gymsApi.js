import client from "./client";

export const getGyms = async () => {
  return client.get("/api/gyms/");
};

export const getGymDetail = async (gymId) => {
  return client.get(`/api/gyms/${gymId}/`);
};

export const getGymFields = async (gymId) => {
  return client.get(`/api/gyms/${gymId}/fields/`);
};

export const getGymSlots = async (gymId, params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const path = queryString
    ? `/api/gyms/${gymId}/slots/?${queryString}`
    : `/api/gyms/${gymId}/slots/`;

  return client.get(path);
};

export const getGymReviews = async (gymId) => {
  return client.get(`/api/gyms/${gymId}/reviews/`);
};

export const createGymReview = async (gymId, payload) => {
  return client.post(`/api/gyms/${gymId}/reviews/`, payload, { auth: true });
};

export const getGymDiscounts = async (gymId) => {
  return client.get(`/api/gyms/${gymId}/discounts/`);
};

const gymsApi = {
  getGyms,
  getGymDetail,
  getGymFields,
  getGymSlots,
  getGymReviews,
  createGymReview,
  getGymDiscounts,
};

export default gymsApi;
