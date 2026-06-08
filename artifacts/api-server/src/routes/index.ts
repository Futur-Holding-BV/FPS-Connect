import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import uitnodigingRouter from "./uitnodiging";
import dashboardRouter from "./dashboard";
import gebouwenRouter from "./gebouwen";
import voorzieningenRouter from "./voorzieningen";
import inspectiesRouter from "./inspecties";
import onderhoudRouter from "./onderhoud";
import gebruikersRouter from "./gebruikers";
import abonnementenRouter from "./abonnementen";
import storageRouter from "./storage";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Publieke routes
router.use(healthRouter);
router.use(authRouter);
router.use(uitnodigingRouter);

// Vanaf hier vereist alles een geldige sessie
router.use(requireAuth);

router.use(dashboardRouter);
router.use(gebouwenRouter);
router.use(voorzieningenRouter);
router.use(inspectiesRouter);
router.use(onderhoudRouter);
router.use(gebruikersRouter);
router.use(abonnementenRouter);
router.use(storageRouter);

export default router;
