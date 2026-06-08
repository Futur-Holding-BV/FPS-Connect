import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import gebouwenRouter from "./gebouwen";
import voorzieningenRouter from "./voorzieningen";
import inspectiesRouter from "./inspecties";
import onderhoudRouter from "./onderhoud";
import gebruikersRouter from "./gebruikers";
import abonnementenRouter from "./abonnementen";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(gebouwenRouter);
router.use(voorzieningenRouter);
router.use(inspectiesRouter);
router.use(onderhoudRouter);
router.use(gebruikersRouter);
router.use(abonnementenRouter);

export default router;
