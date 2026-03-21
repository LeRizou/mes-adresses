# Mes Adresses — Changelog

## v3.0.0 — Sprint 1+2 (2026-03-21)
### Sprint 1 — Performance
- Prefetch au niveau module (cold start GAS masqué)
- Cache localStorage 30min (affichage instantané au retour)
- Chargement progressif 200 adresses en priorité
- Invalidation cache après CREATE / UPDATE / DELETE

### Sprint 2 — Géolocalisation & Distance
- Bouton "Me localiser" (GPS navigateur)
- Calcul de distance Haversine (côté client, sans API)
- Badge distance sur chaque carte
- Filtre par rayon (500m / 1km / 2km / 5km / 10km)
- Filtre par ville / arrondissement (texte libre)
- Tri par distance
- Tri par date d'ajout (timestamp)

### Backlog feedbacks (à traiter en v3.1)
- (à compléter)

---

## v2.2.0 — Hardening sécurité (2026-03-20)
- Clé API dans variables d'environnement (.env)
- Requêtes lecture en POST (clé jamais dans l'URL)
- Validation taille payload GAS (100 Ko max)
- Validation longueur des champs
- Cache GAS versionné (invalidation réelle)
- Rotation automatique des logs (30j / 2000 lignes)

## v2.1.0 — Corrections bugs (2026-03-19)
- Bug 1 : API_KEY non définie
- Bug 2 : useToast timerRef
- Bug 3 : modal données périmées
- Bug 4 : CommentZone non persisté
- Bug 5 : propriétés GAS séparées
- Bug 6 : headers Location casse
- Bug 7 : double background spinner

### Backlog feedbacks v3.1 (à traiter)
- Bug : CommentZone — perte de données si édition depuis le bas puis le haut
- Feature : Last Edited Time — lire la colonne "last edited" plutôt que timestamp créé
- Bug : Filtre ville/arrondissement — ne filtre pas correctement (ex: Barcelona)
- Feature : Archivage — masquer les adresses archivées par défaut, confirmation avant archivage
- Bug : Distance — badge non affiché, calcul Haversine non opérationnel
