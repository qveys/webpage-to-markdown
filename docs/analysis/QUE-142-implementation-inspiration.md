# Analyse d'inspiration d'implémentation — webpage-to-markdown

> **Issue** : [QUE-142](https://paperclip.qveys.cloud/QUE/issues/QUE-142)
> **Auteur** : Amelia (Senior Software Engineer)
> **Date** : 2026-06-16
> **Source analysée** : [`qveys/_previous_webpage-to-markdown`](https://github.com/qveys/_previous_webpage-to-markdown) v1.8.0

---

## Vue d'ensemble

Le repository `_previous_webpage-to-markdown` est une **extension Chrome (Manifest V3)** écrite en **Vanilla JavaScript** (sans framework ni bundler). Elle convertit des pages web en Markdown via Turndown.js + Readability.js, avec trois modes : conversion unique, auto-capture par session de navigation et crawl multi-pages concurrent.

Le projet représente un ordre de grandeur d'environ **10 kLoC JavaScript** et **7 fichiers de tests**. Le chiffrage a été relevé le 2026-06-16 sur une copie locale du repo source, en séparant volontairement deux mesures distinctes: le volume de code JavaScript via `find js -name '*.js' | xargs wc -l` et le nombre de fichiers de tests via `find tests -name '*.test.js' | wc -l`, en incluant les bibliothèques embarquées `Readability.js`, `turndown.js` et `turndown-plugin-gfm.js`.

---

## Tableau d'analyse

| Élément | Source (fichier/module) | Description | Intérêt pour le projet | Difficulté d'adaptation | Priorité |
|---------|----------------------|-------------|----------------------|------------------------|----------|
| Pipeline de conversion HTML→Markdown | `background.js:extractAndConvert()`, `offscreen.js:convertToMarkdown()` | Chaîne complète : extraction DOM → nettoyage → Readability → Turndown avec règles custom → cleanup post-processing | **Très élevé** — c'est le cœur fonctionnel, directement réutilisable | Faible | Haute |
| Moteur de crawl concurrent | `crawl-engine.js` (CrawlEngine class) | Orchestration avec queue, workers concurrents, scope URL, anti-bot, pause/reprise/retry, persistance d'état | **Élevé** — architecture solide et éprouvée | Moyenne | Haute |
| Machine à états (AppState) | `app-state.js` | FSM avec transitions définies, listeners, rendu de vues, cycle de vie (init/update/cleanup) | **Élevé** — pattern réutilisable pour tout workflow UI multi-étapes | Faible | Haute |
| Post-traitement Markdown | `cleanup-markdown.js` | Correction des headings cassés, nettoyage Twitter/X, suppression du bruit social, normalisation espaces | **Élevé** — améliore significativement la qualité de sortie | Faible | Haute |
| Extraction de contenu intelligent | `background.js:extractAndConvert()` l.863-1161 | Readability.js en première tentative, fallback heuristique (sélecteurs main/article/.content), nettoyage des éléments interactifs/aria-hidden, conversion tweets | **Élevé** — stratégie multi-couche robuste | Faible | Haute |
| Système de download sérialisé | `background.js:w2mDownload()` | File d'attente sérialisée avec `onDeterminingFilename` pour forcer le chemin sans dialogue "Save as" | **Moyen** — contournement élégant d'une limitation Chrome | Faible | Moyenne |
| Détection de code blocks avec langage | `background.js` et `offscreen.js` règle `codeBlocks` | Détection multi-attribut : `class="language-*"`, `data-lang`, `data-language`, attribut `lang` direct | **Élevé** — améliore la qualité des blocs de code extraits | Faible | Haute |
| URL-to-path mapping | `background.js:urlToPath()` | Convertit une URL en arborescence de dossiers miroir, avec gestion des query params | **Moyen** — utile pour l'organisation des fichiers téléchargés | Faible | Moyenne |
| Gestion d'assets (images) | `background.js:downloadAssets()` | Téléchargement des images, réécriture des chemins en relatif `./assets/`, déduplication par hash FNV-1a | **Moyen** — nécessaire pour l'export offline complet | Moyenne | Moyenne |
| Internationalisation (i18n) | `i18n.js` | Système de traduction FR/EN avec interpolation `{param}`, helpers de formatage (durée, taille, temps relatif) | **Moyen** — pattern simple et efficace, réutilisable | Faible | Moyenne |
| Anti-bot / CAPTCHA detection | `crawl-engine.js:looksLikeCaptcha()` | Détection heuristique : keywords dans le head + vérification de taille/contenu réel pour éviter les faux positifs | **Moyen** — important pour le crawl à grande échelle | Faible | Moyenne |
| State persistence via chrome.storage | `crawl-engine.js:saveState()/restoreState()` | Persistance de l'état de crawl (queue, URLs vues, config) pour survivre aux redémarrages du Service Worker | **Élevé** — critique pour la fiabilité du crawl | Faible | Haute |
| Communication par ports | `crawl-engine.js:addPort()`, `background.js` onConnect | Ports persistants pour streaming de statut en temps réel vs messages ponctuels | **Moyen** — pattern adapté au monitoring live | Faible | Moyenne |
| Résolution d'URLs relatives | `offscreen.js:resolveUrls()`, `background.js` extractAndConvert | Résolution systématique des src/href relatifs, gestion de data-src, data-lazy-src, data-original | **Élevé** — essentiel pour la qualité des liens dans le markdown | Faible | Haute |
| YAML Frontmatter | `markdown-output.js:prependYamlFrontmatter()` | Ajout optionnel de métadonnées (title, url, date) en en-tête YAML | **Moyen** — fonctionnalité populaire auprès des utilisateurs | Faible | Moyenne |
| Default settings centralisés | `default-settings.js` | Source unique de vérité pour les paramètres par défaut (capture, crawl) | **Moyen** — bonne pratique d'organisation | Faible | Moyenne |
| DOM builder utilitaire (el) | `app-state.js:el()` | Fonction de construction DOM sécurisée : attributs, events, children, dataset, style | **Moyen** — évite innerHTML et les failles XSS potentielles | Faible | Moyenne |
| Tests unitaires (Jest) | `tests/*.test.js` | Tests pour AppState, CrawlEngine, cleanupMarkdown, i18n, urlToPath avec mock Chrome | **Moyen** — bonne base de départ pour le projet actuel | Faible | Moyenne |

---

## Éléments prioritaires — Description détaillée

### 1. Pipeline de conversion HTML → Markdown

**Observation** : La conversion se fait en 5 étapes enchaînées :

1. **Extraction DOM** — `extractPageContent()` / `extractAndConvert()` clone le body, supprime les éléments indésirables (scripts, nav, footer, modals, cookies), tente de trouver le contenu principal via des sélecteurs heuristiques.

2. **Extraction intelligente** — Readability.js est tenté en premier (même moteur que Firefox Reader View). Si l'article extrait est trop court (<200 chars), fallback sur les sélecteurs heuristiques (`main`, `article`, `.content`, `[role="main"]`…).

3. **Nettoyage HTML pré-conversion** — Suppression des boutons, formulaires, éléments `aria-hidden`, widgets sociaux. Conversion des tweets en blockquotes propres. Report des dimensions CSS sur les images.

4. **Conversion Turndown** — TurndownService avec règles custom : figures/figcaption, blocs de code avec détection de langage multi-attribut, images petites contraintes en HTML, support GFM (tables).

5. **Post-traitement** — `cleanupMarkdown()` répare les headings cassés, supprime le bruit social (séquences de lignes courtes), normalise l'espacement.

**Interprétation** : Ce pipeline est le modèle à suivre. Les règles Turndown custom et le nettoyage HTML sont directement transposables. La double piste Readability/heuristique garantit la robustesse.

**Recommandation** : Reprendre cette architecture en 5 étapes mais en l'encapsulant dans un module unique partagé (le repo source duplique ces règles entre `background.js` et `offscreen.js`).

### 2. Moteur de crawl (CrawlEngine)

**Observation** : Classe ES6 autonome avec :

- **Queue de découverte** avec vérification de scope (origin + pathPrefix), profondeur, et filtrage d'assets (extensions binaires).
- **Workers concurrents** — `spawnWorkers()` lance jusqu'à N workers en parallèle, chaque worker consomme la queue en boucle avec throttling configurable.
- **Anti-bot** — Détection CAPTCHA heuristique (keywords + taille page), gestion HTTP 403/429, auto-pause après N blocks consécutifs.
- **Lifecycle complet** — start/pause/resume/stop/reset avec AbortController pour annulation immédiate des fetch en cours.
- **Persistence** — `saveState()` / `restoreState()` via `chrome.storage.local` (état) + `chrome.storage.session` (queue volatile). Le crawl survit aux redémarrages du Service Worker.
- **Communication temps réel** — Ports persistants pour streamer le statut vers le dashboard. Broadcast coalescé (200ms debounce) pour éviter le spam de messages.

**Interprétation** : L'architecture CrawlEngine est un excellent modèle pour tout système de traitement concurrent avec queue. Les patterns de lifecycle (pause/resume), persistance d'état, et communication temps réel sont réutilisables tels quels.

**Recommandation** : Modéliser en TypeScript avec la même architecture (queue, workers, scope, lifecycle) mais en ajoutant le typage et en séparant les responsabilités (storage adapter, message adapter).

### 3. Machine à états (AppState)

**Observation** : FSM (Finite State Machine) avec :

- **États énumérés** : IDLE, CONVERTING, SUCCESS, ERROR, UNAVAILABLE, PRECRAWL, RUNNING, PAUSED, CRAWL_SUCCESS, CRAWL_PARTIAL.
- **Transitions explicites** : matrice de transitions valides, les transitions non autorisées sont bloquées avec warning.
- **Data associée** : chaque navigation transporte un objet data.
- **Vues associées** : `registerView(state, factory)` — chaque état a une factory qui retourne un objet `{render(), init(), update(), cleanup()}`.
- **Listeners** : callbacks notifiés à chaque transition.

**Interprétation** : Ce pattern est directement utilisable pour gérer les différents états de l'UI (idle, loading, success, error, etc.). La séparation état/vue est propre et testable.

**Recommandation** : Adopter le pattern AppState en le modernisant avec des types TypeScript et des événements typés.

### 4. Nettoyage Markdown (cleanupMarkdown)

**Observation** : Post-traitement pur string qui corrige les artéfacts de Turndown :

- **Headings cassés** : détecte `##\n\nText` et les recombine en `## Text`.
- **Twitter/X cleanup** : supprime le titre synthétique `# X`, promeut le texte post sous les images hero.
- **Bruit social** : détecte les séquences de 4+ lignes courtes non-markdown (profils, compteurs, dates) et les supprime.
- **Normalisation** : compression des sauts de ligne multiples.

**Interprétation** : Fonction pure, testée unitairement, directement importable. Les règles sont composables — on peut en ajouter sans toucher aux existantes.

**Recommandation** : Extraire dans un module partagé avec tests. Les règles sont composables — on peut en ajouter sans toucher aux existantes.

### 5. Détection de langage des blocs de code

**Observation** : Détection multi-attribut dans l'ordre de priorité :

1. `class="language-json"` ou `class="lang-json"` (convention standard)
2. `data-lang="json"` sur `<code>` ou `<pre>`
3. `data-language="json"` (variante)
4. Attribut `lang` direct (GitLab)

**Interprétation** : La règle Turndown est compacte et couvre les conventions de la majorité des plateformes.

**Recommandation** : Intégrer directement comme règle Turndown custom dans le module de conversion.

### 6. Résolution d'URLs relatives

**Observation** : Deux passes de résolution :

- **Images** : gère `src`, `data-src`, `data-lazy-src`, `data-original`. Préfère `data-src` si `src` est un data: URI ou placeholder.
- **Liens** : résolution des href relatifs via `new URL(href, baseUrl)`.

**Interprétation** : Essentiel pour produire du markdown avec des liens fonctionnels. La priorité `data-src` sur `src` s'applique uniquement lorsque `src` est un data: URI ou un placeholder (lazy loading) — elle n'est pas inconditionnelle.

**Recommandation** : Conserver l'approche de résolution multi-attribut, l'intégrer dans l'étape de nettoyage HTML pré-conversion.

### 7. Persistence d'état via chrome.storage

**Observation** : Séparation `chrome.storage.local` (état durable : URLs capturées, config, scope) et `chrome.storage.session` (queue volatile). Sauvegarde périodique (tous les 5 captures + keepalive alarm). Restauration complète au redémarrage du Service Worker.

**Interprétation** : Critique pour la fiabilité : le Service Worker MV3 peut être tué à tout moment par Chrome.

**Recommandation** : Adopter la même séparation local/session. Ajouter un versioning du format d'état pour gérer les migrations entre versions de l'extension.

---

## Pratiques de qualité observées

> Note d'audit : les évaluations ci-dessous s'appuient sur les fichiers cités dans le tableau d'analyse, complétés par les tests `tests/*.test.js`, la documentation racine (`README.md`, `CLAUDE.md`, `MIGRATION.md`) et les workflows `.github/workflows/{test,security,release,stale,sync-labels,triage}.yml`.

| Pratique | Évaluation | Détail |
|----------|-----------|--------|
| Tests unitaires | Bonne base | 7 fichiers de tests (`tests/app-state.test.js`, `tests/crawl-engine.test.js`, etc.), mocks Chrome, Jest. Couvre les modules critiques. |
| Séparation des responsabilités | Claire | Modules dédiés par rôle (`js/crawl-engine.js`, `js/cleanup-markdown.js`, `js/default-settings.js`, `js/markdown-output.js`). |
| Gestion d'erreurs | Correcte | Erreurs filtrées et gestion de retry visibles dans `js/background.js` et `js/crawl-engine.js`, sans catch silencieux systémique relevé. |
| Sécurité | Bonne | CSP restrictive dans `manifest.json`, DOM builder sécurisé (`js/app-state.js:el()`), pas d'`innerHTML` non contrôlé relevé dans les flux principaux. |
| Documentation | Complète | `README.md` détaillé, `CLAUDE.md` pour l'IA, `MIGRATION.md` pour l'historique et la transition. |
| CI/CD | En place | Workflows `.github/workflows/test.yml`, `security.yml`, `release.yml`, `sync-labels.yml`, `triage.yml`, `stale.yml`. |

---

## Limites et points d'attention

| Limitation | Impact | Recommandation |
|-----------|--------|----------------|
| **Pas de TypeScript** | Pas de typage statique, refactoring risqué à grande échelle | Adopter TypeScript pour le nouveau projet |
| **Global namespace W2M** | Pollution globale, risque de collisions | Utiliser des modules ES6 natifs |
| **ES5 dans les IIFEs** | Code verbeux, pas d'async/await dans l'UI | Moderniser avec ES2020+ |
| **Pas de bundler** | Pas de tree-shaking, pas de splitting, vendored libs manuels | Utiliser Vite ou un bundler similaire |
| **Duplication de règles Turndown** | Les règles custom sont dupliquées entre `background.js` et `offscreen.js` | Extraire dans un module partagé |
| **Pas de gestion de mémoire** | Le Set `capturedUrls` grandit indéfiniment en session | Limiter ou paginer pour les grands crawls |
| **Offscreen document** | Usage correct mais API fragile (lifecycle, single-instance) | Prévoir des fallbacks |

---

## Recommandations d'implémentation

1. **Reprendre le pipeline de conversion complet** (Readability → Turndown → cleanup) comme base fonctionnelle.
2. **Modéliser le CrawlEngine en TypeScript** avec la même architecture (queue, workers, scope, lifecycle) mais en ajoutant le typage.
3. **Adopter le pattern AppState** pour la gestion UI, en le modernisant avec des types et des événements typés.
4. **Extraire les règles Turndown** dans un module partagé unique (DRY).
5. **Conserver l'approche de tests** (Jest + mocks Chrome) et l'étendre dès le début.
6. **Moderniser la stack** : TypeScript, modules ES6, bundler (Vite), mais garder l'architecture et les patterns.
7. **Garder l'i18n** avec le pattern clé/interpolation, en ajoutant la détection automatique de locale.
