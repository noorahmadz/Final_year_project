import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ApiError,
  setAccessTokenProvider,
  setAuthRecoveryHandler,
} from "../api/client";
import * as authApi from "../api/authApi";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getTokens,
  saveTokens,
} from "../utils/tokenStorage";
import { useGym } from "./GymContext";

const AuthContext = createContext(null);

const ROLE_MISMATCH_MESSAGE = "Selected role does not match this account.";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const accessTokenRef = useRef(null);
  const refreshRequestRef = useRef(null);
  const { setExternalAuthUser, clearExternalAuthUser } = useGym();

  const syncExternalState = useCallback(
    (nextUser) => {
      if (nextUser) {
        setExternalAuthUser(nextUser);
      } else {
        clearExternalAuthUser();
      }
    },
    [clearExternalAuthUser, setExternalAuthUser],
  );

  const clearSessionState = useCallback(async () => {
    accessTokenRef.current = null;
    setUser(null);
    syncExternalState(null);
    await clearTokens();
  }, [syncExternalState]);

  const applyAuthenticatedSession = useCallback(
    async ({ access, refresh, user: nextUser }) => {
      accessTokenRef.current = access;
      await saveTokens(access, refresh);
      setUser(nextUser);
      syncExternalState(nextUser);
      return nextUser;
    },
    [syncExternalState],
  );

  const refreshSession = useCallback(async (providedRefreshToken) => {
    if (refreshRequestRef.current) {
      return refreshRequestRef.current;
    }

    const refreshRequest = (async () => {
      const refreshToken = providedRefreshToken || (await getRefreshToken());
      if (!refreshToken) {
        throw new ApiError("No refresh token available", { status: 401 });
      }

      const refreshed = await authApi.refresh(refreshToken);
      const nextAccess = refreshed.access;
      const nextRefresh = refreshed.refresh || refreshToken;

      if (!nextAccess || !nextRefresh) {
        throw new ApiError("Refresh response missing tokens", {
          status: 401,
          data: refreshed,
        });
      }

      accessTokenRef.current = nextAccess;
      await saveTokens(nextAccess, nextRefresh);

      return {
        access: nextAccess,
        refresh: nextRefresh,
      };
    })();

    refreshRequestRef.current = refreshRequest;

    try {
      return await refreshRequest;
    } finally {
      if (refreshRequestRef.current === refreshRequest) {
        refreshRequestRef.current = null;
      }
    }
  }, []);

  const recoverAuthenticatedRequest = useCallback(async () => {
    try {
      await refreshSession();
      return true;
    } catch {
      await clearSessionState();
      return false;
    }
  }, [clearSessionState, refreshSession]);

  const restoreSession = useCallback(async () => {
    setIsBootstrapping(true);

    try {
      const { access, refresh } = await getTokens();
      if (!access || !refresh) {
        await clearSessionState();
        return null;
      }

      accessTokenRef.current = access;

      try {
        const currentUser = await authApi.me();
        setUser(currentUser);
        syncExternalState(currentUser);
        return currentUser;
      } catch (error) {
        if (error.status === 401) {
          try {
            await refreshSession(refresh);
          } catch {
            await clearSessionState();
            return null;
          }

          const currentUser = await authApi.me();
          setUser(currentUser);
          syncExternalState(currentUser);
          return currentUser;
        }

        await clearSessionState();
        return null;
      }
    } catch {
      await clearSessionState();
      return null;
    } finally {
      setIsBootstrapping(false);
    }
  }, [clearSessionState, refreshSession, syncExternalState]);

  useEffect(() => {
    setAccessTokenProvider(async () => {
      if (accessTokenRef.current) {
        return accessTokenRef.current;
      }

      const token = await getAccessToken();
      accessTokenRef.current = token;
      return token;
    });
    setAuthRecoveryHandler(recoverAuthenticatedRequest);

    return () => {
      setAccessTokenProvider(null);
      setAuthRecoveryHandler(null);
    };
  }, [recoverAuthenticatedRequest]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(
    async (email, password, { expectedRole } = {}) => {
      setLoading(true);

      try {
        const payload = await authApi.login(email, password);
        if (expectedRole && payload.user?.role !== expectedRole) {
          throw new ApiError(ROLE_MISMATCH_MESSAGE, {
            status: 403,
            data: {
              success: false,
              message: ROLE_MISMATCH_MESSAGE,
              error_code: "role_mismatch",
              errors: null,
            },
          });
        }

        await applyAuthenticatedSession(payload);
        return payload;
      } finally {
        setLoading(false);
      }
    },
    [applyAuthenticatedSession],
  );

  const register = useCallback(async (payload) => {
    setLoading(true);

    try {
      return await authApi.register(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyEmailOtp = useCallback(async (email, otp) => {
    setLoading(true);

    try {
      return await authApi.verifyEmailOtp(email, otp);
    } finally {
      setLoading(false);
    }
  }, []);

  const resendEmailOtp = useCallback(async (email) => {
    setLoading(true);

    try {
      return await authApi.resendEmailOtp(email);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);

    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        try {
          await authApi.logout(refreshToken);
        } catch {
          // Local cleanup still needs to happen even if the backend rejects logout.
        }
      }
    } finally {
      await clearSessionState();
      setLoading(false);
    }
  }, [clearSessionState]);

  const value = useMemo(
    () => ({
      user,
      role: user?.role ?? null,
      isAuthenticated: Boolean(user),
      loading,
      isBootstrapping,
      login,
      register,
      verifyEmailOtp,
      resendEmailOtp,
      logout,
      restoreSession,
      refreshSession,
    }),
    [
      loading,
      isBootstrapping,
      login,
      logout,
      refreshSession,
      register,
      resendEmailOtp,
      restoreSession,
      user,
      verifyEmailOtp,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default AuthContext;
