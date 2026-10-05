import express, { type NextFunction, type Request, type Response } from "express";
import http from "node:http";
import { CONTRACT_VERSION, DEMO_STEPS, type DemoStep, type TrackingEvent } from "../shared/contract";
import { negotiateLanguage } from "./explanations";
import { DevelopmentStore, HttpError, type AdapterDeps } from "./store";

const COOKIE = "aegis_cts";

export interface AppOptions extends AdapterDeps {
  backendBaseUrl?: string;
  logger: (line: string) => void;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AppOptions {
  const mode = env.ADAPTER_MODE === "proxy" ? "proxy" : "development";
  const backendBaseUrl = env.AEGIS_BACKEND_BASE_URL?.trim() || undefined;
  if (mode === "proxy" && !backendBaseUrl) {
    throw new Error("ADAPTER_MODE=proxy requires AEGIS_BACKEND_BASE_URL.");
  }
  return {
    now: () => Date.now(),
    mode,
    backendBaseUrl,
    controlRoomPhone: env.PUBLIC_CONTROL_ROOM_PHONE || "108",
    driverRelayPhone: env.PUBLIC_DRIVER_RELAY_PHONE || env.PUBLIC_CONTROL_ROOM_PHONE || "108",
    tokenTtlMs: hours(12),
    sessionTtlMs: minutes(20),
    activeAccessTtlMs: hours(6),
    terminalAccessTtlMs: minutes(30),
    staleAfterSeconds: 45,
    logger: (line) => console.log(line),
  };
}

export function createApp(options: AppOptions) {
  const store = new DevelopmentStore(options);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use((req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    const origin = req.header("origin");
    if (origin && allowedOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept-Language, Aegis-Contract-Version, Last-Event-ID");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.status(204).end();
      return;
    }
    next();
  });

  app.use((req, res, next) => {
    res.on("finish", () => {
      options.logger(`${req.method} ${req.path} ${res.statusCode}`);
    });
    next();
  });

  if (options.mode === "development" && options.backendBaseUrl) {
    options.logger("Ignoring AEGIS_BACKEND_BASE_URL because ADAPTER_MODE is development. Synthetic data only.");
  }

  app.get("/api/v1/citizen/health", (_req, res) => {
    res.json({
      contractVersion: CONTRACT_VERSION,
      service: options.mode === "proxy" ? "aegis-citizen-proxy" : "aegis-citizen-development-adapter",
      mode: options.mode,
      syntheticDataOnly: options.mode === "development",
      label: options.mode === "development" ? "DEVELOPMENT ADAPTER" : "PROXY",
    });
  });

  if (options.mode === "proxy") {
    app.use("/api/v1/citizen/demo", (_req, res) => {
      sendError(res, new HttpError(404, "DEMO_DISABLED", "Demo routes are disabled when AEGIS_BACKEND_BASE_URL is configured."));
    });
    app.use("/api/v1/citizen", (req, res) => proxyToBackend(req, res, options));
  } else {
    mountDevelopment(app, store, options);
  }

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next;
    if (error instanceof HttpError) {
      sendError(res, error);
      return;
    }
    if (error instanceof SyntaxError) {
      sendError(res, new HttpError(400, "VALIDATION", "The request could not be read."));
      return;
    }
    options.logger(error instanceof Error ? error.stack ?? error.message : "request failed");
    sendError(res, new HttpError(503, "UNAVAILABLE", "Tracking is temporarily unavailable."));
  });

  return { app, store };
}

function mountDevelopment(app: express.Express, store: DevelopmentStore, options: AppOptions) {
  app.post("/api/v1/citizen/demo/sessions", (req, res, next) => {
    try {
      assertContract(req);
      const autoplay = req.body?.autoplay !== false;
      const issued = store.issueToken({ autoplay });
      const session = store.openSession(issued.token);
      const emergency = store.requireSession(session.secret);
      const lang = negotiateLanguage(req.header("accept-language"));
      setSessionCookie(res, session.secret, session.expiresAt, options.now());
      res.json({
        contractVersion: CONTRACT_VERSION,
        label: "DEVELOPMENT DEMO",
        synthetic: true,
        notice: "Synthetic mission. Not a live emergency.",
        sessionExpiresAt: session.expiresAt,
        tracking: store.snapshot(emergency, lang),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/citizen/sessions", (req, res, next) => {
    try {
      assertContract(req);
      const token = req.body?.linkToken;
      if (typeof token !== "string" || token.length < 20) {
        throw new HttpError(401, "TOKEN_INVALID", "This tracking link is not valid.");
      }
      const session = store.openSession(token);
      const emergency = store.requireSession(session.secret);
      const lang = negotiateLanguage(req.header("accept-language"));
      setSessionCookie(res, session.secret, session.expiresAt, options.now());
      res.json({
        contractVersion: CONTRACT_VERSION,
        sessionExpiresAt: session.expiresAt,
        tracking: store.snapshot(emergency, lang),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/citizen/tracking", (req, res, next) => {
    try {
      assertContract(req);
      const emergency = store.requireSession(readCookie(req.header("cookie"), COOKIE), readEmergencyQuery(req));
      res.json(store.snapshot(emergency, negotiateLanguage(req.header("accept-language"))));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/citizen/location", (req, res, next) => {
    try {
      assertContract(req);
      const emergency = store.requireSession(readCookie(req.header("cookie"), COOKIE), req.body?.emergencyId);
      const lang = negotiateLanguage(req.header("accept-language"));
      res.json(store.confirmLocation(emergency, req.body, lang));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/citizen/contacts/control-room", (req, res, next) => {
    try {
      assertContract(req);
      const emergency = store.requireSession(readCookie(req.header("cookie"), COOKIE));
      if (!store.snapshot(emergency, "en").permissions.canContactControlRoom) {
        throw new HttpError(403, "DRIVER_CONTACT_UNAUTHORIZED", "Contact is not available for this request.");
      }
      res.json(contactBody(options.controlRoomPhone, emergency.accessExpiresAt, false));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/citizen/contacts/driver", (req, res, next) => {
    try {
      assertContract(req);
      const emergency = store.requireSession(readCookie(req.header("cookie"), COOKIE));
      if (!store.snapshot(emergency, "en").permissions.canContactDriver) {
        throw new HttpError(403, "DRIVER_CONTACT_UNAUTHORIZED", "The driver can be contacted after an ambulance is assigned.");
      }
      res.json(contactBody(options.driverRelayPhone, emergency.accessExpiresAt, true));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/citizen/places/search", (req, res, next) => {
    try {
      assertContract(req);
      store.requireSession(readCookie(req.header("cookie"), COOKIE));
      const q = typeof req.query.q === "string" ? req.query.q : "";
      res.json({
        contractVersion: CONTRACT_VERSION,
        syntheticAddress: true,
        results: store.searchPlaces(q),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/citizen/places/reverse", (req, res, next) => {
    try {
      assertContract(req);
      store.requireSession(readCookie(req.header("cookie"), COOKIE));
      const latitude = Number(req.query.latitude);
      const longitude = Number(req.query.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new HttpError(400, "VALIDATION", "Latitude or longitude is not valid.");
      }
      res.json({
        contractVersion: CONTRACT_VERSION,
        syntheticAddress: true,
        results: [store.reversePlace(latitude, longitude)],
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/citizen/demo/advance", (req, res, next) => {
    try {
      assertContract(req);
      const emergency = store.requireSession(readCookie(req.header("cookie"), COOKIE));
      const step = req.body?.step;
      if (!DEMO_STEPS.includes(step)) throw new HttpError(400, "VALIDATION", "Unknown demonstration step.");
      const tracking = store.applyDemoStep(emergency, step as DemoStep, negotiateLanguage(req.header("accept-language")));
      res.json({ contractVersion: CONTRACT_VERSION, label: "DEVELOPMENT DEMO", tracking });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/citizen/events", (req, res, next) => {
    try {
      assertContract(req);
      const emergency = store.requireSession(readCookie(req.header("cookie"), COOKIE));
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");
      const current = Number(store.snapshot(emergency, "en").lastEventId);
      const header = req.header("last-event-id");
      const last = header == null || header === "" ? current : Number(header);
      const replayFrom = Number.isFinite(last) ? last : current;
      for (const event of store.eventsAfter(emergency, replayFrom)) writeEvent(res, event);
      let closed = false;
      const unsubscribe = store.subscribe((event) => {
        if (closed || event.emergencyId !== emergency.emergencyId) return;
        try {
          writeEvent(res, event);
        } catch {
          closed = true;
          unsubscribe();
        }
      });
      const heartbeat = setInterval(() => {
        if (closed || res.writableEnded) return;
        res.write(": ping\n\n");
      }, 20000);
      heartbeat.unref();
      req.on("close", () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/v1/citizen", (_req, res) => {
    sendError(res, new HttpError(404, "NOT_FOUND", "That tracking route is not available."));
  });
}

function writeEvent(res: Response, event: TrackingEvent) {
  res.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

function proxyToBackend(req: Request, res: Response, options: AppOptions) {
  const base = options.backendBaseUrl;
  if (!base) {
    sendError(res, new HttpError(503, "UNAVAILABLE", "Tracking is temporarily unavailable."));
    return;
  }
  let target: URL;
  try {
    target = new URL(req.originalUrl, base.endsWith("/") ? base : `${base}/`);
  } catch {
    sendError(res, new HttpError(503, "UNAVAILABLE", "Tracking is temporarily unavailable."));
    return;
  }
  const headers = { ...req.headers, host: target.host };
  const preq = http.request(
    target,
    { method: req.method, headers, timeout: 2500 },
    (pres) => {
      res.writeHead(pres.statusCode ?? 502, pres.headers);
      pres.pipe(res);
    },
  );
  preq.on("timeout", () => preq.destroy(new Error("timeout")));
  preq.on("error", () => {
    if (!res.headersSent) {
      sendError(res, new HttpError(503, "UNAVAILABLE", "Tracking is temporarily unavailable."));
    }
  });
  req.pipe(preq);
}

function contactBody(phone: string, accessExpiresAt: number, relay: boolean) {
  return {
    contractVersion: CONTRACT_VERSION,
    method: "tel" as const,
    phone,
    expiresAt: new Date(accessExpiresAt).toISOString(),
    relay,
  };
}

function assertContract(req: Request) {
  const header = req.header("aegis-contract-version");
  if (!header) return;
  if (header.split(".")[0] !== "1") {
    throw new HttpError(406, "CONTRACT_UNSUPPORTED", "This citizen app needs contract 1.x.");
  }
}

function readEmergencyQuery(req: Request): string | null {
  const value = req.query.emergencyId;
  return typeof value === "string" && value ? value : null;
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function setSessionCookie(res: Response, secret: string, expiresAtIso: string, nowMs: number) {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAtIso) - nowMs) / 1000));
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(secret)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function sendError(res: Response, error: HttpError) {
  res.status(error.status).json({
    contractVersion: CONTRACT_VERSION,
    code: error.code,
    message: error.message,
    ...error.extra,
  });
}

function allowedOrigin(origin: string): boolean {
  return origin === "http://localhost:5173" || origin === "http://127.0.0.1:5173";
}

function hours(value: number) {
  return value * 60 * 60 * 1000;
}

function minutes(value: number) {
  return value * 60 * 1000;
}
