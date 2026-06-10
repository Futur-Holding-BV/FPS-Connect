import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // De session-tabel wordt beheerd door connect-pg-simple (express-session) en
  // staat bewust niet in het drizzle-schema. Zonder deze filter wil drizzle hem
  // bij elke push droppen, wat de post-merge push laat falen en sessies wist.
  tablesFilter: ["!session"],
});
