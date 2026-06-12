import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware, maakStatelozeSessie } from "./lib/session";

const app: Express = express();

app.set("trust proxy", 1);

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
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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
