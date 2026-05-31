import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { createServer, type Server } from "http";
import { registerRoutes } from "./routes.js";
import { seedDatabase } from "./seed.js";
import { logger, requestIdMiddleware, requestLogMiddleware } from "./observability/logger.js";
import { getPrometheusMetrics, metricsMiddleware, promRegistry } from "./observability/metrics.js";
import { initSentry, Sentry } from "./observability/sentry.js";
import { pool } from "./db.js";
import { requestTimeout } from "./middleware/timeout.js";
import { csrfProtection } from "./middleware/csrf.js";
import { envelopeMiddleware } from "./middleware/envelope.js";
import { idempotencyGuard } from "./middleware/idempotency.js";
import { generateOpenApiDocument } from "./openapi.js";
import { config } from "./config.js";

// Register all agentic tools at import time.
import "./ai/tools/index.js";

initSentry();

if (!config.anthropicApiKey) {
  logger.warn("ANTHROPIC_API_KEY is not set — AI features will be unavailable.");
}
if (!config.openaiApiKey) {
  logger.warn("OPENAI_API_KEY is not set — OpenAI features will be unavailable.");
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export interface ConfiguredApp {
  app: Express;
  httpServer: Server;
}

interface RegisterConfiguredRoutesOptions {
  seedDatabaseOnInit?: boolean;
}

function configureCors(app: Express): void {
  const allowedOrigins = config.corsOrigins;
  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-csrf-token", "Authorization", "Idempotency-Key"],
      maxAge: 86400,
    })
  );
}

function configureSecurity(app: Express): void {
  const isDev = !config.isProduction;

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", ...(isDev ? ["'unsafe-inline'"] : [])],
          styleSrc: ["'self'", "https://fonts.googleapis.com", ...(isDev ? ["'unsafe-inline'"] : [])],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "blob:", "https:"],
          connectSrc: ["'self'", ...(isDev ? [`ws://localhost:${config.port}`] : [])],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      xFrameOptions: { action: "deny" },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      // @ts-expect-error -- permissionsPolicy is supported by helmet but not in current type defs
      permissionsPolicy: {
        features: {
          camera: ["self"],
          microphone: ["self"],
          geolocation: ["self"],
          payment: ["none"],
        },
      },
    })
  );

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  app.use(compression());
}

function configureApiMiddleware(app: Express): void {
  app.use(metricsMiddleware);
  app.use(requestIdMiddleware);
  app.use(requestLogMiddleware);

  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use((req, _res, next) => {
    if (req.path.startsWith("/api/v1/")) {
      req.url = req.url.replace("/api/v1/", "/api/");
    }
    next();
  });

  app.use("/api", csrfProtection);
  app.use("/api", requestTimeout(30_000));
  app.use("/api", envelopeMiddleware);
  app.use("/api", idempotencyGuard);
}

function registerOperationalRoutes(app: Express): void {
  app.get("/healthz", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const dbOk = await (async () => {
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
        return true;
      } finally {
        client.release();
      }
    })().catch(() => false);

    const status = dbOk ? "ok" : "degraded";
    res.status(dbOk ? 200 : 503).json({
      status,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? "connected" : "unreachable",
      },
    });
  });

  // OpenAPI spec endpoint
  app.get("/api/openapi.json", (_req, res) => {
    res.json(generateOpenApiDocument());
  });

  // Scalar API docs UI
  app.get("/api/docs", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html><head><title>AdaptiveAI API Docs</title><meta charset="utf-8" />
<style>body{margin:0}</style></head><body>
<script id="api-reference" data-url="/api/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body></html>`);
  });

  app.get("/metrics", async (_req, res) => {
    try {
      res.set("Content-Type", promRegistry.contentType);
      res.end(await getPrometheusMetrics());
    } catch (error) {
      res.status(500).end(String(error));
    }
  });
}

function registerRequestLogging(app: Express): void {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        logger.info(`${req.method} ${path}`, {
          method: req.method,
          path,
          statusCode: res.statusCode,
          duration,
          requestId: res.locals.requestId as string | undefined,
          userId: req.user ? (req.user as Express.User).id : undefined,
        });
      }
    });

    next();
  });
}

export function createConfiguredApp(): ConfiguredApp {
  const app = express();
  const httpServer = createServer(app);

  app.set("trust proxy", config.trustProxyHops);

  configureCors(app);
  configureSecurity(app);
  configureApiMiddleware(app);
  registerOperationalRoutes(app);
  registerRequestLogging(app);

  return { app, httpServer };
}

export async function registerConfiguredRoutes(
  { app, httpServer }: ConfiguredApp,
  options: RegisterConfiguredRoutesOptions = {},
): Promise<void> {
  await registerRoutes(httpServer, app);

  if (options.seedDatabaseOnInit) {
    await seedDatabase();
  }
}

export function installGlobalErrorHandler(app: Express): void {
  app.use((err: Error & { status?: number; statusCode?: number }, req: Request, res: Response, next: NextFunction) => {
    if (err.constructor?.name === "ZodError" && "issues" in err) {
      const zodErr = err as unknown as { issues: { path: (string | number)[]; message: string }[] };
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          message: "Validation error",
          details: zodErr.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
        requestId: res.locals.requestId as string | undefined,
      });
    }

    const status = err.status ?? err.statusCode ?? 500;
    const requestId = res.locals.requestId as string | undefined;

    logger.error("Server error", err, {
      status,
      path: req.path,
      method: req.method,
      requestId,
      userId: req.user ? (req.user as Express.User).id : undefined,
    });

    if (status >= 500) {
      const user = req.user as Express.User | undefined;
      Sentry.withScope((scope) => {
        scope.setTag("requestId", requestId ?? "unknown");
        scope.setContext("request", {
          path: req.path,
          method: req.method,
          requestId,
        });
        if (user) {
          scope.setUser({
            id: String(user.id),
            username: user.username,
            role: user.role,
            workspaceId: user.workspaceId,
          });
        }
        Sentry.captureException(err);
      });
    }

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({
      ok: false,
      data: null,
      error: {
        message: config.isProduction ? "Internal Server Error" : err.message || "Internal Server Error",
        ...(!config.isProduction && { stack: err.stack }),
      },
      requestId,
    });
  });
}

export { Sentry };
