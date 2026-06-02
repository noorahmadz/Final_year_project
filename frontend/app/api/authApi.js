import client from "./client";

const normalizeEnvelope = (envelope) => ({
  ...envelope?.data,
  message: envelope?.message ?? null,
  success: envelope?.success ?? true,
});

export const login = async (email, password) => {
  const envelope = await client.post(
    "/api/users/login/",
    { email, password },
    { raw: true },
  );
  return normalizeEnvelope(envelope);
};

export const register = async (payload) => {
  const envelope = await client.post("/api/users/register/", payload, {
    raw: true,
  });
  return normalizeEnvelope(envelope);
};

export const verifyEmailOtp = async (email, otp) => {
  const envelope = await client.post(
    "/api/users/verify-email-otp/",
    { email, otp },
    { raw: true },
  );
  return normalizeEnvelope(envelope);
};

export const resendEmailOtp = async (email) => {
  const envelope = await client.post(
    "/api/users/resend-email-otp/",
    { email },
    { raw: true },
  );
  return normalizeEnvelope(envelope);
};

export const me = async () => {
  const envelope = await client.get("/api/users/me/", {
    auth: true,
    raw: true,
  });
  return normalizeEnvelope(envelope);
};

export const refresh = async (refreshToken) => {
  const envelope = await client.post(
    "/api/token/refresh/",
    { refresh: refreshToken },
    { raw: true },
  );
  return normalizeEnvelope(envelope);
};

export const logout = async (refreshToken) => {
  const envelope = await client.post(
    "/api/users/logout/",
    { refresh: refreshToken },
    { auth: true, raw: true },
  );
  return normalizeEnvelope(envelope);
};

const authApi = {
  login,
  register,
  verifyEmailOtp,
  resendEmailOtp,
  me,
  refresh,
  logout,
};

export default authApi;
