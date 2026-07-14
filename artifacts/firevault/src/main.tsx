import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";

const { hostname } = window.location;
const isLocal =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "connect.fps-one.nl";

if (!isLocal) {
  window.location.replace(
    "https://connect.fps-one.nl" +
      window.location.pathname +
      window.location.search
  );
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
