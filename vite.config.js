import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";

// ─────────────────────────────────────────────────────────────────
//  vite.config.js
//
//  base : "/mes-adresses/"
//    OBLIGATOIRE pour GitHub Pages.
//    L'app est servie sur lerizou.github.io/mes-adresses/
//    et non à la racine. Sans ce paramètre, tous les imports JS/CSS
//    cherchent leurs assets à la racine "/" et l'app reste blanche.
//
//  envPrefix : "VITE_"
//    Seules les variables préfixées VITE_ sont exposées dans le bundle.
//    Les variables sans préfixe (ex: NODE_ENV) ne sont jamais injectées.
// ─────────────────────────────────────────────────────────────────

export default defineConfig({
  plugins:   [react()],
  base:      "/mes-adresses/",
  envPrefix: "VITE_",
  build: {
    outDir:    "dist",
    sourcemap: false, // pas de sourcemap en prod (expose le code source)
  },
});
