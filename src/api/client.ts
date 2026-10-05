import {
  CONTRACT_VERSION,
  type ContactResponse,
  type DemoAdvanceResponse,
  type DemoSessionResponse,
  type DemoStep,
  type Lang,
  type LocationConfirmationRequest,
  type LocationConfirmationResponse,
  type PlaceSearchResponse,
  type SessionResponse,
  type TrackingEvent,
  type TrackingSnapshot,
} from "../../shared/contract";
import { parseSseBuffer } from "../realtime/sse";

export class ApiException extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
    this.name = "ApiException";
  }
}

export function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE;
  return configured && configured.length > 0 ? configured.replace(/\/$/, "") : "/api/v1/citizen";
}

async function request<T>(path: string, lang: Lang, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Accept-Language", lang);
  headers.set("Aegis-Contract-Version", CONTRACT_VERSION);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers,
    credentials: "include",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}

async function toError(response: Response): Promise<ApiException> {
  try {
    const body = (await response.json()) as { code?: string };
    return new ApiException(response.status, body.code ?? "UNAVAILABLE");
  } catch {
    return new ApiException(response.status, "UNAVAILABLE");
  }
}

export function exchangeToken(linkToken: string, lang: Lang, signal?: AbortSignal) {
  return request<SessionResponse>("/sessions", lang, {
    method: "POST",
    body: JSON.stringify({ linkToken }),
    signal,
  });
}

export function startDemoSession(lang: Lang, signal?: AbortSignal) {
  return request<DemoSessionResponse>("/demo/sessions", lang, {
    method: "POST",
    body: JSON.stringify({ autoplay: true }),
    signal,
  });
}

export function getTracking(lang: Lang, signal?: AbortSignal) {
  return request<TrackingSnapshot>("/tracking", lang, { signal });
}

export function confirmLocation(body: LocationConfirmationRequest, lang: Lang) {
  return request<LocationConfirmationResponse>("/location", lang, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function advanceDemo(step: DemoStep, lang: Lang) {
  return request<DemoAdvanceResponse>("/demo/advance", lang, {
    method: "POST",
    body: JSON.stringify({ step }),
  });
}

export function requestContact(kind: "control-room" | "driver", lang: Lang) {
  return request<ContactResponse>(`/contacts/${kind}`, lang, { method: "POST", body: "{}" });
}

export function searchPlaces(query: string, lang: Lang) {
  return request<PlaceSearchResponse>(`/places/search?q=${encodeURIComponent(query)}`, lang);
}

export function reversePlace(latitude: number, longitude: number, lang: Lang) {
  return request<PlaceSearchResponse>(`/places/reverse?latitude=${latitude}&longitude=${longitude}`, lang);
}

export async function readEventStream(options: {
  signal: AbortSignal;
  lang: Lang;
  lastEventId: string | null;
  onEvent: (event: TrackingEvent) => void;
}): Promise<void> {
  const headers = new Headers({
    Accept: "text/event-stream",
    "Accept-Language": options.lang,
    "Aegis-Contract-Version": CONTRACT_VERSION,
  });
  if (options.lastEventId) headers.set("Last-Event-ID", options.lastEventId);
  const response = await fetch(`${apiBase()}/events`, {
    headers,
    credentials: "include",
    referrerPolicy: "no-referrer",
    signal: options.signal,
  });
  if (!response.ok) throw await toError(response);
  if (!response.body) throw new ApiException(503, "UNAVAILABLE");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!options.signal.aborted) {
    const next = await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        if (options.signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    ]);
    if (next.done) break;
    const value = next.value;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;
    for (const frame of parsed.frames) {
      try {
        options.onEvent(JSON.parse(frame.data) as TrackingEvent);
      } catch {
        /* Ignore a malformed frame and keep the stream. */
      }
    }
  }
}
