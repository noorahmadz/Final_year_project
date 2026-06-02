import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCESS_TOKEN_KEY = "@futsal/auth/accessToken";
const REFRESH_TOKEN_KEY = "@futsal/auth/refreshToken";

export const saveTokens = async (access, refresh) => {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, access],
    [REFRESH_TOKEN_KEY, refresh],
  ]);
};

export const getAccessToken = async () => {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
};

export const getRefreshToken = async () => {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
};

export const getTokens = async () => {
  const [[, access], [, refresh]] = await AsyncStorage.multiGet([
    ACCESS_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
  ]);

  return { access, refresh };
};

export const clearTokens = async () => {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
};

const tokenStorage = {
  saveTokens,
  getAccessToken,
  getRefreshToken,
  getTokens,
  clearTokens,
};

export default tokenStorage;
