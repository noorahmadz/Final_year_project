import i18n from "../i18n";

// const BASE_URL = "http://10.210.254.243:8000/api";
// const BASE_URL = "http://10.220.30.243:8000/api";
const BASE_URL = "http://10.99.149.243:8000/api";





export const API_CONFIG = {
  baseURL:
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || BASE_URL,
};

let accessTokenProvider = async () => null;
let authRecoveryHandler = async () => false;

const getCurrentLanguage = () => {
  const language = i18n.language || "en";

  if (language.startsWith("ps")) return "ps";
  if (language.startsWith("fa") || language.startsWith("prs")) return "fa";

  return "en";
};

export class ApiError extends Error {
  constructor(
    message,
    { status, data, url, method, isNetworkError = false, originalError } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? null;
    this.data = data ?? null;
    this.url = url ?? null;
    this.method = method ?? null;
    this.isNetworkError = isNetworkError;
    this.originalError = originalError;
  }
}

export const setAccessTokenProvider = (provider) => {
  accessTokenProvider = typeof provider === "function" ? provider : async () => null;
};

export const setAuthRecoveryHandler = (handler) => {
  authRecoveryHandler = typeof handler === "function" ? handler : async () => false;
};

const joinUrl = (baseURL, path) => {
  const normalizedBase = baseURL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (
    normalizedBase.endsWith("/api") &&
    normalizedPath.startsWith("/api/")
  ) {
    return `${normalizedBase}${normalizedPath.slice(4)}`;
  }

  return `${normalizedBase}${normalizedPath}`;
};

const getDefaultMessage = (status) => {
  if (status >= 500) {
    return "Server error";
  }
  if (status === 404) {
    return "Resource not found";
  }
  if (status === 401) {
    return "Unauthorized";
  }
  if (status === 403) {
    return "Permission denied";
  }
  if (status === 429) {
    return "Too many requests";
  }
  return "Request failed";
};

const parseResponseBody = async (response) => {
  const rawText = await response.text();
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
};

const buildHeaders = async (
  headers = {},
  auth = false,
  { isFormData = false } = {},
) => {
  const nextHeaders = {
    Accept: "application/json",
    "Accept-Language": getCurrentLanguage(),
    ...headers,
  };

  if (!isFormData && !Object.prototype.hasOwnProperty.call(nextHeaders, "Content-Type")) {
    nextHeaders["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = await accessTokenProvider();
    if (token) {
      nextHeaders.Authorization = `Bearer ${token}`;
    }
  }

  return nextHeaders;
};

const unwrapEnvelope = (payload) => {
  if (
    payload &&
    typeof payload === "object" &&
    Object.prototype.hasOwnProperty.call(payload, "success")
  ) {
    return payload.data;
  }

  return payload;
};

const request = async (
  method,
  path,
  body,
  { auth = false, headers = {}, raw = false, retryAuth = true } = {},
) => {
  const url = joinUrl(API_CONFIG.baseURL, path);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  try {
    const response = await fetch(url, {
      method,
      headers: await buildHeaders(headers, auth, { isFormData }),
      body:
        body === undefined || method === "GET" || method === "DELETE"
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
    });

    const payload = await parseResponseBody(response);

    if (!response.ok) {
      if (response.status === 401 && auth && retryAuth) {
        let recovered = false;

        try {
          recovered = await authRecoveryHandler({
            data: payload,
            method,
            status: response.status,
            url,
          });
        } catch {
          recovered = false;
        }

        if (recovered) {
          return request(method, path, body, {
            auth,
            headers,
            raw,
            retryAuth: false,
          });
        }
      }

      throw new ApiError(
        payload?.message || getDefaultMessage(response.status),
        {
          status: response.status,
          data: payload,
          url,
          method,
        },
      );
    }

    return raw ? payload : unwrapEnvelope(payload);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError("Network request failed", {
      url,
      method,
      isNetworkError: true,
      originalError: error,
    });
  }
};

const get = (path, options = {}) => request("GET", path, undefined, options);
const post = (path, body, options = {}) => request("POST", path, body, options);
const patch = (path, body, options = {}) =>
  request("PATCH", path, body, options);
const remove = (path, options = {}) =>
  request("DELETE", path, undefined, options);

const apiClient = {
  get,
  post,
  patch,
  delete: remove,
  request,
  setAccessTokenProvider,
  setAuthRecoveryHandler,
  ApiError,
  API_CONFIG,
};

export default apiClient;
