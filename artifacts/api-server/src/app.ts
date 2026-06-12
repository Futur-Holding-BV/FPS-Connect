import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";

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
app.use(sessionMiddleware);

// De mobiele monteur-app gebruikt de React Native fetch-implementatie, die een
// 304 Not Modified rechtstreeks aan de JS-laag doorgeeft (anders dan browsers,
// die een 304 transparant afhandelen en de gecachete body als 200 teruggeven).
// De gedeelde fetch-laag behandelt 304 als "geen body" en levert dan null op,
// waardoor lijsten op de mobiele app leeg lijken of blijven laden. Voor verzoeken
// met een bearer-token (uitsluitend de mobiele app) strippen we daarom de
// conditionele headers, zodat de server altijd een volledige 200 met body stuurt.
// De web-app gebruikt sessie-cookies (geen Authorization-header) en behoudt zo
// haar 304-optimalisatie.
app.use((req, _res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    delete req.headers["if-none-match"];
    delete req.headers["if-modified-since"];
  }
  next();
});

app.use("/api", router);

export default app;
