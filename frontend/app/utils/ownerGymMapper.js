import { normalizeImageUrl } from "./gymMapper";

const normalizeAverageRating = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const mapOwnerGymToUi = (gym) => ({
  id: gym?.gym_id ?? null,
  gymId: gym?.gym_id ?? null,
  ownerId: gym?.owner ?? null,
  ownerName: gym?.owner_name ?? null,
  name: gym?.name || "",
  address: gym?.address || "",
  city: gym?.city || "",
  description: gym?.description || "",
  phone: gym?.phone || "",
  status: gym?.status || null,
  approvalExpiresAt: gym?.approval_expires_at || null,
  createdAt: gym?.created_at || null,
  images: Array.isArray(gym?.images)
    ? gym.images.map((image) => ({
        id: image?.image_id ?? null,
        imageId: image?.image_id ?? null,
        imageUrl: normalizeImageUrl(image?.image_url),
        uploadedAt: image?.uploaded_at || null,
      }))
    : [],
  image: normalizeImageUrl(gym?.images?.[0]?.image_url) || null,
  fieldsCount: Number(gym?.fields_count) || 0,
  courts_count: Number(gym?.fields_count) || 0,
  courts: [],
  averageRating: normalizeAverageRating(gym?.average_rating),
  rejectionReason: null,
});

export const mapOwnerGymListResponse = (payload) => {
  const results = Array.isArray(payload?.results) ? payload.results : [];

  return {
    ...payload,
    results: results.map(mapOwnerGymToUi),
  };
};

const sanitizeOwnerGymValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

export const buildOwnerGymCreatePayload = (formState = {}) => ({
  owner: formState.owner ?? null,
  name: sanitizeOwnerGymValue(formState.name),
  address: sanitizeOwnerGymValue(formState.address),
  city: sanitizeOwnerGymValue(formState.city),
  description: sanitizeOwnerGymValue(formState.description),
  phone: sanitizeOwnerGymValue(formState.phone),
});

export const buildOwnerGymUpdatePayload = (formState = {}) => ({
  name: sanitizeOwnerGymValue(formState.name),
  address: sanitizeOwnerGymValue(formState.address),
  city: sanitizeOwnerGymValue(formState.city),
  description: sanitizeOwnerGymValue(formState.description),
  phone: sanitizeOwnerGymValue(formState.phone),
});

export const adaptOwnerGymForDashboard = (gym, currentOwner) => {
  const mappedGym =
    gym?.gym_id !== undefined || gym?.owner_name !== undefined
      ? mapOwnerGymToUi(gym)
      : {
          ...gym,
          images: Array.isArray(gym?.images) ? gym.images : [],
          image:
            gym?.image ||
            normalizeImageUrl(gym?.images?.[0]?.image_url) ||
            gym?.images?.[0]?.imageUrl ||
            null,
          fieldsCount:
            Number(gym?.fieldsCount) ||
            Number(gym?.fields_count) ||
            (Array.isArray(gym?.courts) ? gym.courts.length : 0),
          courts_count:
            Number(gym?.courts_count) ||
            Number(gym?.fieldsCount) ||
            Number(gym?.fields_count) ||
            (Array.isArray(gym?.courts) ? gym.courts.length : 0),
          courts: Array.isArray(gym?.courts) ? gym.courts : [],
          rejectionReason: gym?.rejectionReason ?? null,
        };

  return {
    ...mappedGym,
    ownerId:
      mappedGym?.ownerId ??
      gym?.ownerId ??
      currentOwner?.id ??
      currentOwner?.user_id ??
      null,
    ownerName:
      mappedGym?.ownerName ??
      gym?.ownerName ??
      currentOwner?.full_name ??
      currentOwner?.name ??
      null,
    image:
      mappedGym?.image ||
      normalizeImageUrl(mappedGym?.images?.[0]?.imageUrl) ||
      null,
    courts: Array.isArray(mappedGym?.courts) ? mappedGym.courts : [],
    fieldsCount: Number(mappedGym?.fieldsCount) || 0,
    courts_count:
      Number(mappedGym?.courts_count) ||
      Number(mappedGym?.fieldsCount) ||
      0,
    rejectionReason: mappedGym?.rejectionReason ?? null,
    email: gym?.email || "",
  };
};
