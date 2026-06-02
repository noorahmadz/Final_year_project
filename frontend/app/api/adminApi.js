import client from "./client";

export const getAdminGyms = async () => {
  return client.get("/api/gyms/", { auth: true });
};


export const getAdminGymDetail = async (gymId) => {
  return client.get(`/api/gyms/${gymId}/`, { auth: true });
};
export const approveGym = async (gymId, status) => {
  return client.post(
    `/api/gyms/${gymId}/approve/`,
    { status },
    { auth: true },
  );
};

export const deleteAdminGym = async (gymId) => {
  return client.delete(`/api/gyms/${gymId}/`, { auth: true });
};

export const getAdminUsers = async () => {
  const [owners, customers] = await Promise.all([
    client.get("/api/users/owners/", { auth: true }),
    client.get("/api/users/customers/", { auth: true }),
  ]);

  return {
    owners: owners?.results || [],
    customers: customers?.results || [],
  };
};

export const getAdminBookings = async () => {
  return client.get("/api/bookings/", { auth: true });
};

export const getAdminRevenues = async () => {
  return client.get("/api/revenues/", { auth: true });
};

const adminApi = {
  getAdminGyms,
  approveGym,
  deleteAdminGym,
  getAdminUsers,
  getAdminBookings,
  getAdminRevenues,
};

export default adminApi;


