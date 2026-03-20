// ─────────────────────────────────────────────────────────────────
//  main.jsx — Point d'entrée de l'application React
//  Monte le composant App dans le DOM via React 18 (createRoot).
// ─────────────────────────────────────────────────────────────────

import { StrictMode } from "react";
import { createRoot }  from "react-dom/client";
import App             from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
