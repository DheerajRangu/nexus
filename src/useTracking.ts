import { useEffect, useRef, useState } from "react";
import type { GeoPoint, Lang, LocationConfirmationRequest } from "../shared/contract";
import {
  advanceDemo,
  ApiException,
  confirmLocation,
  exchangeToken,
  getTracking,
  readEventStream,
  requestContact,
  reversePlace,
  searchPlaces,
  startDemoSession,
} from "./api/client";
import type { ViewModel } from "./CitizenExperience";
import { readLang } from "./i18n";
import { applyEvent, applySnapshot, type ClientTrackingState } from "./realtime/reduce";

export function useTracking(options: { initialToken: string | null; startDemo: boolean }) {
  const [lang, setLangState] = useState<Lang>(() => readLang());
  const [model, setModel] = useState<ViewModel>({ kind: "boot", demo: options.startDemo });
  const langRef = useRef(lang);
  const stateRef = useRef<ClientTrackingState>({ snapshot: null, needsResync: false, terminalError: null });
  const abortRef = useRef<AbortController | null>(null);

  function setLang(next: Lang) {
    langRef.current = next;
    localStorage.setItem("aegis.citizen.lang", next);
    setLangState(next);
  }

  function publish(state: ClientTrackingState, connection: "live" | "reconnecting") {
    stateRef.current = state;
    if (state.terminalError) {
      setModel({ kind: "error", code: "SESSION_EXPIRED" });
      return;
    }
    if (!state.snapshot) return;
    setModel({
      kind: "tracking",
      snapshot: state.snapshot,
      connection,
      needsResync: state.needsResync,
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    let stopped = false;

    const fail = (error: unknown) => {
      if (stopped || controller.signal.aborted) return;
      const code = error instanceof ApiException ? error.code : "UNAVAILABLE";
      if (code === "SESSION_REQUIRED" && !options.initialToken && !options.startDemo) {
        setModel({ kind: "welcome" });
        return;
      }
      stateRef.current = { snapshot: null, needsResync: false, terminalError: null };
      setModel({ kind: "error", code });
    };

    const pump = async (signal: AbortSignal) => {
      let backoff = 1000;
      while (!signal.aborted) {
        try {
          await readEventStream({
            signal,
            lang: langRef.current,
            lastEventId: stateRef.current.snapshot?.lastEventId ?? null,
            onEvent: (event) => {
              const result = applyEvent(stateRef.current, event);
              publish(result.state, "live");
              if (result.reason === "gap") {
                void getTracking(langRef.current, signal)
                  .then((snapshot) => publish(applySnapshot(snapshot), "live"))
                  .catch((error) => fail(error));
              }
            },
          });
          if (signal.aborted) return;
          throw new ApiException(503, "UNAVAILABLE");
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof ApiException && (error.status === 401 || error.status === 403)) {
            fail(error);
            return;
          }
          setModel((current) => (current.kind === "tracking" ? { ...current, connection: "reconnecting" } : current));
          try {
            await sleep(backoff, signal);
          } catch {
            return;
          }
          backoff = Math.min(backoff * 2, 10000);
          try {
            const snapshot = await getTracking(langRef.current, signal);
            publish(applySnapshot(snapshot), "live");
          } catch (refreshError) {
            if (refreshError instanceof ApiException && (refreshError.status === 401 || refreshError.status === 403)) {
              fail(refreshError);
              return;
            }
          }
        }
      }
    };

    void (async () => {
      try {
        let snapshot;
        if (options.initialToken) {
          snapshot = (await exchangeToken(options.initialToken, langRef.current, controller.signal)).tracking;
        } else if (options.startDemo) {
          snapshot = (await startDemoSession(langRef.current, controller.signal)).tracking;
        } else {
          snapshot = await getTracking(langRef.current, controller.signal);
        }
        if (stopped) return;
        publish(applySnapshot(snapshot), "live");
        await pump(controller.signal);
      } catch (error) {
        fail(error);
      }
    })();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [options.initialToken, options.startDemo]);

  useEffect(() => {
    const snapshot = stateRef.current.snapshot;
    if (!snapshot) return;
    const controller = new AbortController();
    void getTracking(lang, controller.signal)
      .then((next) => publish(applySnapshot(next), "live"))
      .catch(() => undefined);
    return () => controller.abort();
  }, [lang]);

  useEffect(() => {
    const offline = () => {
      setModel((current) => (current.kind === "tracking" ? { ...current, connection: "reconnecting" } : current));
    };
    const online = () => {
      const signal = abortRef.current?.signal;
      if (!signal || signal.aborted) return;
      void getTracking(langRef.current, signal)
        .then((snapshot) => publish(applySnapshot(snapshot), "live"))
        .catch(() => undefined);
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  return {
    model,
    lang,
    setLang,
    async submitLocation(body: LocationConfirmationRequest) {
      const response = await confirmLocation(body, langRef.current);
      publish(applySnapshot(response.tracking), "live");
      return response.alerts;
    },
    async search(query: string) {
      const response = await searchPlaces(query, langRef.current);
      return { results: response.results, syntheticAddress: response.syntheticAddress };
    },
    async reverse(point: GeoPoint) {
      const response = await reversePlace(point.latitude, point.longitude, langRef.current);
      return { result: response.results[0] ?? null, syntheticAddress: response.syntheticAddress };
    },
    async contact(kind: "control-room" | "driver") {
      const response = await requestContact(kind, langRef.current);
      window.location.href = `tel:${response.phone}`;
    },
    async demoStep(step: Parameters<typeof advanceDemo>[0]) {
      const response = await advanceDemo(step, langRef.current);
      publish(applySnapshot(response.tracking), "live");
    },
    retry() {
      window.location.reload();
    },
  };
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
