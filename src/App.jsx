// ═══════════════════════════════════════════════════════════════════════════════
//  MES ADRESSES — App.jsx  (fichier unique, v2.2)
//
//  ──────────────────────────────────────────────────────────────────────────────
//  COMMENT CONFIGURER CE FICHIER POUR UN NOUVEAU PROJET
//  ──────────────────────────────────────────────────────────────────────────────
//  1. Remplacer API_URL par l'URL de déploiement de votre Google Apps Script
//     (GAS : Déployer → Gérer les déploiements → URL de l'application Web)
//  2. Remplacer API_KEY par la valeur de votre propriété INTERNAL_API_KEY
//     (GAS : Extensions → Apps Script → Projet → Propriétés du script)
//  3. Adapter MOCK_ADDRESSES pour vos données de démonstration (fallback hors-ligne)
//  4. Ajuster CATEGORY_CONFIG selon vos catégories métier
//
//  ──────────────────────────────────────────────────────────────────────────────
//  CORRECTIONS APPLIQUÉES (v2.1 → v2.2)
//  ──────────────────────────────────────────────────────────────────────────────
//
//  BUG 1 — API_KEY non définie
//    Problème : ReferenceError à chaque appel fetch → fallback mock systématique.
//    Correction : constante API_KEY déclarée (INTERNAL_API_KEY).
//
//  BUG 2 — useToast : timerRef pas un useRef
//    Problème : { current: null } recréé à chaque render → clearTimeout inefficace.
//    Correction : useRef(null) pour une référence persistante entre renders.
//
//  BUG 3 — Modal : données périmées + fermeture prématurée
//    Problème : handleUpdate appelait setModal(null) → fermeture avant réponse API.
//               La modal affichait un snapshot figé après une sauvegarde.
//    Correction : modalData (useMemo) dérive les données fraîches depuis addresses[].
//                 setModal(null) supprimé de handleUpdate.
//
//  BUG 4 — CommentZone : commentaires non persistés
//    Problème : onChange() ne faisait que mettre à jour le state local.
//    Correction : handleCommentSave() dans Modal appelle apiPost + rollback.
//
//  BUG 7 — Spinner de chargement : double propriété `background`
//    Correction : propriété dupliquée supprimée.
//
//  POINT 1 — Content-Type adaptatif
//    apiPost tente text/plain (évite le preflight CORS), bascule sur
//    application/json si ça échoue, et mémorise le type gagnant.
//
//  ──────────────────────────────────────────────────────────────────────────────
//  ARCHITECTURE DU FICHIER (ordre de déclaration)
//  ──────────────────────────────────────────────────────────────────────────────
//
//  ┌─ CONFIGURATION          → API_URL, API_KEY
//  ├─ THÈME                  → useTheme
//  ├─ DONNÉES MOCK           → MOCK_ADDRESSES, STATUS_OPTIONS
//  ├─ CATÉGORIES             → CATEGORY_CONFIG, resolveIcon, cc, ci
//  ├─ PARSING                → parseCSV, parseCategoryList, serializeCSV, normalizePlace
//  ├─ HOOKS                  → useData, useToast, useEditableModal
//  ├─ API                    → apiPost, getMapsUrl
//  ├─ REDUCER                → INIT, reducer
//  ├─ TOKENS TYPOGRAPHIQUES  → Label, FieldLabel, inputStyle, selectStyle
//  ├─ COMPOSANTS PRIMITIFS   → Stars, FilterPill, StatusBadge, ThemeToggle, MapsButton
//  ├─ FILTRES                → FilterBar, ActiveChips
//  ├─ CARTE                  → AddressCard
//  ├─ UTILITAIRE MOBILE      → scrollFieldIntoView
//  ├─ COMBOBOX               → TagInput
//  ├─ MODALS                 → CommentZone, ModalSheet, FormField, Modal, CreateModal
//  ├─ FAB                    → FAB
//  ├─ STYLES GLOBAUX         → globalStyles
//  └─ COMPOSANT RACINE       → export default App
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo, useReducer, useEffect, useCallback, useRef } from "react";


// ─────────────────────────────────────────────────────────────────
//  CONFIGURATION GLOBALE — chargée depuis les variables d'environnement
//
//  ⚠️  NE JAMAIS mettre de valeurs réelles ici. Utiliser le fichier .env
//      (copier .env.example → .env et remplir les valeurs).
//      Le fichier .env est dans .gitignore et ne sera jamais commité.
//
//  Pour un nouveau projet :
//    1. Copier .env.example en .env
//    2. Renseigner VITE_API_URL  (URL de déploiement Google Apps Script)
//    3. Renseigner VITE_API_KEY  (valeur de la propriété INTERNAL_API_KEY dans GAS)
//    4. Lancer `npm run dev` ou `npm run build`
//
//  ⚠️  SÉCURITÉ — limitation inhérente aux SPAs :
//      Vite injecte ces valeurs dans le bundle JS à la compilation.
//      Elles seront lisibles dans le bundle de production par DevTools.
//      Pour une protection maximale, utiliser un proxy serverless
//      (Netlify Functions, Vercel Edge Functions) qui garde la clé côté serveur.
//      Pour un usage personnel non critique, ce niveau de protection est suffisant.
// ─────────────────────────────────────────────────────────────────

/**
 * URL de déploiement du Google Apps Script.
 * Source : variable d'environnement VITE_API_URL (fichier .env).
 */
const API_URL = import.meta.env.VITE_API_URL;

/**
 * Clé d'authentification interne.
 * Doit correspondre à la propriété "INTERNAL_API_KEY" dans PropertiesService GAS.
 * Source : variable d'environnement VITE_API_KEY (fichier .env).
 */
const API_KEY = import.meta.env.VITE_API_KEY;

// ─────────────────────────────────────────────────────────────────
//  SPRINT 1.3 — PREFETCH AU NIVEAU MODULE
//  Lancé dès que le JS est chargé, AVANT que React se monte.
//  Le cold start GAS (~1-2s) se passe pendant l'init React.
// ─────────────────────────────────────────────────────────────────
const _prefetchPromise = (API_URL && API_KEY)
  ? fetch(API_URL, {
      method:  "POST",
      headers: { "Content-Type": "text/plain" },
      body:    JSON.stringify({ action: "GET_ALL", "x-api-key": API_KEY, limit: 5000 }),
      redirect:"follow",
    }).catch(() => null)
  : null;

// ─────────────────────────────────────────────────────────────────
//  SPRINT 1.1 — CACHE LOCALSTORAGE (stale-while-revalidate)
//  1. Affiche les données cachées instantanément (~10ms)
//  2. Rafraîchit en arrière-plan depuis le GAS
//  3. Invalide le cache après chaque CREATE / UPDATE / DELETE
// ─────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_KEY    = "mes-adresses-v3-data";
const CACHE_TS_KEY = "mes-adresses-v3-ts";

function getCachedData() {
  try {
    const ts = parseInt(localStorage.getItem(CACHE_TS_KEY) || "0", 10);
    if (!ts || Date.now() - ts > CACHE_TTL_MS) return null;
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setCachedData(data) {
  try {
    localStorage.setItem(CACHE_KEY,    JSON.stringify(data));
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch { /* quota exceeded — silencieux */ }
}
/** Invalide le cache. Appeler après chaque CREATE / UPDATE / DELETE. */
function clearAddressCache() {
  try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(CACHE_TS_KEY); }
  catch { /* silencieux */ }
}

// ─────────────────────────────────────────────────────────────────
//  SPRINT 2 — GÉOLOCALISATION & DISTANCE
// ─────────────────────────────────────────────────────────────────

/**
 * Calcule la distance en km entre deux points GPS (formule Haversine).
 * Côté client, instantané, sans appel API.
 * @param {number} lat1  Latitude point 1
 * @param {number} lng1  Longitude point 1
 * @param {number} lat2  Latitude point 2
 * @param {number} lng2  Longitude point 2
 * @returns {number} Distance en km (arrondie à 2 décimales)
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R   = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a   = Math.sin(dLat/2)**2
            + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180)
            * Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 100) / 100;
}

/**
 * Formate une distance km pour l'affichage.
 * < 1 km  → "850 m"
 * >= 1 km → "1.2 km"
 */
function formatDistance(km) {
  if (km === null || km === undefined) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * Hook : géolocalisation du navigateur.
 * Retourne { position, error, loading, request }
 *   position = { lat, lng } | null
 *   request()  = demande/rafraîchit la position
 * Mémorise la position en sessionStorage (pas de re-demande entre pages).
 */
function useGeolocation() {
  const [position, setPosition] = useState(() => {
    try {
      const s = sessionStorage.getItem("mes-adresses-geo");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });
  const [geoError,  setGeoError]  = useState(null);
  const [geoLoading,setGeoLoading]= useState(false);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Géolocalisation non supportée par ce navigateur");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(p);
        setGeoLoading(false);
        try { sessionStorage.setItem("mes-adresses-geo", JSON.stringify(p)); } catch {}
      },
      err => {
        setGeoLoading(false);
        setGeoError(err.code === 1 ? "Permission refusée" : "Position indisponible");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  return { position, geoError, geoLoading, request };
}


// ─────────────────────────────────────────────────────────────────
//  HOOK : useTheme
//  Gère le mode d'affichage : clair / sombre / système
//  Persistance via localStorage (clé : THEME_KEY)
//  Application via data-theme sur <html>
// ─────────────────────────────────────────────────────────────────

const THEME_KEY = "mes-adresses-theme";

function useTheme() {
  // Initialisation depuis localStorage, avec "system" comme défaut
  const [theme, setThemeRaw] = useState(() =>
    localStorage.getItem(THEME_KEY) || "system"
  );

  /**
   * Résout le thème effectif (light | dark) depuis le choix utilisateur.
   * Si le choix est "system", on interroge la media query OS.
   * Mémorisé pour éviter de recalculer à chaque render.
   */
  const resolved = useMemo(() => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
  }, [theme]);

  /**
   * Applique data-theme sur <html> dès que le thème change.
   * En mode "system", écoute le changement de préférence OS en temps réel.
   * Nettoie l'écouteur quand le composant se démonte ou que le thème change.
   */
  useEffect(() => {
    const apply = () => {
      const effective = theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
      document.documentElement.setAttribute("data-theme", effective);
    };

    apply(); // Application immédiate

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      // Cleanup : supprime l'écouteur pour éviter les fuites mémoire
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  /**
   * Met à jour le thème + persiste dans localStorage.
   * useCallback garantit une référence stable (utile si passé en prop).
   */
  const setTheme = useCallback((t) => {
    setThemeRaw(t);
    localStorage.setItem(THEME_KEY, t);
  }, []);

  return { theme, setTheme, resolved };
}


// ─────────────────────────────────────────────────────────────────
//  DONNÉES DE DÉMONSTRATION (MOCK)
//  Utilisées en fallback si l'API est inaccessible.
//  Format identique à normalizePlace() pour garantir la cohérence.
//
//  Chaque entrée doit contenir :
//    id, nom, adresse, categorie, categories[], source_list,
//    budget, note, type_evenement[], recommandes_par[],
//    recommande_par (string CSV), status, tags[], commentaire,
//    coordonnees: { lat, lng }
// ─────────────────────────────────────────────────────────────────
const MOCK_ADDRESSES = [
  { id:"a01", nom:"Le Comptoir des Archives", adresse:"14 Rue des Archives, 75003 Paris",  categorie:"Restaurants",     categories:["Restaurants"],                              source_list:"Restaurants",                  budget:"€€",   note:4.7, type_evenement:["Déjeuner pro","Dîner en couple"],   recommande_par:"Sophie M.",         recommandes_par:["Sophie M."],          status:"✅ Validé",   tags:["terrasse","cave à vins"],      commentaire:"Superbe cave voûtée.",  coordonnees:{lat:48.8607,lng:2.3541} },
  { id:"a02", nom:"Tomo Ramen",               adresse:"9 Rue Sainte-Anne, 75001 Paris",    categorie:"Restaurants",     categories:["Restaurants"],                              source_list:"Restaurants",                  budget:"€",    note:4.5, type_evenement:["Déjeuner rapide","Solo"],           recommande_par:"Kenji T.",          recommandes_par:["Kenji T."],           status:"✅ Validé",   tags:["ramen","queue possible"],      commentaire:"",                      coordonnees:{lat:48.8638,lng:2.3363} },
  { id:"a03", nom:"Atelier Kôko",             adresse:"37 Bd Beaumarchais, 75003 Paris",   categorie:"Bars et cocktails",categories:["Bars et cocktails","Dansant _ Boîte"],      source_list:"Bars et cocktails, Dansant _ Boîte", budget:"€€€", note:4.8, type_evenement:["Soirée amis","Anniversaire"], recommande_par:"Clara V.",          recommandes_par:["Clara V."],           status:"🤔 À tester", tags:["cocktails","tamisée"],         commentaire:"",                      coordonnees:{lat:48.8578,lng:2.3670} },
  { id:"a04", nom:"Galerie Mezzanine",        adresse:"22 Rue Fg St-Antoine, 75012",       categorie:"Culture",         categories:["Culture"],                                  source_list:"Culture",                      budget:"",     note:4.3, type_evenement:["Sortie culturelle"],                recommande_par:"Marc D.",           recommandes_par:["Marc D."],            status:"✅ Validé",   tags:["art contemporain"],            commentaire:"Programmation pointue.", coordonnees:{lat:48.8527,lng:2.3715} },
  { id:"a05", nom:"Brûlerie du Canal",        adresse:"5 Quai de Valmy, 75010 Paris",      categorie:"Cafés",           categories:["Cafés"],                                    source_list:"Cafés",                        budget:"€",    note:4.6, type_evenement:["Télétravail"],                       recommande_par:"Léa F.",            recommandes_par:["Léa F."],             status:"✅ Validé",   tags:["wifi fiable"],                 commentaire:"",                      coordonnees:{lat:48.8702,lng:2.3627} },
  { id:"a06", nom:"Hammam El Médina",         adresse:"48 Rue du Chemin Vert, 75011",      categorie:"Bien-être",       categories:["Bien-être","Spa"],                          source_list:"Bien-être, Spa",               budget:"€€€",  note:4.9, type_evenement:["Détente","Cadeau"],                  recommande_par:"Yasmine A.",        recommandes_par:["Yasmine A."],         status:"🤔 À tester", tags:["hammam","massages"],           commentaire:"",                      coordonnees:{lat:48.8554,lng:2.3815} },
  { id:"a07", nom:"La Recyclerie",            adresse:"83 Bd Ornano, 75018 Paris",         categorie:"Cafés",           categories:["Cafés"],                                    source_list:"Cafés",                        budget:"€",    note:4.4, type_evenement:["Brunch"],                             recommande_par:"Thomas B.",         recommandes_par:["Thomas B."],          status:"✅ Validé",   tags:["jardin"],                      commentaire:"",                      coordonnees:{lat:48.8935,lng:2.3479} },
  { id:"a08", nom:"Osteria Portofino",        adresse:"17 Rue de Bretagne, 75003 Paris",   categorie:"Restaurants",     categories:["Restaurants"],                              source_list:"Restaurants",                  budget:"€€",   note:4.6, type_evenement:["Dîner en famille"],                  recommande_par:"Isabella R.",       recommandes_par:["Isabella R."],        status:"✅ Validé",   tags:["pasta fraîche"],               commentaire:"",                      coordonnees:{lat:48.8614,lng:2.3596} },
  { id:"a09", nom:"Studio Parenthèse",        adresse:"6 Impasse de la Défense, 75020",    categorie:"Sport",           categories:["Sport"],                                    source_list:"Sport",                        budget:"€€",   note:4.7, type_evenement:["Solo"],                               recommande_par:"Nina P.",           recommandes_par:["Nina P."],            status:"🫤 Meh",      tags:["yoga"],                        commentaire:"",                      coordonnees:{lat:48.8620,lng:2.3990} },
  { id:"a10", nom:"Le Boat Club",             adresse:"Quai de la Loire, 75019 Paris",     categorie:"Bars",            categories:["Bars","Rooftop"],                           source_list:"Bars, Rooftop",                budget:"€€",   note:4.2, type_evenement:["Soirée amis"],                        recommande_par:"Alex K., Julien V.",recommandes_par:["Alex K.","Julien V."],status:"✅ Validé",   tags:["bateau","terrasse"],           commentaire:"Parfait en été.",        coordonnees:{lat:48.8848,lng:2.3756} },
  { id:"a11", nom:"Librairie du Globe",       adresse:"67 Bd Beaumarchais, 75003 Paris",   categorie:"Shopping",        categories:["Shopping"],                                 source_list:"Shopping",                     budget:"€",    note:4.5, type_evenement:["Sortie culturelle"],                recommande_par:"Paul C.",           recommandes_par:["Paul C."],            status:"❌ Nope",     tags:["livres rares","BD"],           commentaire:"",                      coordonnees:{lat:48.8584,lng:2.3664} },
  { id:"a12", nom:"Rooftop Babel",            adresse:"Tour B, 33 Rue du Départ, 75015",   categorie:"Restaurants",     categories:["Restaurants","Rooftop"],                    source_list:"Restaurants, Rooftop",         budget:"€€€€", note:4.0, type_evenement:["Repas d'affaires","Anniversaire"],   recommande_par:"Camille H.",        recommandes_par:["Camille H."],         status:"🤔 À tester", tags:["vue panoramique","dress code"], commentaire:"",                      coordonnees:{lat:48.8417,lng:2.3197} },
];

/**
 * Valeurs de statut reconnues par l'app.
 * Doit rester synchronisé avec VALID_STATUS dans le GAS.
 */
const STATUS_OPTIONS = ["✅ Validé", "🤔 À tester", "❌ Nope", "🫤 Meh", "💾 Archive"];


// ─────────────────────────────────────────────────────────────────
//  REGISTRE DES CATÉGORIES (CATEGORY_CONFIG)
//  Associe chaque catégorie textuelle à une icône emoji et une couleur.
//
//  ── Pour ajouter une catégorie ──────────────────────────────────
//    Insérer : "Nom exact": { icon:"🎯", color:"#RRGGBB" }
//
//  ── Comportement de résolution (resolveIcon) ────────────────────
//    1. Correspondance exacte (casse originale)
//    2. Correspondance exacte insensible à la casse
//    3. Correspondance partielle (priorité aux clés les plus longues)
//       Ex: "Bars et cocktails" gagne sur "Bars" pour l'entrée "Bars et cocktails"
//    4. Fallback déterministe via hashColor (couleur stable par hash du nom)
// ─────────────────────────────────────────────────────────────────
const CATEGORY_CONFIG = {
  // ── Catégories principales ──────────────────────────────────────
  "Restaurants":          { icon:"🍽️", color:"#D05A42" },
  "Bars":                 { icon:"🍸",  color:"#7B5EA7" },
  "Cafés":                { icon:"☕",  color:"#A8763E" },
  "Culture":              { icon:"🎨",  color:"#3A79B8" },
  "Sport":                { icon:"🏃",  color:"#3D9E6A" },
  "Shopping":             { icon:"🛍️", color:"#C2547A" },
  "Bien-être":            { icon:"🧘",  color:"#40A3A0" },
  "Hôtels":               { icon:"🏨",  color:"#5B8DB8" },
  "Musées":               { icon:"🏛️", color:"#3A79B8" },
  "Parcs":                { icon:"🌿",  color:"#3D9E6A" },
  "Galeries":             { icon:"🖼️", color:"#9B5EA7" },
  "Cinémas":              { icon:"🎬",  color:"#D08040" },
  "Marchés":              { icon:"🥬",  color:"#5B9E6A" },
  // ── Variantes source_list françaises ────────────────────────────
  "Bars et cocktails":    { icon:"🍸",  color:"#7B5EA7" },
  "Bar à vins":           { icon:"🍷",  color:"#8B4568" },
  "Bars à vins":          { icon:"🍷",  color:"#8B4568" },
  "Café":                 { icon:"☕",  color:"#A8763E" },
  "Restaurant":           { icon:"🍽️", color:"#D05A42" },
  "Dansant _ Boîte":      { icon:"🕺",  color:"#6B35A7" },
  "Boîte de nuit":        { icon:"🕺",  color:"#6B35A7" },
  "Brunch":               { icon:"🥞",  color:"#C87040" },
  "Brunchs":              { icon:"🥞",  color:"#C87040" },
  "Rooftop":              { icon:"🌇",  color:"#C05050" },
  "Rooftops":             { icon:"🌇",  color:"#C05050" },
  "Terrasse":             { icon:"🌿",  color:"#3D9E6A" },
  "Terrasses":            { icon:"🌿",  color:"#3D9E6A" },
  "Hôtel":                { icon:"🏨",  color:"#5B8DB8" },
  "Spa":                  { icon:"🧖",  color:"#40A3A0" },
  "Beauté":               { icon:"💆",  color:"#C2547A" },
  "Fitness":              { icon:"💪",  color:"#3D9E6A" },
  "Yoga":                 { icon:"🧘",  color:"#40A3A0" },
  "Librairie":            { icon:"📚",  color:"#6B8E6B" },
  "Librairies":           { icon:"📚",  color:"#6B8E6B" },
  "Musique":              { icon:"🎵",  color:"#9B5EA7" },
  "Concert":              { icon:"🎵",  color:"#9B5EA7" },
  "Art":                  { icon:"🎨",  color:"#3A79B8" },
  "Exposition":           { icon:"🖼️", color:"#9B5EA7" },
  "Parc":                 { icon:"🌿",  color:"#3D9E6A" },
  "Nature":               { icon:"🌿",  color:"#3D9E6A" },
  "Marché":               { icon:"🥬",  color:"#5B9E6A" },
  "Food":                 { icon:"🍽️", color:"#D05A42" },
  "Street food":          { icon:"🌮",  color:"#D07040" },
  "Burger":               { icon:"🍔",  color:"#C06030" },
  "Pizza":                { icon:"🍕",  color:"#D05A42" },
  "Sushi":                { icon:"🍱",  color:"#3A79B8" },
  "Japonais":             { icon:"🍱",  color:"#3A79B8" },
  "Italien":              { icon:"🍝",  color:"#D05A42" },
  "Français":             { icon:"🥐",  color:"#A8763E" },
  "Bistrot":              { icon:"🥐",  color:"#A8763E" },
  "Gastronomique":        { icon:"⭐",  color:"#C07A20" },
  "Asiatique":            { icon:"🥢",  color:"#C2547A" },
  "Végétarien":           { icon:"🥗",  color:"#3D9E6A" },
  "Vegan":                { icon:"🌱",  color:"#3D9E6A" },
  "Autre":                { icon:"📍",  color:"#6b7280" },
  "Boulangerie":          { icon:"🥐",  color:"#FFB74D" },
  "Boîte / Dansant":      { icon:"💃",  color:"#9575CD" },
  "Boite / Dansant":      { icon:"💃",  color:"#9575CD" },
};

/**
 * Génère une couleur HSL déterministe à partir d'une chaîne.
 * Utilisé comme fallback pour les catégories absentes du registre.
 * Garantit que la même catégorie aura toujours la même couleur.
 * @param {string} str
 * @returns {string} Couleur HSL
 */
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffff;
  return `hsl(${h % 360},45%,45%)`;
}

/**
 * Résout l'icône et la couleur d'une catégorie.
 * Algorithme de résolution par priorité décroissante :
 *   1. Correspondance exacte (casse originale)
 *   2. Correspondance exacte insensible à la casse
 *   3. Correspondance partielle (clés longues en priorité)
 *   4. Fallback déterministe (hashColor)
 * @param {string} c - Nom de la catégorie
 * @returns {{ icon: string, color: string }}
 */
function resolveIcon(c) {
  if (!c) return { icon:"📍", color:"#6b7280" };
  if (CATEGORY_CONFIG[c]) return CATEGORY_CONFIG[c];
  const lower = c.toLowerCase().trim();
  const exactCI = Object.keys(CATEGORY_CONFIG).find(k => k.toLowerCase() === lower);
  if (exactCI) return CATEGORY_CONFIG[exactCI];
  const keys = Object.keys(CATEGORY_CONFIG).sort((a, b) => b.length - a.length);
  const partial = keys.find(k => {
    const kl = k.toLowerCase();
    return lower.startsWith(kl) || kl.startsWith(lower);
  });
  if (partial) return CATEGORY_CONFIG[partial];
  return { icon:"📍", color:hashColor(c) };
}

// Raccourcis utilitaires — utilisés partout dans les composants
const cc = c => resolveIcon(c).color; // couleur d'une catégorie
const ci = c => resolveIcon(c).icon;  // icône d'une catégorie


// ─────────────────────────────────────────────────────────────────
//  PARSING HELPERS
//  Fonctions centralisées pour parser/sérialiser les données.
//  Réutilisées dans normalizePlace, useEditableModal, App.handleUpdate.
// ─────────────────────────────────────────────────────────────────

/**
 * Convertit une valeur CSV (string ou tableau) en tableau propre.
 * @param {string|string[]|null|undefined} val
 * @returns {string[]}
 */
function parseCSV(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
  return String(val).split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Convertit un champ source_list en tableau de catégories.
 * Supprime les suffixes ".csv" hérités d'anciens imports.
 * Retourne ["Autre"] si le champ est vide.
 * @param {string} raw
 * @returns {string[]}
 */
function parseCategoryList(raw) {
  const items = parseCSV(raw)
    .map(s => s.replace(/\.csv$/i, "").trim())
    .filter(Boolean);
  return items.length ? items : ["Autre"];
}

/**
 * Sérialise un tableau en string CSV pour l'envoi au backend GAS.
 * @param {string[]} arr
 * @returns {string}
 */
function serializeCSV(arr) {
  return (Array.isArray(arr) ? arr : []).join(", ");
}

/**
 * Normalise un objet brut reçu de l'API vers le format interne de l'app.
 * C'est le point central de transformation des données API → état local.
 *
 * Champs d'entrée (noms GAS) :
 *   name, address, maps_url, source_list, category, budget, note, rating,
 *   event_type, type_evenement, type_event, recommended, recommande_par,
 *   recommande, personne_recommandee, status, statut, teste, tags, notes,
 *   commentaire, lat, lng
 *
 * Champs de sortie (format interne) :
 *   id, nom, adresse, maps_url, categorie, categories[], source_list,
 *   budget, note, type_evenement[], recommandes_par[], recommande_par,
 *   status, tags[], commentaire, coordonnees: { lat, lng }
 *
 * @param {object} raw   - Objet brut de l'API
 * @param {number} idx   - Index pour générer un id de fallback
 * @returns {object}     - Objet normalisé
 */
function normalizePlace(raw, idx) {
  // Catégories : priorité à source_list, fallback sur category
  const sourceListRaw = (raw.source_list ?? raw.category ?? "").trim();
  const categories    = parseCategoryList(sourceListRaw);
  const categorie     = categories[0];

  const tags           = parseCSV(raw.tags ?? "");
  const type_evenement = parseCSV(raw.event_type ?? raw.type_evenement ?? raw.type_event ?? "");

  // Normalisation du statut
  let status = raw.status ?? raw.statut ?? "";
  if (status === "🤔 A tester") status = "🤔 À tester"; // corrige faute historique GAS
  if (!STATUS_OPTIONS.includes(status)) {
    status = (raw.teste === true || raw.teste === "true") ? "✅ Validé" : "🤔 À tester";
  }

  const recommandes_par = parseCSV(
    raw.recommended ?? raw.recommande_par ?? raw.recommande ?? raw.personne_recommandee ?? ""
  );

  return {
    id: raw.id
      ? String(raw.id)
      : `api_${idx}_${(raw.name ?? "").replace(/\s+/g, "_").toLowerCase()}`,
    nom:            raw.name        ?? "Sans nom",
    adresse:        raw.address     ?? raw.adresse ?? "",
    maps_url:       raw.maps_url    ?? null,
    categorie,
    categories,
    source_list:    sourceListRaw,
    budget:         raw.budget      ?? "",
    note:           parseFloat(raw.note ?? raw.rating ?? 0) || 0,
    type_evenement,
    recommandes_par,
    recommande_par: recommandes_par.join(", "),
    status,
    tags,
    commentaire:    raw.notes       ?? raw.commentaire ?? "",
    timestamp:      raw.timestamp ?? raw.TIMESTAMP ?? null,
    coordonnees: {
      lat: parseFloat(raw.lat),
      lng: parseFloat(raw.lng),
    },
  };
}


// ─────────────────────────────────────────────────────────────────
//  HOOK : useData  (Sprint 1 — Performance)
//
//  Stratégie : prefetch + cache stale-while-revalidate + chargement progressif
//
//  Pas de cache → affiche 200 adresses dès la réponse GAS, le reste en fond
//  Cache chaud  → affiche instantanément, rafraîchit silencieusement en fond
// ─────────────────────────────────────────────────────────────────

const FIRST_BATCH = 200;

function useData() {
  const [addresses,  setAddresses]  = useState(() => {
    const c = getCachedData();
    return c ? c.map(normalizePlace) : [];
  });
  const [loading,    setLoading]    = useState(() => !getCachedData());
  const [error,      setError]      = useState(null);
  const [source,     setSource]     = useState(() => getCachedData() ? "cache" : null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    clearAddressCache();
    setLoading(true);
    setError(null);
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!API_URL || !API_KEY) {
        if (!getCachedData()) {
          setAddresses(MOCK_ADDRESSES);
          setSource("fallback");
          setError("Configuration manquante (.env)");
          setLoading(false);
        }
        return;
      }
      try {
        const fetchPromise = refreshKey === 0 && _prefetchPromise
          ? _prefetchPromise
          : fetch(API_URL, {
              method:  "POST",
              headers: { "Content-Type": "text/plain" },
              body:    JSON.stringify({ action:"GET_ALL","x-api-key":API_KEY, limit:5000 }),
              redirect:"follow",
            }).catch(() => null);

        const res = await Promise.race([
          fetchPromise,
          new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout (10s)")), 10000)),
        ]);
        if (!res || !res.ok) throw new Error(res ? `HTTP ${res.status}` : "Pas de réponse");
        const json = await res.json();
        if (cancelled) return;

        const raw = Array.isArray(json) ? json
          : ((json?.ok || json?.success) && Array.isArray(json.data)) ? json.data
          : null;
        if (!raw) throw new Error("Format de réponse inattendu");

        const seen = new Set();
        const deduped = raw.filter(r => {
          const key = (r.name ?? "").trim().toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key); return true;
        });

        // Sprint 1.2 — chargement progressif : premier batch immédiat
        const first = deduped.slice(0, FIRST_BATCH).map(normalizePlace);
        if (!cancelled) { setAddresses(first); setSource("api"); setLoading(false); }
        setCachedData(deduped);
        if (deduped.length > FIRST_BATCH) {
          setTimeout(() => { if (!cancelled) setAddresses(deduped.map(normalizePlace)); }, 0);
        }
      } catch (fetchErr) {
        if (cancelled) return;
        if (getCachedData()) {
          console.warn("[useData] Refresh échoué, cache conservé :", fetchErr.message);
          setSource("cache");
        } else {
          setAddresses(MOCK_ADDRESSES);
          setSource("fallback");
          setError(fetchErr.message);
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return { addresses, loading, error, source, refresh };
}

/**
 * Ordre de tri des budgets du moins cher au plus cher.
 * Utilisé dans le tri et les filtres de l'app.
 */
const BUDGET_ORDER = ["Gratuit","€","€€","€€€","€€€€"];


// ─────────────────────────────────────────────────────────────────
//  HOOK : useToast
//  Affiche un message de feedback (succès / erreur) pendant 3s.
//  Auto-dismiss avec nettoyage du timer.
//
//  ⚠️  CORRECTION BUG 2 : timerRef était un objet littéral ({ current: null })
//      recréé à chaque render. Le clearTimeout ne fonctionnait donc jamais.
//      Remplacé par useRef() pour garantir une référence persistante.
// ─────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null);

  /**
   * useRef garantit que timerRef.current pointe toujours vers le même objet
   * entre les renders — contrairement à un objet littéral qui serait recréé
   * à chaque render et dont .current vaudrait toujours null.
   */
  const timerRef = useRef(null);

  const show = useCallback((msg, type = "success") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, type });
    timerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const hide = useCallback(() => setToast(null), []);

  return { toast, show, hide };
}

/** Composant Toast — bulle de feedback fixée en bas de l'écran. Auto-dismiss géré par useToast. */
function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div style={{
      position:"fixed", bottom:88, left:"50%", transform:"translateX(-50%)",
      zIndex:1100, pointerEvents:"none",
      padding:"10px 20px", borderRadius:99,
      background: isError ? "var(--sn-fg)" : "#2a7a4b",
      color:"#fff", fontSize:13, fontWeight:600,
      boxShadow:"0 4px 16px rgba(0,0,0,.25)",
      animation:"fadeIn .2s ease",
      whiteSpace:"nowrap", maxWidth:"90vw", textAlign:"center",
    }}>
      {isError ? "⚠ " : "✓ "}{toast.msg}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────
//  HOOK : useEditableModal
//  Gère l'état complet du cycle édition/sauvegarde/suppression d'une fiche.
//
//  Flux sauvegarde (optimistic update) :
//    1. Snapshot des données actuelles pour rollback
//    2. onUpdate(id, data) → mise à jour locale immédiate
//    3. apiPost → persistance GAS
//    4. Succès : setEditing(false), toast succès
//    5. Échec  : onUpdate(id, snapshot) → rollback, toast erreur,
//               édition maintenue (l'utilisateur peut réessayer)
// ─────────────────────────────────────────────────────────────────
function useEditableModal(a, onUpdate, onDelete, onCommentChange, showToast) {
  const [editing,       setEditing]       = useState(false);
  const [draft,         setDraft]         = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Réinitialise tous les états quand l'adresse change
  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setSaving(false);
    setDeleting(false);
    setConfirmDelete(false);
  }, [a?.id]);

  /** Entre en mode édition : copie profonde des données actuelles dans le draft. */
  function startEdit() {
    if (!a) return;
    setDraft({
      budget:      a.budget,
      note:        a.note,
      event_type:  [...(a.type_evenement ?? [])],
      recommended: [...(a.recommandes_par ?? [])],
      status:      a.status,
      tags:        [...(a.tags ?? [])],
      categories:  [...(a.categories ?? [a.categorie])],
      notes:       a.commentaire,
    });
    setEditing(true);
  }

  /** Annule l'édition et efface le draft sans sauvegarder. */
  function cancelEdit() {
    setEditing(false);
    setDraft(null);
  }

  /** Sauvegarde avec optimistic update et rollback en cas d'échec API. */
  async function save() {
    if (!a || !draft) return;
    setSaving(true);

    const snapshot = {
      budget:          a.budget,
      note:            a.note,
      type_evenement:  [...(a.type_evenement ?? [])],
      recommandes_par: [...(a.recommandes_par ?? [])],
      status:          a.status,
      tags:            [...(a.tags ?? [])],
      commentaire:     a.commentaire,
      categories:      [...(a.categories ?? [a.categorie])],
    };

    const data = {
      budget:      draft.budget,
      note:        parseFloat(draft.note) || 0,
      event_type:  serializeCSV(draft.event_type),
      recommended: serializeCSV(draft.recommended),
      status:      draft.status,
      tags:        serializeCSV(draft.tags),
      notes:       draft.notes,
      source_list: serializeCSV(draft.categories),
    };

    onUpdate(a.id, data);
    onCommentChange(a.id, draft.notes ?? "");

    try {
      const res = await apiPost({ action:"UPDATE", id:a.id, data });
      if (!res.ok) throw new Error(res.error || "Erreur API");
      setEditing(false);
      setDraft(null);
      showToast("Modifications enregistrées");
    } catch(e) {
      onUpdate(a.id, {
        budget:      snapshot.budget,
        note:        snapshot.note,
        event_type:  serializeCSV(snapshot.type_evenement),
        recommended: serializeCSV(snapshot.recommandes_par),
        status:      snapshot.status,
        tags:        serializeCSV(snapshot.tags),
        notes:       snapshot.commentaire,
        source_list: serializeCSV(snapshot.categories),
      });
      onCommentChange(a.id, snapshot.commentaire ?? "");
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  /** Supprime le lieu côté GAS puis localement. Rollback toast si erreur. */
  async function deleteAddr() {
    if (!a) return;
    setDeleting(true);
    try {
      const res = await apiPost({ action:"DELETE", id:a.id });
      if (!res.ok && !res.success) throw new Error(res.error || "Erreur API");
      onDelete(a.id);
      showToast("Lieu supprimé");
    } catch(e) {
      setDeleting(false);
      setConfirmDelete(false);
      showToast(e.message, "error");
    }
  }

  return {
    editing, draft, setDraft, saving, deleting, confirmDelete, setConfirmDelete,
    startEdit, cancelEdit, save, deleteAddr,
  };
}


// ─────────────────────────────────────────────────────────────────
//  API WRITE — POST vers Google Apps Script
//
//  ⚠️  CORRECTION POINT 1 — Content-Type adaptatif
//
//  Contexte CORS avec GAS :
//    - "text/plain"       → requête "simple" → pas de preflight CORS → fonctionne
//    - "application/json" → requête "complexe" → preflight OPTIONS obligatoire
//
//  Si Google change sa politique et que text/plain cesse de fonctionner,
//  apiPost détecte l'échec et bascule automatiquement vers application/json.
//  Le type gagnant est mémorisé pour toute la session (évite la double latence).
// ─────────────────────────────────────────────────────────────────

/** Type Content-Type mémorisé pour la session. Réinitialisé au rechargement. */
let _workingContentType = "text/plain";

/**
 * Envoie un POST vers le Google Apps Script.
 * Tentative 1 : type mémorisé (text/plain par défaut).
 * Tentative 2 : application/json si la tentative 1 échoue.
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function apiPost(payload) {
  const body = JSON.stringify({ ...payload, "x-api-key": API_KEY });

  async function attempt(contentType) {
    const res = await fetch(API_URL, {
      method:   "POST",
      headers:  { "Content-Type": contentType },
      body,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  try {
    return await attempt(_workingContentType);
  } catch (firstError) {
    if (_workingContentType === "application/json") throw firstError;
    console.warn("[apiPost] text/plain a échoué, tentative avec application/json…", firstError.message);
    try {
      const result = await attempt("application/json");
      _workingContentType = "application/json";
      console.info("[apiPost] Basculement permanent vers application/json pour cette session.");
      return result;
    } catch (secondError) {
      throw new Error(
        `apiPost échoué avec les deux Content-Types.\n` +
        `  text/plain      : ${firstError.message}\n` +
        `  application/json: ${secondError.message}`
      );
    }
  }
}

/**
 * Construit l'URL Google Maps pour un lieu.
 * Priorité : maps_url pré-calculé > adresse textuelle > coordonnées GPS.
 */
function getMapsUrl(address) {
  if (address.maps_url) return address.maps_url;
  const { lat, lng } = address.coordonnees;
  const q = address.adresse ? encodeURIComponent(address.adresse) : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}&center=${lat},${lng}`;
}


// ─────────────────────────────────────────────────────────────────
//  REDUCER — État des filtres
//  INIT : état initial de tous les filtres (également utilisé par RESET)
//  reducer : SET (valeur simple), TOGGLE (valeur dans tableau), RESET
// ─────────────────────────────────────────────────────────────────
const INIT = {
  search:     "",   // texte libre (nom, tag)
  cats:       [],   // catégories sélectionnées (multi)
  budgets:    [],   // budgets sélectionnés (multi)
  noteMin:    0,    // note minimum (slider 0–5)
  event:      "",   // type d'événement (select unique)
  person:     "",   // personne qui recommande (select unique)
  statuses:   [],   // statuts sélectionnés (multi)
  tags:       [],   // tags sélectionnés (multi, ET logique)
  radiusKm:   0,    // Sprint 2 — rayon en km (0 = désactivé)
  cityFilter: "",   // Sprint 2 — filtre ville / arrondissement (texte)
};

function reducer(s, a) {
  switch (a.t) {
    case "SET":    return { ...s, [a.k]: a.v };
    case "TOGGLE": {
      const arr = s[a.k];
      return { ...s, [a.k]: arr.includes(a.v) ? arr.filter(x => x !== a.v) : [...arr, a.v] };
    }
    case "RESET":  return { ...INIT };
    default:       return s;
  }
}


// ─────────────────────────────────────────────────────────────────
//  TOKENS TYPOGRAPHIQUES & STYLES PARTAGÉS
//  Déclarés avant FilterBar et les modals qui les utilisent.
// ─────────────────────────────────────────────────────────────────

/** Label de section (texte uppercase, taille médium). */
const Label      = ({ children }) => <div style={{fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--faintest)", marginBottom:5}}>{children}</div>;
/** Label de champ de formulaire (texte uppercase, taille petite). */
const FieldLabel = ({ children }) => <div style={{fontSize:9,  fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--faintest)", marginBottom:6}}>{children}</div>;

// Styles partagés pour les inputs de la FilterBar
const inputStyle  = { width:"100%", padding:"8px 10px 8px 28px", borderRadius:9, fontSize:12, background:"var(--input-bg)", color:"var(--ink)", border:"1.5px solid var(--border2)", outline:"none", fontFamily:"inherit" };
const selectStyle = { width:"100%", padding:"8px 10px",          borderRadius:9, fontSize:12, background:"var(--input-bg)", color:"var(--ink2)", border:"1.5px solid var(--border2)", outline:"none", cursor:"pointer", fontFamily:"inherit" };
// Style partagé pour les inputs de formulaire dans Modal et CreateModal
const fieldStyle  = { width:"100%", padding:"9px 11px", borderRadius:9, fontSize:13, background:"var(--input-bg)", color:"var(--ink)", border:"1.5px solid var(--border2)", outline:"none", fontFamily:"inherit", WebkitAppearance:"none" };


// ─────────────────────────────────────────────────────────────────
//  COMPOSANT : Stars
//  Affiche une note sur 5 avec des étoiles partielles colorées.
//  Utilise overflow:hidden + width% pour les fractions.
// ─────────────────────────────────────────────────────────────────
function Stars({ n }) {
  if (!n) return <span style={{fontSize:11, color:"var(--faintest)"}}>—</span>;
  return (
    <span style={{display:"inline-flex", gap:1, alignItems:"center"}}>
      {[1,2,3,4,5].map(i => {
        const fill = Math.min(1, Math.max(0, n - (i - 1)));
        return (
          <span key={i} style={{position:"relative", width:12, height:12, display:"inline-block"}}>
            <span style={{color:"var(--star-empty)", fontSize:12, lineHeight:1, position:"absolute"}}>★</span>
            <span style={{position:"absolute", top:0, left:0, overflow:"hidden", width:`${fill * 100}%`, color:"#E8A020", fontSize:12, lineHeight:1}}>★</span>
          </span>
        );
      })}
      <span style={{fontSize:11, color:"var(--faint)", marginLeft:3, fontVariantNumeric:"tabular-nums"}}>{n.toFixed(1)}</span>
    </span>
  );
}

/** Pill de filtre cliquable. Active = fond coloré + ombre de couleur. */
function FilterPill({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:"inline-flex", alignItems:"center", whiteSpace:"nowrap",
      padding:"7px 14px", borderRadius:99, fontSize:12, fontWeight:600,
      border:"none", cursor:"pointer", transition:"all .15s", flexShrink:0,
      background: active ? (color || "var(--navy)") : "var(--pill-idle)",
      color:       active ? "#fff"                    : "var(--pill-text)",
      boxShadow:   active ? `0 2px 10px ${(color || "var(--navy)")}40` : "none",
    }}>{label}</button>
  );
}

/**
 * Badge de statut coloré.
 * Utilise les tokens CSS de thème (--sv-*, --st-*, --sn-*, --sm-*)
 * pour basculer automatiquement entre mode clair et sombre.
 */
function StatusBadge({ status, small = false }) {
  const vars = {
    "✅ Validé":   ["var(--sv-bg)", "var(--sv-fg)", "var(--sv-br)"],
    "🤔 À tester": ["var(--st-bg)", "var(--st-fg)", "var(--st-br)"],
    "❌ Nope":     ["var(--sn-bg)", "var(--sn-fg)", "var(--sn-br)"],
    "🫤 Meh":      ["var(--sm-bg)", "var(--sm-fg)", "var(--sm-br)"],
  };
  const [bg, fg, br] = vars[status] ?? ["var(--sm-bg)", "var(--sm-fg)", "var(--sm-br)"];
  return (
    <span style={{
      fontSize: small ? 9 : 11, fontWeight:700,
      padding:  small ? "2px 7px" : "3px 10px",
      borderRadius:99, background:bg, color:fg,
      border:`1px solid ${br}`, whiteSpace:"nowrap",
    }}>{status || "—"}</span>
  );
}

/** Bouton cycle discret : light → dark → system → light → … */
function ThemeToggle({ theme, setTheme }) {
  const CYCLE = ["light", "dark", "system"];
  const ICONS = { light:"☀️", dark:"🌙", system:"💻" };
  const [pressed, setPressed] = useState(false);
  const next = () => setTheme(CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length]);
  return (
    <button onClick={next} title="Changer de thème"
      onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)} onTouchStart={() => setPressed(true)} onTouchEnd={() => setPressed(false)}
      style={{width:28, height:28, borderRadius:"50%", border:"1px solid var(--border)", background:pressed ? "var(--border)" : "var(--surface2)", cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, transition:"background .12s", WebkitTapHighlightColor:"transparent"}}
    >{ICONS[theme]}</button>
  );
}

/**
 * Bouton de lien Google Maps.
 * compact=true → cercle icône seule (cartes). compact=false → bouton complet (modal).
 */
function MapsButton({ address, compact = false }) {
  const url = getMapsUrl(address);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      style={{display:"inline-flex", alignItems:"center", justifyContent:"center", gap:compact?0:6, padding:compact?"8px":"9px 14px", borderRadius:compact?"50%":10, background:"var(--surface)", border:"1.5px solid var(--border)", color:"var(--ink)", textDecoration:"none", fontSize:12, fontWeight:700, cursor:"pointer", transition:"all .15s", flexShrink:0, letterSpacing:"0.02em"}}
      onMouseEnter={e => { e.currentTarget.style.background="var(--ink)"; e.currentTarget.style.color="var(--bg)"; e.currentTarget.style.borderColor="var(--ink)"; }}
      onMouseLeave={e => { e.currentTarget.style.background="var(--surface)"; e.currentTarget.style.color="var(--ink)"; e.currentTarget.style.borderColor="var(--border)"; }}
    >
      <span style={{fontSize:compact?16:14}}>📍</span>
      {!compact && <span>Maps</span>}
    </a>
  );
}


// ─────────────────────────────────────────────────────────────────
//  COMPOSANT : FilterBar
//  Barre de filtres sticky en haut de page.
//  Contient : titre, compteur, pills catégories,
//             panneau de filtres avancés (budget, note, statut, etc.)
// ─────────────────────────────────────────────────────────────────
function FilterBar({ f, dispatch, count, allCats, allBudgets, allEvents, allPersons, allTags, theme, setTheme, position, geoLoading, geoError, onGeoRequest }) {
  const [open, setOpen] = useState(false);

  const activeCount = [
    f.cats.length, f.budgets.length,
    f.noteMin > 0   ? 1 : 0,
    f.event         ? 1 : 0,
    f.person        ? 1 : 0,
    f.statuses.length,
    f.tags.length,
    f.radiusKm > 0  ? 1 : 0,  // Sprint 2
    f.cityFilter    ? 1 : 0,  // Sprint 2
  ].reduce((a, b) => a + b, 0);

  return (
    <div style={{background:"var(--surface)", borderBottom:"1px solid var(--border)", position:"sticky", top:0, zIndex:100}}>
      <div style={{padding:"14px 16px 0", maxWidth:900, margin:"0 auto"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
          <h1 style={{margin:0, fontSize:20, fontFamily:"'Playfair Display',Georgia,serif", fontWeight:700, color:"var(--ink)", letterSpacing:"-0.02em"}}>
            Mes Adresses
          </h1>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <span style={{fontSize:11, color:"var(--faint)", fontWeight:500}}>{count} lieu{count!==1?"x":""}</span>
            <button onClick={() => setOpen(v => !v)} style={{display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:99, fontSize:12, fontWeight:700, cursor:"pointer", border:"none", transition:"all .15s", background:activeCount>0?"var(--navy)":"var(--pill-idle)", color:activeCount>0?"var(--bg)":"var(--ink2)"}}>
              <span>{open?"✕":"⚙"}</span> Filtres
              {activeCount > 0 && !open && (
                <span style={{background:"var(--gold)", color:"#fff", borderRadius:99, fontSize:9, fontWeight:800, padding:"1px 5px", marginLeft:2}}>{activeCount}</span>
              )}
            </button>
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>

        {/* Pills de catégories — défilement horizontal sur mobile */}
        <div style={{display:"flex", gap:7, overflowX:"auto", paddingBottom:12, scrollbarWidth:"none", WebkitOverflowScrolling:"touch"}}>
          <FilterPill label="Tous" active={f.cats.length===0} onClick={() => dispatch({t:"SET",k:"cats",v:[]})} />
          {allCats.map(c => (
            <FilterPill key={c} label={`${ci(c)} ${c}`} active={f.cats.includes(c)} color={cc(c)} onClick={() => dispatch({t:"TOGGLE",k:"cats",v:c})} />
          ))}
        </div>
      </div>

      {/* Panneau de filtres avancés — dépliable */}
      {open && (
        <div style={{borderTop:"1px solid var(--border)", padding:"16px 16px 18px", background:"var(--surface2)", maxWidth:900, margin:"0 auto", animation:"slideDown .18s ease"}}>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:14}}>
            <div>
              <Label>Recherche</Label>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:12, opacity:.4}}>🔍</span>
                <input placeholder="Nom, tag…" value={f.search} onChange={e => dispatch({t:"SET",k:"search",v:e.target.value})} style={inputStyle} />
              </div>
            </div>
            {allBudgets.length > 0 && (
              <div>
                <Label>Budget</Label>
                <div style={{display:"flex", gap:5, flexWrap:"wrap"}}>
                  {allBudgets.map(b => (
                    <button key={b} onClick={() => dispatch({t:"TOGGLE",k:"budgets",v:b})} style={{padding:"5px 11px", borderRadius:99, fontSize:11, fontWeight:700, cursor:"pointer", border:"1.5px solid", background:f.budgets.includes(b)?"var(--navy)":"transparent", color:f.budgets.includes(b)?"var(--bg)":"var(--muted)", borderColor:f.budgets.includes(b)?"var(--navy)":"var(--border)"}}>{b}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Note min {f.noteMin > 0 ? `— ≥ ${f.noteMin}★` : ""}</Label>
              <input type="range" min={0} max={5} step={0.5} value={f.noteMin} onChange={e => dispatch({t:"SET",k:"noteMin",v:+e.target.value})} style={{width:"100%", accentColor:"#E8A020", cursor:"pointer", marginTop:4}} />
            </div>
            <div>
              <Label>Statut</Label>
              <div style={{display:"flex", gap:5, flexWrap:"wrap"}}>
                {STATUS_OPTIONS.map(s => (
                  <button key={s} onClick={() => dispatch({t:"TOGGLE",k:"statuses",v:s})} style={{padding:"5px 10px", borderRadius:99, fontSize:11, fontWeight:600, cursor:"pointer", border:"1.5px solid", background:f.statuses.includes(s)?"var(--navy)":"transparent", color:f.statuses.includes(s)?"var(--bg)":"var(--muted)", borderColor:f.statuses.includes(s)?"var(--navy)":"var(--border)"}}>{s}</button>
                ))}
              </div>
            </div>
            {allEvents.length > 0 && (
              <div>
                <Label>Type d'événement</Label>
                <select value={f.event} onChange={e => dispatch({t:"SET",k:"event",v:e.target.value})} style={selectStyle}>
                  <option value="">Tous</option>
                  {allEvents.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            )}
            {allPersons.length > 0 && (
              <div>
                <Label>Recommandé par</Label>
                <select value={f.person} onChange={e => dispatch({t:"SET",k:"person",v:e.target.value})} style={selectStyle}>
                  <option value="">Toutes les personnes</option>
                  {allPersons.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
          </div>
          {/* Tags — logique ET (le lieu doit avoir TOUS les tags sélectionnés) */}
          {allTags.length > 0 && (
            <div style={{marginTop:14}}>
              <Label>Tags</Label>
              <div style={{display:"flex", flexWrap:"wrap", gap:5, marginTop:4}}>
                {allTags.map(t => (
                  <button key={t} onClick={() => dispatch({t:"TOGGLE",k:"tags",v:t})} style={{padding:"4px 10px", borderRadius:99, fontSize:10, fontWeight:500, cursor:"pointer", border:"1.5px solid", background:f.tags.includes(t)?"var(--navy)":"transparent", color:f.tags.includes(t)?"var(--bg)":"var(--muted)", borderColor:f.tags.includes(t)?"var(--navy)":"var(--border)"}}>{t}</button>
                ))}
              </div>
            </div>
          )}
          {/* Sprint 2 — Géolocalisation + filtre par rayon */}
          <div style={{marginTop:14, display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-start"}}>
            {/* Bouton de géolocalisation */}
            <div style={{flex:"1 1 180px"}}>
              <Label>Position actuelle</Label>
              <button
                onClick={onGeoRequest}
                disabled={geoLoading}
                style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"8px 14px", borderRadius:9, fontSize:12, fontWeight:600,
                  border:"1.5px solid var(--border)", cursor:"pointer",
                  background: position ? "var(--navy)" : "var(--surface)",
                  color:      position ? "var(--bg)"   : "var(--ink2)",
                  width:"100%", justifyContent:"center",
                }}
              >
                {geoLoading ? "..." : position ? "📍 Position active" : "📍 Me localiser"}
              </button>
              {geoError && <span style={{fontSize:10, color:"var(--sn-fg)", marginTop:3, display:"block"}}>{geoError}</span>}
              {position && (
                <button onClick={() => dispatch({t:"SET",k:"radiusKm",v:0})} style={{marginTop:4, fontSize:10, color:"var(--faint)", background:"none", border:"none", cursor:"pointer", padding:0}}>
                  Effacer la position
                </button>
              )}
            </div>

            {/* Filtre par rayon — affiché seulement si position disponible */}
            {position && (
              <div style={{flex:"1 1 180px"}}>
                <Label>Rayon {f.radiusKm > 0 ? `— ≤ ${f.radiusKm} km` : "— désactivé"}</Label>
                <div style={{display:"flex", gap:5, flexWrap:"wrap", marginTop:4}}>
                  {[0, 0.5, 1, 2, 5, 10].map(r => (
                    <button key={r} onClick={() => dispatch({t:"SET",k:"radiusKm",v:r})} style={{
                      padding:"5px 10px", borderRadius:99, fontSize:11, fontWeight:600, cursor:"pointer",
                      border:"1.5px solid",
                      background:  f.radiusKm === r ? "var(--navy)"  : "transparent",
                      color:       f.radiusKm === r ? "var(--bg)"    : "var(--muted)",
                      borderColor: f.radiusKm === r ? "var(--navy)"  : "var(--border)",
                    }}>{r === 0 ? "Tous" : `${r} km`}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sprint 2 — Filtre par ville / arrondissement */}
          <div style={{marginTop:14}}>
            <Label>Ville ou arrondissement</Label>
            <input
              placeholder="ex: 75011, Montmartre, Lyon…"
              value={f.cityFilter}
              onChange={e => dispatch({t:"SET",k:"cityFilter",v:e.target.value})}
              style={{...inputStyle, paddingLeft:10}}
            />
          </div>

          {activeCount > 0 && (
            <button onClick={() => dispatch({t:"RESET"})} style={{marginTop:14, padding:"8px 18px", borderRadius:99, fontSize:11, fontWeight:700, background:"var(--pill-idle)", color:"var(--ink2)", border:"none", cursor:"pointer"}}>
              ↺ Réinitialiser tous les filtres
            </button>
          )}
        </div>
      )}

      <ActiveChips f={f} dispatch={dispatch} />
    </div>
  );
}

/** Chips des filtres actifs (sauf catégories). Chaque chip retire le filtre au clic. */
function ActiveChips({ f, dispatch }) {
  const chips = [
    ...f.budgets.map(b  => ({ l:b,              fn:() => dispatch({t:"TOGGLE",k:"budgets",  v:b   }) })),
    ...(f.noteMin > 0    ? [{ l:`≥${f.noteMin}★`, fn:() => dispatch({t:"SET",   k:"noteMin",  v:0   }) }] : []),
    ...(f.event          ? [{ l:f.event,          fn:() => dispatch({t:"SET",   k:"event",    v:""  }) }] : []),
    ...(f.person         ? [{ l:f.person,         fn:() => dispatch({t:"SET",   k:"person",   v:""  }) }] : []),
    ...f.statuses.map(s => ({ l:s,               fn:() => dispatch({t:"TOGGLE",k:"statuses",  v:s   }) })),
    ...f.tags.map(t     => ({ l:t,               fn:() => dispatch({t:"TOGGLE",k:"tags",      v:t   }) })),
    ...(f.radiusKm > 0   ? [{ l:`≤${f.radiusKm} km`, fn:() => dispatch({t:"SET",k:"radiusKm",v:0 }) }] : []),
    ...(f.cityFilter     ? [{ l:f.cityFilter,    fn:() => dispatch({t:"SET",   k:"cityFilter",v:""  }) }] : []),
    ...(f.search         ? [{ l:`"${f.search}"`, fn:() => dispatch({t:"SET",   k:"search",  v:"" }) }] : []),
  ];
  if (!chips.length) return null;
  return (
    <div style={{borderTop:"1px solid var(--border)"}}>
      <div style={{display:"flex", gap:6, overflowX:"auto", padding:"8px 16px", scrollbarWidth:"none", WebkitOverflowScrolling:"touch", maxWidth:900, margin:"0 auto"}}>
        {chips.map((c, i) => (
          <button key={i} onClick={c.fn} style={{display:"inline-flex", alignItems:"center", gap:4, flexShrink:0, padding:"4px 10px", borderRadius:99, fontSize:11, fontWeight:500, background:"var(--chip-bg)", color:"var(--chip-color)", border:"1px solid var(--chip-border)", cursor:"pointer"}}>
            {c.l} <span style={{fontSize:9, opacity:.6}}>✕</span>
          </button>
        ))}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────
//  COMPOSANT : AddressCard
//  Carte d'un lieu dans la grille principale.
//  Hover : élévation + bordure colorée.
//  Affiche : nom, adresse, note, catégories, tags, commentaire tronqué,
//            recommandations, bouton Maps, lien "Voir la fiche".
// ─────────────────────────────────────────────────────────────────
function AddressCard({ a, onOpen, idx, comment, userPosition }) {
  const col = cc(a.categorie);
  const [hov, setHov] = useState(false);
  const hasComment = comment && comment.trim().length > 0;

  // Sprint 2 — distance par rapport à la position de l'utilisateur
  const distance = userPosition && !isNaN(a.coordonnees?.lat) && !isNaN(a.coordonnees?.lng)
    ? haversine(userPosition.lat, userPosition.lng, a.coordonnees.lat, a.coordonnees.lng)
    : null;

  return (
    <article
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{background:"var(--surface)", borderRadius:16, overflow:"hidden", border:`1px solid ${hov?col+"55":"var(--border)"}`, boxShadow:hov?`0 8px 32px ${col}15, 0 2px 8px rgba(0,0,0,.05)`:"0 1px 3px rgba(0,0,0,.04)", transform:hov?"translateY(-2px)":"none", transition:"all .18s cubic-bezier(.4,0,.2,1)", display:"flex", flexDirection:"column", animation:"cardIn .3s ease both", animationDelay:`${Math.min(idx,15)*0.04}s`}}
    >
      <div style={{height:4, background:`linear-gradient(90deg,${col},${col}99)`, flexShrink:0}} />
      <div onClick={() => onOpen(a)} style={{padding:"14px 16px 12px", flex:1, cursor:"pointer"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:9}}>
          <div style={{flex:1, paddingRight:8}}>
            <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:2}}>
              <span style={{fontSize:15}}>{ci(a.categorie)}</span>
              <h3 style={{margin:0, fontSize:14, fontFamily:"'Playfair Display',Georgia,serif", fontWeight:700, color:"var(--ink)", letterSpacing:"-0.01em", lineHeight:1.2}}>{a.nom}</h3>
            </div>
            <p style={{margin:0, fontSize:10, color:"var(--faint)", lineHeight:1.4, marginLeft:21}}>{a.adresse}</p>
          </div>
          <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0}}>
            {a.budget && <span style={{fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99, background:`${col}15`, color:col, border:`1px solid ${col}25`}}>{a.budget}</span>}
            {/* Sprint 2 — badge distance si position disponible */}
            {distance !== null && (
              <span style={{fontSize:10, fontWeight:600, padding:"2px 7px", borderRadius:99, background:"var(--surface2)", color:"var(--muted)", border:"1px solid var(--border)"}}>
                {formatDistance(distance)}
              </span>
            )}
            <StatusBadge status={a.status} small />
          </div>
        </div>
        <div style={{marginBottom:9}}><Stars n={a.note} /></div>
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:9}}>
          {(a.categories??[a.categorie]).slice(0,2).map(cat => (
            <span key={cat} style={{fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:99, background:`${cc(cat)}15`, color:cc(cat), border:`1px solid ${cc(cat)}30`}}>{ci(cat)} {cat}</span>
          ))}
          {(a.categories??[]).length > 2 && <span style={{fontSize:10, color:"var(--faintest)"}}>+{a.categories.length-2}</span>}
          {a.tags.slice(0,2).map(t => (
            <span key={t} style={{fontSize:10, padding:"2px 8px", borderRadius:99, background:"var(--surface2)", color:"var(--faint)", border:"1px solid var(--border)"}}>{t}</span>
          ))}
          {a.tags.length > 2 && <span style={{fontSize:10, color:"var(--faintest)"}}>+{a.tags.length-2}</span>}
        </div>
        {a.recommandes_par?.length > 0 && (
          <p style={{margin:0, fontSize:10, color:"var(--faintest)"}}>Via <span style={{color:"var(--muted)", fontWeight:500}}>{a.recommandes_par.join(", ")}</span></p>
        )}
        {hasComment && (
          <p style={{margin:"8px 0 0", fontSize:11, color:"var(--faint)", lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>{comment}</p>
        )}
      </div>
      <div style={{padding:"10px 14px 13px", borderTop:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8}}>
        <MapsButton address={a} />
        <button onClick={() => onOpen(a)} style={{display:"flex", alignItems:"center", gap:5, padding:"8px 12px", borderRadius:10, fontSize:11, fontWeight:600, cursor:"pointer", background:"var(--surface2)", color:"var(--muted)", border:"none", flex:1, justifyContent:"center", transition:"all .14s"}}
          onMouseEnter={e => { e.currentTarget.style.background=col+"15"; e.currentTarget.style.color=col; }}
          onMouseLeave={e => { e.currentTarget.style.background="var(--surface2)"; e.currentTarget.style.color="var(--muted)"; }}
        >Voir la fiche →</button>
      </div>
    </article>
  );
}


// ─────────────────────────────────────────────────────────────────
//  UTILITAIRE MOBILE : scrollFieldIntoView
//  Fait défiler le champ focusé au centre de l'écran.
//  Évite qu'il soit masqué par le clavier virtuel sur mobile.
//  Délai de 120ms pour laisser le clavier s'ouvrir avant le scroll.
//  Déclaré avant TagInput et les formulaires qui l'utilisent.
// ─────────────────────────────────────────────────────────────────
function scrollFieldIntoView(e) {
  const el = e.currentTarget ?? e.target;
  if (!el) return;
  setTimeout(() => el.scrollIntoView({ behavior:"smooth", block:"center" }), 120);
}


// ─────────────────────────────────────────────────────────────────
//  COMPOSANT : TagInput
//  Combobox multi-valeurs réutilisable.
//  Validation : Entrée ou virgule pour confirmer.
//  Suppression : bouton × sur chaque chip, Backspace si input vide.
//
//  Props :
//    values       — tableau de valeurs sélectionnées
//    onChange     — (newValues[]) => void
//    suggestions  — options proposées dans le dropdown
//    placeholder  — texte affiché quand vide
//    accentColor  — couleur accent (var CSS ou hex)
//    showIcons    — affiche l'emoji catégorie dans les chips + dropdown
// ─────────────────────────────────────────────────────────────────
function TagInput({ values = [], onChange, suggestions = [], placeholder = "Ajouter…", accentColor, showIcons = false }) {
  const [inputVal, setInputVal] = useState("");
  const [open, setOpen]         = useState(false);
  const inputRef                = useRef(null);
  const col = accentColor || "var(--navy)";

  const filtered = suggestions
    .filter(s => s.toLowerCase().includes(inputVal.toLowerCase()) && !values.includes(s))
    .slice(0, 8);

  function add(val) {
    const v = val.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInputVal("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function remove(v) { onChange(values.filter(x => x !== v)); }

  function onKeyDown(e) {
    if ((e.key === "Enter" || e.key === ",") && inputVal.trim()) { e.preventDefault(); add(inputVal); }
    if (e.key === "Backspace" && !inputVal && values.length) remove(values[values.length - 1]);
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div style={{position:"relative"}}>
      <div onClick={() => inputRef.current?.focus()} style={{display:"flex", flexWrap:"wrap", gap:5, padding:"6px 10px", borderRadius:9, background:"var(--input-bg)", border:`1.5px solid ${open?col:"var(--border2)"}`, minHeight:44, cursor:"text", transition:"border-color .15s", alignItems:"center"}}>
        {values.map(v => (
          <span key={v} style={{display:"inline-flex", alignItems:"center", gap:3, padding:"3px 8px", borderRadius:99, background:`${col}18`, color:col, border:`1px solid ${col}30`, fontSize:12, fontWeight:500}}>
            {showIcons && `${ci(v)} `}{v}
            <button onMouseDown={e => { e.preventDefault(); remove(v); }} style={{width:16, height:16, borderRadius:99, border:"none", background:"transparent", color:col, cursor:"pointer", fontSize:12, lineHeight:1, padding:0, display:"flex", alignItems:"center", justifyContent:"center"}}>×</button>
          </span>
        ))}
        <input ref={inputRef} value={inputVal}
          onChange={e => { setInputVal(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          onFocusCapture={scrollFieldIntoView}
          placeholder={values.length ? "" : placeholder}
          style={{border:"none", outline:"none", background:"transparent", fontSize:13, color:"var(--ink)", minWidth:90, flex:1, fontFamily:"inherit", padding:"2px 0"}}
        />
      </div>
      {open && filtered.length > 0 && (
        <div style={{position:"absolute", zIndex:50, left:0, right:0, maxHeight:160, overflowY:"auto", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:9, boxShadow:"0 4px 16px rgba(0,0,0,.12)", marginTop:4}}>
          {filtered.map(s => (
            <button key={s} onMouseDown={e => { e.preventDefault(); add(s); }} style={{display:"block", width:"100%", padding:"10px 14px", textAlign:"left", border:"none", borderBottom:"1px solid var(--border)", background:"transparent", cursor:"pointer", fontSize:13, color:"var(--ink)", fontFamily:"inherit"}}>
              {showIcons ? `${ci(s)} ` : ""}{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────
//  COMPOSANT : CommentZone
//  Zone d'édition de note personnelle inline.
//  Raccourcis : Ctrl+Entrée → sauvegarder, Échap → annuler.
//
//  ⚠️  CORRECTION BUG 4 :
//    onChange est maintenant handleCommentSave (dans Modal) qui appelle apiPost.
//    CommentZone lui-même ne connaît pas l'API — délégation au parent.
// ─────────────────────────────────────────────────────────────────
function CommentZone({ addressId, value, onChange, accentColor }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const col     = accentColor || "var(--navy)";
  const isEmpty = !value || value.trim() === "";

  function handleSave() { onChange(addressId, draft.trim()); setEditing(false); }
  function handleCancel() { setDraft(value); setEditing(false); }
  function handleKey(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
    if (e.key === "Escape") handleCancel();
  }

  return (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
        <FieldLabel>Note personnelle</FieldLabel>
        {!editing && (
          <button onClick={() => { setDraft(value); setEditing(true); }} style={{fontSize:10, fontWeight:600, padding:"3px 10px", borderRadius:99, background:isEmpty?"var(--pill-idle)":`${col}15`, color:isEmpty?"var(--faint)":col, border:"none", cursor:"pointer"}}>
            {isEmpty ? "+ Ajouter" : "✏️ Modifier"}
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={handleKey} autoFocus rows={3} style={{width:"100%", padding:"10px 12px", borderRadius:10, fontSize:12, border:`1.5px solid ${col}`, outline:"none", resize:"vertical", fontFamily:"inherit", lineHeight:1.6, color:"var(--ink)", background:"var(--input-bg)"}} />
          <div style={{display:"flex", justifyContent:"flex-end", gap:7, marginTop:7}}>
            <button onClick={handleCancel} style={{padding:"6px 14px", borderRadius:8, fontSize:11, fontWeight:600, background:"var(--pill-idle)", color:"var(--muted)", border:"none", cursor:"pointer"}}>Annuler</button>
            <button onClick={handleSave} style={{padding:"6px 14px", borderRadius:8, fontSize:11, fontWeight:700, background:col, color:"#fff", border:"none", cursor:"pointer"}}>Sauvegarder</button>
          </div>
          <div style={{fontSize:9, color:"var(--faintest)", marginTop:4, textAlign:"right"}}>Ctrl+Entrée · Échap pour annuler</div>
        </div>
      ) : (
        <div onClick={() => { setDraft(value); setEditing(true); }} style={{borderRadius:10, padding:"11px 13px", borderLeft:`3px solid ${isEmpty?"var(--border2)":col}`, background:"var(--comment-bg)", cursor:"text", minHeight:48, transition:"border-color .15s"}}>
          {isEmpty
            ? <span style={{fontSize:12, color:"var(--faintest)", fontStyle:"italic"}}>Aucune note — clique pour en ajouter…</span>
            : <p style={{margin:0, fontSize:13, lineHeight:1.65, color:"var(--ink)", whiteSpace:"pre-line"}}>{value}</p>
          }
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────
//  COMPOSANT : ModalSheet
//  Shell bottom-sheet réutilisable pour Modal et CreateModal.
//  - Overlay cliquable pour fermer
//  - Swipe vers le bas (> 60px) pour fermer sur mobile
//  - Hauteur fixe 80vh avec scroll interne
// ─────────────────────────────────────────────────────────────────
function ModalSheet({ onClose, children }) {
  const [startY, setStartY] = useState(null);
  return (
    <div onClick={onClose} style={{position:"fixed", inset:0, zIndex:999, background:"var(--overlay)", backdropFilter:"blur(6px)", display:"flex", alignItems:"flex-end", justifyContent:"center", animation:"fadeIn .18s ease"}}>
      <div
        onClick={e => e.stopPropagation()}
        onTouchStart={e => setStartY(e.touches[0].clientY)}
        onTouchEnd={e => { if (startY && e.changedTouches[0].clientY - startY > 60) onClose(); setStartY(null); }}
        style={{background:"var(--surface)", borderRadius:"22px 22px 0 0", width:"100%", maxWidth:560, overflow:"hidden", boxShadow:"0 -12px 60px rgba(0,0,0,.22)", animation:"modalIn .25s cubic-bezier(.4,0,.2,1)", height:"80vh", display:"flex", flexDirection:"column"}}
      >
        <div style={{display:"flex", justifyContent:"center", paddingTop:10, paddingBottom:4, flexShrink:0}}>
          <div style={{width:36, height:4, borderRadius:99, background:"var(--border2)"}} />
        </div>
        <div style={{overflowY:"auto", flex:1, WebkitOverflowScrolling:"touch"}}>{children}</div>
      </div>
    </div>
  );
}

/** Wrapper de champ de formulaire avec label standardisé. */
function FormField({ label, children }) {
  return (
    <div style={{marginBottom:14}}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────
//  COMPOSANT : Modal
//  Fiche détail d'un lieu — deux modes : lecture et édition inline.
//
//  ⚠️  CORRECTION BUG 3 : `a` est toujours frais (via modalData dans App).
//  ⚠️  CORRECTION BUG 4 : handleCommentSave appelle apiPost + rollback.
// ─────────────────────────────────────────────────────────────────
function Modal({ a, onClose, comments, onCommentChange, onUpdate, onDelete, showToast, allCatsForEdit, allTagsForEdit, allEventsForEdit, allPersonsForEdit }) {
  const em  = useEditableModal(a, onUpdate, onDelete, onCommentChange, showToast);

  if (!a) return null;

  const col     = cc(a.categorie);
  const comment = comments[a.id] ?? a.commentaire ?? "";

  /**
   * ⚠️  CORRECTION BUG 4 — Persiste le commentaire côté API.
   * Flux : optimistic update local → apiPost → toast succès
   *        En cas d'échec → rollback + toast erreur
   */
  async function handleCommentSave(id, val) {
    const previous = comments[id] ?? a.commentaire ?? "";
    onCommentChange(id, val);
    try {
      const res = await apiPost({ action:"UPDATE", id, data:{ notes: val } });
      if (!res.ok) throw new Error(res.error || "Erreur API");
      showToast("Note sauvegardée");
    } catch(e) {
      onCommentChange(id, previous);
      showToast(e.message, "error");
    }
  }

  return (
    <ModalSheet onClose={onClose}>
      {/* Banner coloré (couleur de la catégorie principale) */}
      <div style={{background:`linear-gradient(135deg,${col},${col}cc)`, padding:"18px 22px 16px", position:"relative", flexShrink:0}}>
        <div style={{display:"flex", justifyContent:"flex-end", gap:7, marginBottom:10}}>
          {!em.editing && (
            <button onClick={em.startEdit} title="Modifier" style={{padding:"5px 12px", borderRadius:99, border:"none", background:"rgba(255,255,255,.2)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:5, minHeight:28}}>✏️ Modifier</button>
          )}
          {!em.editing && (
            <button onClick={() => em.setConfirmDelete(true)} title="Supprimer" style={{width:32, height:32, borderRadius:99, border:"none", background:"rgba(255,255,255,.15)", color:"#fff", cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center"}}>🗑️</button>
          )}
          <button onClick={onClose} style={{width:32, height:32, borderRadius:99, background:"rgba(255,255,255,.2)", border:"none", color:"#fff", cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center"}}>✕</button>
        </div>
        <div style={{fontSize:26, marginBottom:5}}>{ci(a.categorie)}</div>
        <h2 style={{fontFamily:"'Playfair Display',Georgia,serif", fontSize:22, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", lineHeight:1.2, margin:0}}>{a.nom}</h2>
        {a.adresse && <p style={{fontSize:11, color:"rgba(255,255,255,0.75)", marginTop:4}}>{a.adresse}</p>}
      </div>

      {/* Confirmation suppression inline */}
      {em.confirmDelete && (
        <div style={{margin:"16px 22px 0", padding:"14px 16px", borderRadius:12, background:"var(--comment-bg)", border:"1.5px solid var(--border)"}}>
          <p style={{fontSize:13, color:"var(--ink)", marginBottom:8, fontWeight:600}}>Supprimer « {a.nom} » ?</p>
          <p style={{fontSize:11, color:"var(--muted)", marginBottom:14}}>Cette action est irréversible dans Google Sheets.</p>
          <div style={{display:"flex", gap:8}}>
            <button onClick={() => em.setConfirmDelete(false)} style={{flex:1, padding:"10px", borderRadius:9, border:"1.5px solid var(--border)", background:"var(--surface)", color:"var(--ink2)", cursor:"pointer", fontSize:12, fontWeight:600, minHeight:40}}>Annuler</button>
            <button onClick={em.deleteAddr} disabled={em.deleting} style={{flex:1, padding:"10px", borderRadius:9, border:"none", background:"var(--sn-fg)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700, minHeight:40, opacity:em.deleting?0.6:1}}>{em.deleting?"Suppression…":"Supprimer"}</button>
          </div>
        </div>
      )}

      <div style={{padding:"16px 22px 32px"}}>
        {em.editing ? (
          /* ── MODE ÉDITION ── */
          <div>
            <FormField label="Note (0–5)">
              <div style={{display:"flex", alignItems:"center", gap:10}}>
                <input type="range" min={0} max={5} step={0.1} value={em.draft.note} onChange={e => em.setDraft(d => ({...d, note:+e.target.value}))} style={{flex:1, accentColor:col}} />
                <span style={{fontSize:14, fontWeight:700, color:col, minWidth:32, textAlign:"right"}}>{parseFloat(em.draft.note).toFixed(1)}</span>
              </div>
            </FormField>
            <FormField label="Budget">
              <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
                {["", ...BUDGET_ORDER].map(b => (
                  <button key={b||"—"} onClick={() => em.setDraft(d => ({...d, budget:b}))} style={{padding:"7px 13px", borderRadius:99, fontSize:12, fontWeight:700, cursor:"pointer", minHeight:36, border:`1.5px solid ${em.draft.budget===b?col:"var(--border)"}`, background:em.draft.budget===b?col:"transparent", color:em.draft.budget===b?"#fff":"var(--muted)"}}>{b||"—"}</button>
                ))}
              </div>
            </FormField>
            <FormField label="Statut">
              <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
                {STATUS_OPTIONS.map(s => (
                  <button key={s} onClick={() => em.setDraft(d => ({...d, status:s}))} style={{padding:"7px 13px", borderRadius:99, fontSize:11, fontWeight:600, cursor:"pointer", minHeight:36, border:`1.5px solid ${em.draft.status===s?col:"var(--border)"}`, background:em.draft.status===s?col:"transparent", color:em.draft.status===s?"#fff":"var(--muted)"}}>{s}</button>
                ))}
              </div>
            </FormField>
            <FormField label="Catégories">
              <TagInput values={em.draft.categories??[]} onChange={v => em.setDraft(d => ({...d,categories:v}))} suggestions={allCatsForEdit} placeholder="Ajouter une catégorie…" accentColor={col} showIcons={true} />
            </FormField>
            <FormField label="Recommandé par">
              <TagInput values={em.draft.recommended??[]} onChange={v => em.setDraft(d => ({...d,recommended:v}))} suggestions={allPersonsForEdit} placeholder="Ajouter une personne…" accentColor={col} />
            </FormField>
            <FormField label="Type d'événement">
              <TagInput values={em.draft.event_type??[]} onChange={v => em.setDraft(d => ({...d,event_type:v}))} suggestions={allEventsForEdit} placeholder="Ajouter un type d'événement…" accentColor={col} />
            </FormField>
            <FormField label="Tags">
              <TagInput values={em.draft.tags??[]} onChange={v => em.setDraft(d => ({...d,tags:v}))} suggestions={allTagsForEdit} placeholder="Ajouter un tag…" accentColor={col} />
            </FormField>
            <FormField label="Note personnelle">
              <textarea value={em.draft.notes??""} onChange={e => em.setDraft(d => ({...d,notes:e.target.value}))} onFocus={scrollFieldIntoView} rows={3} placeholder="Remarques, conseils…" style={{...fieldStyle, resize:"vertical", lineHeight:1.6, whiteSpace:"pre-wrap"}} />
            </FormField>
            <div style={{display:"flex", gap:8, marginTop:8}}>
              <button onClick={em.cancelEdit} style={{flex:1, padding:"12px", borderRadius:10, border:"1.5px solid var(--border)", background:"var(--surface)", color:"var(--ink2)", cursor:"pointer", fontSize:13, fontWeight:600, minHeight:44}}>Annuler</button>
              <button onClick={em.save} disabled={em.saving} style={{flex:2, padding:"12px", borderRadius:10, border:"none", background:col, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, minHeight:44, opacity:em.saving?0.7:1}}>{em.saving?"Sauvegarde…":"Sauvegarder"}</button>
            </div>
          </div>
        ) : (
          /* ── MODE LECTURE ── */
          <>
            <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16}}>
              {[
                { l:"Note",   v:<Stars n={a.note} /> },
                { l:"Budget", v:a.budget ? <span style={{fontSize:16,fontWeight:800,color:col}}>{a.budget}</span> : <span style={{color:"var(--faintest)",fontSize:12}}>—</span> },
                { l:"Statut", v:<StatusBadge status={a.status} /> },
              ].map(m => (
                <div key={m.l} style={{background:"var(--comment-bg)", borderRadius:10, padding:"10px 12px"}}>
                  <div style={{fontSize:8, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--faintest)", marginBottom:5}}>{m.l}</div>
                  {m.v}
                </div>
              ))}
            </div>
            {(a.categories??[]).length > 0 && (
              <div style={{marginBottom:12}}>
                <FieldLabel>Catégories</FieldLabel>
                <div style={{display:"flex", flexWrap:"wrap", gap:5}}>
                  {(a.categories??[a.categorie]).map(cat => (
                    <span key={cat} style={{display:"inline-flex", alignItems:"center", gap:4, fontSize:11, fontWeight:600, padding:"4px 10px", borderRadius:99, background:`${cc(cat)}18`, color:cc(cat), border:`1px solid ${cc(cat)}35`}}>{ci(cat)} {cat}</span>
                  ))}
                </div>
              </div>
            )}
            {a.type_evenement.length > 0 && (
              <div style={{marginBottom:12}}>
                <FieldLabel>Idéal pour</FieldLabel>
                <div style={{display:"flex", flexWrap:"wrap", gap:5}}>
                  {a.type_evenement.map(e => (
                    <span key={e} style={{fontSize:11, padding:"3px 10px", borderRadius:99, background:`${col}18`, color:col, border:`1px solid ${col}30`, fontWeight:500}}>{e}</span>
                  ))}
                </div>
              </div>
            )}
            {a.tags.length > 0 && (
              <div style={{marginBottom:16}}>
                <FieldLabel>Tags</FieldLabel>
                <div style={{display:"flex", flexWrap:"wrap", gap:4}}>
                  {a.tags.map(t => (
                    <span key={t} style={{fontSize:10, padding:"3px 9px", borderRadius:99, background:"var(--surface2)", color:"var(--muted)", border:"1px solid var(--border)"}}>{t}</span>
                  ))}
                </div>
              </div>
            )}
            {a.recommandes_par?.length > 0 && (
              <div style={{marginBottom:16}}>
                <FieldLabel>Recommandé par</FieldLabel>
                <div style={{display:"flex", flexWrap:"wrap", gap:5}}>
                  {a.recommandes_par.map(p => (
                    <span key={p} style={{fontSize:11, padding:"3px 10px", borderRadius:99, background:"var(--surface2)", color:"var(--ink2)", border:"1px solid var(--border)", fontWeight:500}}>{p}</span>
                  ))}
                </div>
              </div>
            )}
            {/* onChange = handleCommentSave qui appelle apiPost (correction Bug 4) */}
            <CommentZone addressId={a.id} value={comment} onChange={handleCommentSave} accentColor={col} />
            <MapsButton address={a} compact={false} />
          </>
        )}
      </div>
    </ModalSheet>
  );
}


// ─────────────────────────────────────────────────────────────────
//  COMPOSANT : CreateModal
//  Formulaire de création d'un nouveau lieu.
//  Validation côté client : nom, adresse, lat, lng requis.
//  ID temporaire généré côté client ; substitué par l'id GAS si disponible.
// ─────────────────────────────────────────────────────────────────
function CreateModal({ onClose, onCreate, addressCount, showToast, allCatsForEdit=[], allTagsForEdit=[], allEventsForEdit=[], allPersonsForEdit=[] }) {
  const EMPTY = { name:"", address:"", lat:"", lng:"", categories:[], source_list:"", budget:"", note:"", event_type:[], recommended:[], status:"🤔 À tester", tags:[], notes:"" };
  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!form.name.trim())    e.name    = "Champ requis";
    if (!form.address.trim()) e.address = "Champ requis";
    if (!form.lat || isNaN(parseFloat(form.lat)))  e.lat = "Latitude invalide";
    if (!form.lng || isNaN(parseFloat(form.lng)))  e.lng = "Longitude invalide";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const f = (k) => (v) => setForm(p => ({...p, [k]: typeof v === "object" && v?.target !== undefined ? v.target.value : v}));

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const id      = "loc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      const srcList = serializeCSV(form.categories) || form.source_list || "Autre";
      const data = {
        id, name:form.name.trim(), address:form.address.trim(),
        lat:parseFloat(form.lat), lng:parseFloat(form.lng),
        category:parseCategoryList(srcList)[0], source_list:srcList,
        budget:form.budget, note:parseFloat(form.note)||0,
        event_type:serializeCSV(form.event_type), recommended:serializeCSV(form.recommended),
        status:form.status, tags:serializeCSV(form.tags), notes:form.notes,
      };
      const res = await apiPost({ action:"CREATE", data });
      if (!res.ok && !res.success) throw new Error(res.error || "Erreur inconnue");
      const newAddr = normalizePlace({ ...data, id: res.id || id }, addressCount);
      onCreate(newAddr);
      onClose();
      showToast?.("Lieu ajouté !");
    } catch(e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const col = "var(--navy)";
  const ErrMsg = ({ k }) => errors[k] ? <span style={{fontSize:10, color:"#c0392b", marginTop:3, display:"block"}}>{errors[k]}</span> : null;

  return (
    <ModalSheet onClose={onClose}>
      <div style={{background:"linear-gradient(135deg,var(--navy),var(--navy)cc)", padding:"18px 22px 16px", flexShrink:0, position:"relative"}}>
        <button onClick={onClose} style={{position:"absolute", top:12, right:12, width:30, height:30, borderRadius:99, background:"rgba(255,255,255,.2)", border:"none", color:"#fff", cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center"}}>✕</button>
        <div style={{fontSize:26, marginBottom:5}}>📍</div>
        <h2 style={{fontFamily:"'Playfair Display',Georgia,serif", fontSize:20, fontWeight:700, color:"#fff", margin:0}}>Ajouter un lieu</h2>
      </div>
      <div style={{padding:"16px 22px 32px"}}>
        {error && <p style={{fontSize:12, color:"#c0392b", marginBottom:12, padding:"8px 12px", borderRadius:8, background:"#fdecea"}}>{error}</p>}
        <FormField label="Nom *">
          <input value={form.name} onChange={f("name")} onFocus={scrollFieldIntoView} placeholder="Nom du lieu" autoFocus style={{...fieldStyle, borderColor:errors.name?"#c0392b":undefined}} />
          <ErrMsg k="name" />
        </FormField>
        <FormField label="Adresse *">
          <input value={form.address} onChange={f("address")} placeholder="15 Rue de la Paix, 75001 Paris" style={{...fieldStyle, borderColor:errors.address?"#c0392b":undefined}} />
          <ErrMsg k="address" />
        </FormField>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14}}>
          <div>
            <FieldLabel>Latitude *</FieldLabel>
            <input value={form.lat} onChange={f("lat")} placeholder="48.8566" style={{...fieldStyle, borderColor:errors.lat?"#c0392b":undefined}} />
            <ErrMsg k="lat" />
          </div>
          <div>
            <FieldLabel>Longitude *</FieldLabel>
            <input value={form.lng} onChange={f("lng")} placeholder="2.3522" style={{...fieldStyle, borderColor:errors.lng?"#c0392b":undefined}} />
            <ErrMsg k="lng" />
          </div>
        </div>
        <FormField label="Catégories">
          <TagInput values={form.categories??[]} onChange={v => setForm(p => ({...p,categories:v,source_list:serializeCSV(v)}))} suggestions={allCatsForEdit??[]} placeholder="Ajouter une catégorie…" showIcons={true} />
        </FormField>
        <FormField label="Budget">
          <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
            {["", ...BUDGET_ORDER].map(b => (
              <button key={b||"—"} onClick={() => setForm(p => ({...p,budget:b}))} style={{padding:"6px 12px", borderRadius:99, fontSize:12, fontWeight:700, cursor:"pointer", border:`1.5px solid ${form.budget===b?"var(--navy)":"var(--border)"}`, background:form.budget===b?"var(--navy)":"transparent", color:form.budget===b?"#fff":"var(--muted)"}}>{b||"—"}</button>
            ))}
          </div>
        </FormField>
        <FormField label="Note (0–5)">
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <input type="range" min={0} max={5} step={0.1} value={form.note||0} onChange={e => setForm(p => ({...p,note:+e.target.value}))} style={{flex:1, accentColor:"var(--navy)"}} />
            <span style={{fontSize:14, fontWeight:700, color:"var(--navy)", minWidth:28, textAlign:"right"}}>{parseFloat(form.note||0).toFixed(1)}</span>
          </div>
        </FormField>
        <FormField label="Statut">
          <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => setForm(p => ({...p,status:s}))} style={{padding:"6px 12px", borderRadius:99, fontSize:11, fontWeight:600, cursor:"pointer", border:`1.5px solid ${form.status===s?"var(--navy)":"var(--border)"}`, background:form.status===s?"var(--navy)":"transparent", color:form.status===s?"#fff":"var(--muted)"}}>{s}</button>
            ))}
          </div>
        </FormField>
        <FormField label="Recommandé par">
          <TagInput values={form.recommended??[]} onChange={v => setForm(p => ({...p,recommended:v}))} suggestions={allPersonsForEdit??[]} placeholder="Ajouter une personne…" />
        </FormField>
        <FormField label="Type d'événement">
          <TagInput values={form.event_type??[]} onChange={v => setForm(p => ({...p,event_type:v}))} suggestions={allEventsForEdit??[]} placeholder="Ajouter un type d'événement…" />
        </FormField>
        <FormField label="Tags">
          <TagInput values={form.tags??[]} onChange={v => setForm(p => ({...p,tags:v}))} suggestions={allTagsForEdit??[]} placeholder="Ajouter un tag…" />
        </FormField>
        <FormField label="Note personnelle">
          <textarea value={form.notes} onChange={f("notes")} rows={2} placeholder="Remarques…" style={{...fieldStyle, resize:"vertical", lineHeight:1.6}} />
        </FormField>
        <div style={{display:"flex", gap:8, marginTop:4}}>
          <button onClick={onClose} style={{flex:1, padding:"12px", borderRadius:10, border:"1.5px solid var(--border)", background:"var(--surface)", color:"var(--ink2)", cursor:"pointer", fontSize:13, fontWeight:600}}>Annuler</button>
          <button onClick={handleSubmit} disabled={saving} style={{flex:2, padding:"12px", borderRadius:10, border:"none", background:"var(--navy)", color:"var(--bg)", cursor:"pointer", fontSize:13, fontWeight:700}}>{saving?"Ajout en cours…":"Ajouter ce lieu"}</button>
        </div>
      </div>
    </ModalSheet>
  );
}


// ─────────────────────────────────────────────────────────────────
//  COMPOSANT : FAB (Floating Action Button)
//  Bouton + fixe en bas à droite. Effet scale au hover.
// ─────────────────────────────────────────────────────────────────
function FAB({ onClick }) {
  return (
    <button onClick={onClick} title="Ajouter un lieu"
      style={{position:"fixed", bottom:24, right:20, width:52, height:52, borderRadius:"50%", background:"var(--navy)", color:"var(--bg)", border:"none", cursor:"pointer", fontSize:24, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(0,0,0,.25)", zIndex:200, transition:"transform .12s, box-shadow .12s", WebkitTapHighlightColor:"transparent"}}
      onMouseEnter={e => { e.currentTarget.style.transform="scale(1.08)"; e.currentTarget.style.boxShadow="0 6px 24px rgba(0,0,0,.35)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform="scale(1)";    e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.25)"; }}
    >＋</button>
  );
}


// ─────────────────────────────────────────────────────────────────
//  STYLES GLOBAUX
//  Injectés via <style> dans le render (pas de fichier CSS séparé).
//  Contient : Google Fonts, tokens CSS light/dark, reset, animations.
// ─────────────────────────────────────────────────────────────────
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=Figtree:wght@300;400;500;600;700&display=swap');

  /* ── Tokens thème clair (défaut) ── */
  :root, [data-theme="light"] {
    --bg:          #f5f2ec;
    --surface:     #ffffff;
    --surface2:    #faf9f6;
    --border:      #ede8e0;
    --border2:     #e0dbd3;
    --ink:         #1a1a2e;
    --ink2:        #555;
    --muted:       #888;
    --faint:       #aaa;
    --faintest:    #ccc;
    --card-shadow: rgba(0,0,0,0.04);
    --overlay:     rgba(10,12,20,0.65);
    --input-bg:    #ffffff;
    --gold:        #E8A020;
    --star-empty:  #e0dbd3;
    --comment-bg:  #f7f4ee;
    --pill-idle:   #f0ede6;
    --pill-text:   #666;
    --sort-idle:   #ede8e0;
    --sort-text:   #888;
    --navy:        #1a1a2e;
    --chip-bg:     #fff0e0;
    --chip-color:  #c07020;
    --chip-border: #f5d9a8;
    --scrollbar:   #ddd;
    --spinner-track: #e8e3db;
    /* Statuts — thème clair */
    --sv-bg:#e8f7ee; --sv-fg:#2a7a4b; --sv-br:#b6e0c8;
    --st-bg:#fff8e8; --st-fg:#a06010; --st-br:#f5d9a8;
    --sn-bg:#fdecea; --sn-fg:#b33030; --sn-br:#f5bcbc;
    --sm-bg:#f3f3f3; --sm-fg:#777;    --sm-br:#ddd;
  }

  /* ── Tokens thème sombre ── */
  [data-theme="dark"] {
    --bg:          #0f1117;
    --surface:     #1a1d27;
    --surface2:    #22263a;
    --border:      #2e3347;
    --border2:     #353a50;
    --ink:         #eeedf8;
    --ink2:        #b0b8d0;
    --muted:       #8a93a8;
    --faint:       #6b7280;
    --faintest:    #454d64;
    --card-shadow: rgba(0,0,0,0.35);
    --overlay:     rgba(0,0,5,0.82);
    --input-bg:    #22263a;
    --gold:        #F0B030;
    --star-empty:  #3a3d52;
    --comment-bg:  #1e2130;
    --pill-idle:   #22263a;
    --pill-text:   #8a93a8;
    --sort-idle:   #22263a;
    --sort-text:   #8a93a8;
    --navy:        #eeedf8;
    --chip-bg:     #2a2210;
    --chip-color:  #d4940a;
    --chip-border: #4a3810;
    --scrollbar:   #353a50;
    --spinner-track: #2e3347;
    /* Statuts — thème sombre */
    --sv-bg:#1a3328; --sv-fg:#4ecb83; --sv-br:#2a5040;
    --st-bg:#2a2010; --st-fg:#d4940a; --st-br:#4a3818;
    --sn-bg:#2a1215; --sn-fg:#e05050; --sn-br:#4a2025;
    --sm-bg:#252830; --sm-fg:#9099b0; --sm-br:#353a4a;
  }

  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0 }
  html, body {
    background:var(--bg);
    font-family:'Figtree','Helvetica Neue',sans-serif;
    height:100%;
    transition:background .2s, color .2s;
  }
  ::-webkit-scrollbar { width:4px; height:4px }
  ::-webkit-scrollbar-track { background:transparent }
  ::-webkit-scrollbar-thumb { background:var(--scrollbar); border-radius:2px }

  @keyframes cardIn   { from{opacity:0;transform:translateY(8px)}  to{opacity:1;transform:none} }
  @keyframes fadeIn   { from{opacity:0}                             to{opacity:1} }
  @keyframes sheetUp  { from{opacity:0;transform:translateY(24px)}  to{opacity:1;transform:none} }
  @keyframes modalIn  { from{opacity:0;transform:translateY(24px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes slideDown{ from{opacity:0;transform:translateY(-8px)}  to{opacity:1;transform:none} }
  @keyframes spin     { to{transform:rotate(360deg)} }

  body.modal-open { overflow:hidden; touch-action:none }
  * { -webkit-tap-highlight-color:transparent }
`;


// ═══════════════════════════════════════════════════════════════════════════════
//  COMPOSANT RACINE : App
//  Gère :
//    - Le state global (addresses, comments, modal, filtres, tri)
//    - Les CRUD handlers (update, create, delete)
//    - Le filtrage croisé dynamique (applyF + listes dérivées)
//    - L'orchestration des modals
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const { addresses: remoteAddresses, loading, error, source } = useData();
  const { theme, setTheme } = useTheme();
  const { toast, show: showToast } = useToast();
  const { position, geoError, geoLoading, request: requestGeo } = useGeolocation();

  const [f, dispatch] = useReducer(reducer, INIT);
  const [sort, setSort] = useState("note");

  // modal : objet adresse ouvert (id stable), null si fermée
  // createModal : booléen d'ouverture du formulaire de création
  const [modal,       setModal]       = useState(null);
  const [createModal, setCreateModal] = useState(false);

  // State local mutable des adresses (CRUD optimistic)
  const [addresses, setAddresses] = useState([]);
  useEffect(() => {
    if (remoteAddresses.length) setAddresses(remoteAddresses);
  }, [remoteAddresses]);

  // Verrouille le scroll du body quand une modal est ouverte (UX mobile)
  useEffect(() => {
    document.body.classList.toggle("modal-open", !!(modal || createModal));
    return () => document.body.classList.remove("modal-open");
  }, [modal, createModal]);

  // Commentaires : map { id → texte }
  // Seedée depuis addresses, puis mutée indépendamment (CommentZone)
  const [comments, setComments] = useState({});
  useEffect(() => {
    if (!addresses.length) return;
    setComments(prev => ({
      ...Object.fromEntries(addresses.map(a => [a.id, a.commentaire ?? ""])),
      ...prev, // conserve les éditions locales
    }));
  }, [addresses]);

  const handleCommentChange = useCallback((id, val) => {
    setComments(prev => ({...prev, [id]: val}));
  }, []);


  // ─────────────────────────────────────────────────────────────────
  //  CRUD HANDLERS
  // ─────────────────────────────────────────────────────────────────

  /**
   * handleUpdate — Applique une mise à jour partielle sur une adresse.
   * Reçoit le format GAS (champs plats CSV) et le convertit en format interne.
   * Appelé deux fois par useEditableModal : optimistic update + rollback si erreur.
   *
   * ⚠️  CORRECTION BUG 3 : setModal(null) supprimé — la modal reste ouverte
   * et affiche les données fraîches via modalData (useMemo ci-dessous).
   */
  const handleUpdate = useCallback((id, data) => {
    setAddresses(prev => prev.map(addr => {
      if (addr.id !== id) return addr;
      const updatedTags = data.tags        !== undefined ? parseCSV(data.tags)        : addr.tags;
      const updatedEvt  = data.event_type  !== undefined ? parseCSV(data.event_type)  : addr.type_evenement;
      const updatedRec  = data.recommended !== undefined ? parseCSV(data.recommended) : (addr.recommandes_par ?? parseCSV(addr.recommande_par ?? ""));
      let updatedCats = addr.categories;
      let updatedCat  = addr.categorie;
      if (data.source_list !== undefined) {
        updatedCats = parseCategoryList(data.source_list);
        updatedCat  = updatedCats[0];
      }
      return {
        ...addr,
        budget:          data.budget    !== undefined ? data.budget              : addr.budget,
        note:            data.note      !== undefined ? parseFloat(data.note)||0 : addr.note,
        type_evenement:  updatedEvt,
        recommandes_par: updatedRec,
        recommande_par:  updatedRec.join(", "),
        status:          data.status    !== undefined ? data.status              : addr.status,
        tags:            updatedTags,
        commentaire:     data.notes     !== undefined ? data.notes               : addr.commentaire,
        categories:      updatedCats,
        categorie:       updatedCat,
        source_list:     data.source_list !== undefined ? data.source_list       : addr.source_list,
      };
    }));
    // ⚠️  Pas de setModal(null) ici — correction Bug 3
    clearAddressCache(); // Sprint 1.1 — invalide le cache après modification
  }, []);

  /** Ajoute un nouveau lieu en tête de liste et invalide le cache. */
  const handleCreate = useCallback((newAddr) => {
    setAddresses(prev => [newAddr, ...prev]);
    clearAddressCache(); // Sprint 1.1
  }, []);

  /** Supprime une adresse par id, ferme la modal et invalide le cache. */
  const handleDelete = useCallback((id) => {
    setAddresses(prev => prev.filter(a => a.id !== id));
    setModal(null);
    clearAddressCache(); // Sprint 1.1
  }, []);

  /**
   * ⚠️  CORRECTION BUG 3 — modalData : données toujours fraîches.
   *
   * `modal` stocke l'objet adresse au moment du clic (snapshot).
   * `modalData` dérive les données depuis addresses[] via modal.id.
   * Dès que addresses[] change (optimistic update, rollback), la modal
   * se remet à jour automatiquement sans avoir besoin de la rouvrir.
   */
  const modalData = useMemo(
    () => modal ? (addresses.find(a => a.id === modal.id) ?? null) : null,
    [modal, addresses]
  );


  // ─────────────────────────────────────────────────────────────────
  //  FILTRAGE CROISÉ DYNAMIQUE
  //
  //  applyF applique tous les filtres actifs avec possibilité d'en exclure
  //  certains (skip). Utilisé pour les listes de valeurs disponibles dans
  //  les filtres (évite de masquer des options encore sélectionnables).
  //
  //  Exemple : allCats calculé sans filtre cats → les catégories restent
  //  visibles même quand un filtre de catégorie est actif.
  // ─────────────────────────────────────────────────────────────────
  const applyF = useCallback((data, skip = []) => {
    let d = data;
    if (!skip.includes("search") && f.search)
      d = d.filter(a => [a.nom, a.adresse, ...a.tags].some(s => s.toLowerCase().includes(f.search.toLowerCase())));
    if (!skip.includes("cats") && f.cats.length)
      d = d.filter(a => (a.categories ?? [a.categorie]).some(c => f.cats.includes(c)));
    if (!skip.includes("budgets") && f.budgets.length)
      d = d.filter(a => f.budgets.includes(a.budget));
    if (!skip.includes("noteMin") && f.noteMin > 0)
      d = d.filter(a => a.note >= f.noteMin);
    if (!skip.includes("event") && f.event)
      d = d.filter(a => a.type_evenement.includes(f.event));
    if (!skip.includes("person") && f.person)
      d = d.filter(a => (a.recommandes_par ?? [a.recommande_par]).includes(f.person));
    if (!skip.includes("statuses") && f.statuses.length)
      d = d.filter(a => f.statuses.includes(a.status));
    if (!skip.includes("tags") && f.tags.length)
      d = d.filter(a => f.tags.every(t => a.tags.includes(t))); // ET logique
    return d;
  }, [f]);

  // Listes dérivées pour les filtres et les TagInput des modals
  const allCats    = useMemo(() => { const b = applyF(addresses,["cats"]);  return [...new Set(b.flatMap(a => a.categories??[a.categorie]))].sort(); }, [addresses, applyF]);
  const allTags    = useMemo(() => { const b = applyF(addresses,["tags"]);  return [...new Set(b.flatMap(a => a.tags))].sort(); }, [addresses, applyF]);
  const allBudgets = useMemo(() => BUDGET_ORDER.filter(b => addresses.some(a => a.budget === b)), [addresses]);
  const allEvents  = useMemo(() => [...new Set(addresses.flatMap(a => a.type_evenement))].sort(), [addresses]);
  const allPersons = useMemo(() => [...new Set(addresses.flatMap(a => a.recommandes_par ?? [a.recommande_par]).filter(Boolean))].sort(), [addresses]);

  // Résultats filtrés + triés
  const results = useMemo(() => {
    let d = applyF(addresses);
    if (sort === "note")   return [...d].sort((a, b) => b.note - a.note);
    if (sort === "nom")    return [...d].sort((a, b) => a.nom.localeCompare(b.nom));
    if (sort === "budget") return [...d].sort((a, b) => BUDGET_ORDER.indexOf(a.budget) - BUDGET_ORDER.indexOf(b.budget));
    if (sort === "recent") return [...d].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
    if (sort === "distance" && position) return [...d].sort((a, b) => {
      const da = haversine(position.lat, position.lng, a.coordonnees.lat, a.coordonnees.lng);
      const db = haversine(position.lat, position.lng, b.coordonnees.lat, b.coordonnees.lng);
      return da - db;
    });
    return d;
  }, [addresses, applyF, sort]);


  // ─────────────────────────────────────────────────────────────────
  //  RENDU — État de chargement
  //  ⚠️  CORRECTION BUG 7 : propriété `background` déclarée une seule fois.
  // ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <>
      <style>{globalStyles}</style>
      <div style={{minHeight:"100vh", background:"var(--bg)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16}}>
        <div style={{width:40, height:40, border:"3px solid var(--spinner-track)", borderTopColor:"var(--ink)", borderRadius:"50%", animation:"spin 0.8s linear infinite"}} />
        <p style={{fontFamily:"'Playfair Display',serif", fontSize:18, color:"var(--ink)"}}>Chargement des données…</p>
        <p style={{fontSize:11, color:"var(--faintest)"}}>Connexion en cours…</p>
      </div>
    </>
  );


  // ─────────────────────────────────────────────────────────────────
  //  RENDU PRINCIPAL
  // ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{globalStyles}</style>

      {/* Bandeau d'alerte si API indisponible (mode fallback mock) */}
      {source === "fallback" && (
        <div style={{background:"var(--st-bg)", borderBottom:"1px solid var(--st-br)", padding:"8px 16px", display:"flex", alignItems:"center", gap:8, fontSize:11, color:"var(--st-fg)", justifyContent:"center"}}>
          <span>⚠</span>
          <span>API indisponible — données de démonstration</span>
          {error && <span style={{opacity:.6}}>({error})</span>}
        </div>
      )}

      <div style={{minHeight:"100vh", background:"var(--bg)"}}>
        <FilterBar
          f={f} dispatch={dispatch} count={results.length}
          allCats={allCats} allBudgets={allBudgets}
          allEvents={allEvents} allPersons={allPersons} allTags={allTags}
          theme={theme} setTheme={setTheme}
        />

        <div style={{maxWidth:900, margin:"0 auto", padding:"20px 14px 40px"}}>
          {/* Compteur + boutons de tri */}
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
            <p style={{fontSize:12, color:"var(--faint)"}}>
              <strong style={{color:"var(--ink)", fontSize:14}}>{results.length}</strong>{" "}
              lieu{results.length!==1?"x":""} affiché{results.length!==1?"s":""}
              {source === "api" && <span style={{color:"#3D9E6A", marginLeft:6, fontSize:10, fontWeight:600}}>● live</span>}
            </p>
            <div style={{display:"flex", gap:5}}>
              {[{v:"note",l:"⭐ Note"},{v:"nom",l:"A–Z"},{v:"budget",l:"€ Budget"},{v:"recent",l:"🕐 Récent"},{v:"distance",l:"📍 Distance"}].map(o => (
                <button key={o.v} onClick={() => setSort(o.v)} style={{padding:"5px 11px", borderRadius:99, fontSize:11, fontWeight:600, cursor:"pointer", border:"none", background:sort===o.v?"var(--navy)":"var(--sort-idle)", color:sort===o.v?"var(--bg)":"var(--sort-text)", transition:"all .14s"}}>{o.l}</button>
              ))}
            </div>
          </div>

          {/* État vide */}
          {results.length === 0 ? (
            <div style={{textAlign:"center", paddingTop:70}}>
              <div style={{fontSize:40, marginBottom:12}}>🔍</div>
              <p style={{fontFamily:"'Playfair Display',serif", fontSize:20, color:"var(--ink)", marginBottom:8}}>Aucun lieu trouvé</p>
              <p style={{fontSize:12, color:"var(--faint)", marginBottom:20}}>Essayez d'élargir vos filtres.</p>
              <button onClick={() => dispatch({t:"RESET"})} style={{padding:"10px 22px", borderRadius:99, background:"var(--navy)", color:"var(--bg)", border:"none", cursor:"pointer", fontWeight:600, fontSize:12}}>↺ Réinitialiser</button>
            </div>
          ) : (
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12}}>
              {results.map((a, i) => (
                <AddressCard key={a.id} a={a} onOpen={setModal} idx={i} comment={comments[a.id]??""} userPosition={position} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/*
        ⚠️  CORRECTION BUG 3 : passe modalData (données fraîches dérivées)
        et non modal (snapshot figé). La modal se met à jour après chaque save.
      */}
      <Modal
        a={modalData}
        onClose={() => setModal(null)}
        comments={comments}
        onCommentChange={handleCommentChange}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        showToast={showToast}
        allCatsForEdit={allCats}
        allTagsForEdit={allTags}
        allEventsForEdit={allEvents}
        allPersonsForEdit={allPersons}
      />

      <Toast toast={toast} />

      {createModal && (
        <CreateModal
          onClose={() => setCreateModal(false)}
          onCreate={handleCreate}
          addressCount={addresses.length}
          showToast={showToast}
          allCatsForEdit={allCats}
          allTagsForEdit={allTags}
          allEventsForEdit={allEvents}
          allPersonsForEdit={allPersons}
        />
      )}

      <FAB onClick={() => setCreateModal(true)} />
    </>
  );
}
