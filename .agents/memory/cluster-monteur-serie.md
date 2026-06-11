---
name: Cluster-monteur toewijzing & serie plaatsen
description: Hoe groepsgewijze monteurtoewijzing en serie-plaatsing van voorbereide spots zijn opgezet in de plattegrond-editor
---

# Cluster → monteur toewijzing

- Er is GEEN monteur-kolom op de clusters-tabel. Een cluster-toewijzing wordt
  opgeslagen als een bulk-update van `voorzieningen.monteurId` voor alle spots in
  het cluster, via `POST /clusters/{clusterId}/monteur` (operationId
  `assignClusterMonteur`, body `ClusterMonteurInput {monteur_id: integer|null}`).
- **Why:** monteurtoewijzing hoort bij de spot (uitvoering), niet bij het logische
  cluster; voorkomt een extra DB-kolom en houdt de bron van waarheid op de spot.
- De "huidige monteur" van een cluster wordt daarom **client-side afgeleid** uit de
  spots: alle spots dezelfde (non-null) monteur => die tonen, anders "niet
  toegewezen". `clusterRij()` in de API geeft GEEN monteur terug.
- **How to apply:** wil je de cluster-monteur ergens tonen (bubbels, overzicht),
  leid hem af uit de voorzieningenlijst — niet uit de cluster-respons. Of breid
  `clusterRij()` uit als je het server-side nodig hebt.

# Serie plaatsen (voorbereide spots)

- Serie-modus in `plattegrond.tsx` zet een sjabloon (applicatie/toepassing/
  wand-plafond/ruimte/status/monteur/cluster) en plaatst per klik één spot via de
  gewone `POST /voorzieningen` met **leeg objectnummer** (server genereert
  spotnummer, 23505-retry). Sjabloon staat in refs (serieFormRef/serieLabelIdsRef)
  zodat de useCallback geen stale closure pakt.
- Modi (plaatsen/serie/tekenen/verplaatsen) zijn wederzijds exclusief: bij het
  aanzetten van de één de andere uitschakelen.
