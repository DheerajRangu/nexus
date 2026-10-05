import { createRoot } from "react-dom/client";
import { App } from "./App";
import { consumeTrackingToken } from "./token";
import "./index.css";

const initialToken = consumeTrackingToken(window.location, (path) => {
  window.history.replaceState(null, "", path);
});
const startDemo = window.location.pathname === "/demo";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App initialToken={initialToken} startDemo={startDemo} />);
}
