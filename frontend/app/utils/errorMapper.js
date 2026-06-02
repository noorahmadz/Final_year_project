import i18n from "../i18n";

const STATUS_MESSAGE_KEYS = {
  400: ["errors.validationError", "Please check the form and try again"],
  401: [
    "errors.sessionExpired",
    "Your session has expired. Please sign in again.",
  ],
  403: [
    "errors.forbiddenAction",
    "You do not have permission to perform this action.",
  ],
  404: ["errors.resourceNotFound", "The requested resource was not found."],
  409: ["errors.conflict", "This action conflicts with existing data."],
  429: [
    "errors.rateLimited",
    "Too many attempts. Please wait and try again.",
  ],
  500: ["errors.serverError", "Server error"],
  502: [
    "errors.paymentProviderUnavailable",
    "Payment provider is temporarily unavailable. Please try again.",
  ],
  503: [
    "errors.paymentProviderUnavailable",
    "Payment provider is temporarily unavailable. Please try again.",
  ],
};

const ERROR_CODE_MESSAGE_KEYS = {
  payment_provider_unavailable: [
    "errors.paymentProviderUnavailable",
    "Payment provider is temporarily unavailable. Please try again.",
  ],
};

const getStatusMessage = (statusCode) => {
  const config = STATUS_MESSAGE_KEYS[statusCode];

  if (!config) {
    return null;
  }

  const [key, defaultValue] = config;
  return i18n.t(key, { defaultValue });
};

const pickFirstError = (errors) => {
  if (!errors) {
    return null;
  }

  if (typeof errors === "string") {
    return errors;
  }

  if (Array.isArray(errors)) {
    return errors[0] || null;
  }

  if (typeof errors === "object") {
    const firstValue = Object.values(errors)[0];
    return pickFirstError(firstValue);
  }

  return null;
};

export const mapErrorToMessage = (error) => {
  if (error?.isNetworkError) {
    return {
      message: i18n.t("errors.networkUnavailable", {
        defaultValue:
          "Unable to reach the server. Check your internet connection and try again.",
      }),
      debugMessage: error.message,
      error,
    };
  }

  const backendPayload = error?.data;
  const backendMessage = backendPayload?.message;
  const errorCodeConfig = ERROR_CODE_MESSAGE_KEYS[backendPayload?.error_code];
  const errorCodeMessage = errorCodeConfig
    ? i18n.t(errorCodeConfig[0], { defaultValue: errorCodeConfig[1] })
    : null;
  const fieldMessage = pickFirstError(backendPayload?.errors);
  const statusMessage = getStatusMessage(error?.status);

  return {
    message:
      errorCodeMessage ||
      backendMessage ||
      fieldMessage ||
      statusMessage ||
      i18n.t("errors.unknownDetailed", {
        defaultValue: "Something went wrong. Please try again.",
      }),
    debugMessage: backendMessage || error?.message || "Unknown error",
    error,
  };
};

export default mapErrorToMessage;
