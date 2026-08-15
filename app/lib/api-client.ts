import type { Locale } from "../i18n";

type ApiErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
};

type ApiErrorOverrides = {
  fallback?: string;
  unauthorized?: string;
  preserveClientMessage?: boolean;
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Network request failed", 0, "NETWORK_ERROR");
  }

  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload & T;
  if (!response.ok) {
    throw new ApiError(payload.error || payload.message || "Request failed", response.status, payload.code);
  }

  return payload;
}

export function formatApiError(error: unknown, locale: Locale, overrides: ApiErrorOverrides = {}) {
  const copy = locale === "es"
    ? {
        unauthorized: "Tu sesión expiró. Inicia sesión de nuevo.",
        forbidden: "No tienes permiso para realizar esta acción.",
        notFound: "No encontramos la información solicitada.",
        conflict: "La información cambió. Actualiza la página e intenta de nuevo.",
        rateLimited: "Demasiados intentos. Espera un momento e intenta de nuevo.",
        network: "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
        server: "El servicio no está disponible en este momento. Intenta de nuevo.",
        fallback: "No pudimos completar la solicitud. Intenta de nuevo.",
      }
    : {
        unauthorized: "Your session expired. Sign in again.",
        forbidden: "You do not have permission to perform this action.",
        notFound: "We could not find the requested information.",
        conflict: "The information changed. Refresh the page and try again.",
        rateLimited: "Too many attempts. Wait a moment and try again.",
        network: "We could not connect to the server. Check your connection and try again.",
        server: "The service is currently unavailable. Try again.",
        fallback: "We could not complete the request. Try again.",
      };

  if (!(error instanceof ApiError)) return overrides.fallback || copy.fallback;
  if (error.status === 0) return copy.network;
  if (error.status === 401) return overrides.unauthorized || copy.unauthorized;
  if (error.status === 403) return copy.forbidden;
  if (error.status === 404) return copy.notFound;
  if (error.status === 409) return copy.conflict;
  if (error.status === 429) return copy.rateLimited;
  if (error.status >= 500) return overrides.fallback || copy.server;
  if (overrides.preserveClientMessage && error.message) return error.message;
  return overrides.fallback || copy.fallback;
}

export function isApiErrorStatus(error: unknown, status: number) {
  return error instanceof ApiError && error.status === status;
}