import app from "./app";
import { logger } from "./lib/logger";
import { ensureSessionTable } from "./lib/session";
import { planDagelijksBackup } from "./lib/backupService";
import { planDagelijksePortaalOpruiming } from "./lib/portaalOpruimen";
import { planDagelijkseAvgOpruiming } from "./lib/avgOpruiming";
import { planDagelijkseMagazijnSignalering } from "./lib/magazijnSignalering";
import { planDagelijksePlanningMeldingen } from "./lib/planningMeldingenService";
import { planDagelijkseScout } from "./lib/scoutService";
import { planDagelijkseLeermomenten } from "./services/fie-service";
import { planUurlijkseAiDrempelCheck } from "./lib/aiDrempelCheck";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const azureTenantRaw = process.env["AZURE_TENANT_ID"];
const azureClientRaw = process.env["AZURE_CLIENT_ID_NEW"];
logger.info(
  {
    azureTenantPrefix: azureTenantRaw ? azureTenantRaw.slice(0, 8) : null,
    azureTenantLengte: azureTenantRaw ? azureTenantRaw.length : 0,
    azureClientIdPrefix: azureClientRaw ? azureClientRaw.slice(0, 8) : null,
    azureClientIdLengte: azureClientRaw ? azureClientRaw.length : 0,
  },
  "Azure tenant-id en client-id in gebruik (eerste 8 tekens)",
);

ensureSessionTable()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      planDagelijksBackup();
      planDagelijksePortaalOpruiming();
      planDagelijkseAvgOpruiming();
      planDagelijkseMagazijnSignalering();
      planDagelijksePlanningMeldingen();
      planDagelijkseScout();
      planDagelijkseLeermomenten();
      planUurlijkseAiDrempelCheck();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to initialize session store");
    process.exit(1);
  });
