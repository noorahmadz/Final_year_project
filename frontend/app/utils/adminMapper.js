export const adaptAdminGym = (gym) => {
  if (!gym) {
    return null;
  }

  const primaryImage = Array.isArray(gym.images)
    ? gym.images[0]?.image_url || null
    : gym.image || null;

  return {
    ...gym,
    id: gym.id ?? gym.gym_id ?? null,
    submittedAt: gym.submittedAt ?? gym.created_at ?? gym.createdAt ?? null,
    image: gym.image ?? primaryImage,
    ownerEmail: gym.ownerEmail ?? gym.owner_email ?? null,
    name: gym.name ?? "",
  };
};

export default {
  adaptAdminGym,
};
