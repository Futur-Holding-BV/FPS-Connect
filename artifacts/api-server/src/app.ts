import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware, maakStatelozeSessie } from "./lib/session";

const app: Express = express();

app.set("trust proxy", 1);

// ── CORS origin-whitelist ─────────────────────────────────────────────────────
// Sta alleen Replit-domeinen toe. REPLIT_DOMAINS is kommagescheiden (productie),
// REPLIT_DEV_DOMAIN is de dev-tunnel. Lokale localhost-varianten voor CI.
const TOEGESTANE_ORIGINS: Set<string> = (() => {
  const origins = new Set<string>();
  // Productiedomeinen vanuit Replit
  const replitDomains = process.env.REPLIT_DOMAINS ?? "";
  for (const d of replitDomains.split(",").map((s) => s.trim()).filter(Boolean)) {
    origins.add(`https://${d}`);
  }
  // Dev-tunnel
  const devDomain = process.env.REPLIT_DEV_DOMAIN ?? "";
  if (devDomain) origins.add(`https://${devDomain}`);
  // Expo dev-domein (aparte subdomain buiten de normale proxy, nodig voor e2e)
  const expoDev = process.env.REPLIT_EXPO_DEV_DOMAIN ?? "";
  if (expoDev) origins.add(`https://${expoDev}`);
  // Lokale ontwikkeling — alleen als NODE_ENV niet production is
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:25392");
    origins.add("http://localhost:80");
    origins.add("http://localhost:3000");
  }
  return origins;
})();

app.use(
  cors({
    origin: (origin, callback) => {
      // Geen origin = zelfde-origin-verzoek (server-to-server of curl) — toegestaan
      if (!origin) return callback(null, true);
      if (TOEGESTANE_ORIGINS.has(origin)) return callback(null, true);
      // In dev: ook subdomein-varianten van REPLIT_DEV_DOMAIN toestaan
      const dev = process.env.REPLIT_DEV_DOMAIN ?? "";
      if (dev && origin.endsWith(`.${dev}`)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' niet toegestaan`));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);

// ── HTTP-beveiligingsheaders ──────────────────────────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Bearer-token verzoeken komen uitsluitend van de mobiele monteur-app. Die auth
// is stateless, dus we slaan twee vliegen in een klap voor dat pad:
//
// 1. Sessie-store overslaan. Zou de gedeelde sessionMiddleware draaien, dan
//    schrijft connect-pg-simple per mobiel verzoek een nieuwe rij in de
//    session-tabel (de mobiele app bewaart de cookie niet, dus hergebruikt geen
//    sessie). Met een niet-persisterende stub-sessie blijft `req.session`
//    bruikbaar voor handlers, maar wordt er niets opgeslagen en geen cookie
//    gezet.
// 2. Conditionele cache-headers strippen. De React Native fetch-implementatie
//    geeft een 304 Not Modified rechtstreeks aan de JS-laag door (anders dan
//    browsers, die een 304 transparant als gecachete 200 afhandelen). Onze
//    gedeelde fetch-laag ziet 304 als "geen body" en levert null, waardoor
//    lijsten leeg lijken of blijven laden. Door de conditionele headers te
//    verwijderen stuurt de server altijd een volledige 200 met body.
//
// De web-app gebruikt sessie-cookies (geen Authorization-header) en behoudt zo
// zowel de sessie-store als haar 304-optimalisatie.
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    delete req.headers["if-none-match"];
    delete req.headers["if-modified-since"];
    req.session = maakStatelozeSessie();
    next();
    return;
  }
  sessionMiddleware(req, res, next);
});

app.use("/api", router);

export default app;
