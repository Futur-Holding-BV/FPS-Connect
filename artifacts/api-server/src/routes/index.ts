import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import uitnodigingRouter from "./uitnodiging";
import dashboardRouter from "./dashboard";
import gebouwenRouter from "./gebouwen";
import voorzieningenRouter from "./voorzieningen";
import classificatieRouter from "./classificatie";
import fabrikantenRouter from "./fabrikanten";
import documentenRouter from "./documenten";
import inspectiesRouter from "./inspecties";
import onderhoudRouter from "./onderhoud";
import gebruikersRouter from "./gebruikers";
import abonnementenRouter from "./abonnementen";
import storageRouter from "./storage";
import systeemRouter from "./systeem";
import infoRouter from "./info";
import crmRouter from "./crm";
import emailsRouter from "./emails";
import profielenRouter from "./profielen";
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
router.use(classificatieRouter);
router.use(fabrikantenRouter);
router.use(documentenRouter);
router.use(inspectiesRouter);
router.use(onderhoudRouter);
router.use(gebruikersRouter);
router.use(abonnementenRouter);
router.use(storageRouter);
router.use(systeemRouter);
router.use(infoRouter);
router.use(crmRouter);
router.use(emailsRouter);
router.use(profielenRouter);

export default router;
