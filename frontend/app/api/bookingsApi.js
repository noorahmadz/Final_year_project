import client from "./client";

const buildAvailabilityPath = ({ fieldId, date }) => {
  const searchParams = new URLSearchParams();

  if (fieldId !== undefined && fieldId !== null && fieldId !== "") {
    searchParams.append("field_id", String(fieldId));
  }
  if (date) {
    searchParams.append("date", String(date));
  }

  const queryString = searchParams.toString();
  return queryString
    ? `/api/bookings/availability/?${queryString}`
    : "/api/bookings/availability/";
};

export const getAvailability = async ({ fieldId, date }) => {
  return client.get(buildAvailabilityPath({ fieldId, date }), { auth: true });
};

export const createBooking = async ({
  field,
  booking_date,
  start_time,
  end_time,
  discount_code,
}) => {
  const payload = {
    field,
    booking_date,
    start_time,
    end_time,
  };

  if (discount_code) {
    payload.discount_code = discount_code;
  }

  return client.post("/api/bookings/", payload, { auth: true });
};

export const getBookings = async () => {
  return client.get("/api/bookings/", { auth: true });
};

export const getOwnerBookings = async (params = {}) => {
  return client.get("/api/bookings/", {
    params,
    auth: true,
  });
};

export const getBookingDetail = async (bookingId) => {
  return client.get(`/api/bookings/${bookingId}/`, { auth: true });
};

export const updateBooking = async (bookingId, payload) => {
  return client.patch(`/api/bookings/${bookingId}/`, payload, {
    auth: true,
  });
};

export const cancelBooking = async (bookingId, reason = "") => {
  const payload = reason ? { reason } : {};
  return client.post(`/api/bookings/${bookingId}/cancel/`, payload, {
    auth: true,
  });
};

const bookingsApi = {
  getAvailability,
  createBooking,
  getBookings,
  getOwnerBookings,
  getBookingDetail,
  updateBooking,
  cancelBooking,
};

export default bookingsApi;
