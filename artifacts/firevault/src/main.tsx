import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { injecteerOntwerpTokens } from "./lib/ontwerpTokens";

injecteerOntwerpTokens();
createRoot(document.getElementById("root")!).render(<App />);
