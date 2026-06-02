import client from "./client";

export const getOwnerGyms = async () => {
  return client.get("/api/gyms/", { auth: true });
};

export const createOwnerGym = async (payload) => {
  return client.post("/api/gyms/", payload, { auth: true });
};

export const uploadOwnerGymImage = async (gymId, imageUrl) => {
  const formData = new FormData();
  const imageName = imageUrl?.split("/").pop() || `gym-${gymId}.jpg`;
  const extension = imageName.includes(".")
    ? imageName.split(".").pop()?.toLowerCase()
    : "jpg";
  const mimeType =
    extension === "png"
      ? "image/png"
      : extension === "webp"
        ? "image/webp"
        : "image/jpeg";

  formData.append("image_file", {
    uri: imageUrl,
    name: imageName,
    type: mimeType,
  });

  return client.post(
    `/api/gyms/${gymId}/images/`,
    formData,
    { auth: true },
  );
};

export const getOwnerGymDetail = async (gymId) => {
  return client.get(`/api/gyms/${gymId}/`, { auth: true });
};

export const getGymFields = async (gymId) => {
  return client.get(`/api/gyms/${gymId}/fields/`, { auth: true });
};

export const createGymField = async (gymId, payload) => {
  return client.post(`/api/gyms/${gymId}/fields/`, payload, { auth: true });
};

export const createGymDiscount = async (gymId, payload) => {
  return client.post(`/api/gyms/${gymId}/discounts/`, payload, { auth: true });
};

export const createGymSlot = async (gymId, payload) => {
  return client.post(`/api/gyms/${gymId}/slots/`, payload, { auth: true });
};

export const updateOwnerGym = async (gymId, payload) => {
  return client.patch(`/api/gyms/${gymId}/`, payload, { auth: true });
};

const ownerGymsApi = {
  getOwnerGyms,
  createOwnerGym,
  uploadOwnerGymImage,
  getOwnerGymDetail,
  getGymFields,
  createGymField,
  createGymDiscount,
  createGymSlot,
  updateOwnerGym,
};

export default ownerGymsApi;
