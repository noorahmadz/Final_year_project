import client from "./client";

export const createBookingPaymentIntent = async (bookingId) => {
  return client.post(
    "/api/payments/booking/create-intent/",
    { booking_id: bookingId },
    { auth: true },
  );
};

export const confirmBookingPayment = async (paymentIntentId) => {
  return client.post(
    "/api/payments/booking/confirm/",
    { payment_intent_id: paymentIntentId },
    { auth: true },
  );
};

export const createTournamentPaymentIntent = async (payload) => {
  return client.post("/api/payments/tournament/create-intent/", payload, {
    auth: true,
  });
};

export const confirmTournamentPayment = async (paymentIntentId) => {
  return client.post(
    "/api/payments/tournament/confirm/",
    { payment_intent_id: paymentIntentId },
    { auth: true },
  );
};

export const getPaymentHistory = async () => {
  return client.get("/api/payments/history/", { auth: true });
};

const paymentsApi = {
  createBookingPaymentIntent,
  confirmBookingPayment,
  createTournamentPaymentIntent,
  confirmTournamentPayment,
  getPaymentHistory,
};

export default paymentsApi;
