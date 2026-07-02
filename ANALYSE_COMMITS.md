# Analyse historique des commits — `_previous_webpage-to-markdown`

**Repository** : `https://github.com/qveys/_previous_webpage-to-markdown`
**Auteur principal** : Quentin Veys (105 commits)
**Période** : 13 mars 2026 → 4 mai 2026 (~7 semaines)
**Total** : 107 commits, 62 fichiers, ~17 900 lignes ajoutées

---

## 1. Timeline des grandes phases

Le projet a suivi 6 phases distinctes, confirmées par les tags de release et les dates de commit :

### Phase 1 — Fork initial + Service Worker + Capture sessions (13 mars, ~4h)

**Commits** : `41d3e7d` → `84238a1` (27 commits)
**Tags** : v1.0.1 → v1.1.0

| Observation | Le développeur a forké l'extension "Webpage to Markdown" v1.0.1 et, en une seule après-midi, a ajouté un service worker, un mode auto-capture, et des améliorations markdown (Readability.js, GFM tables, détection de langage code, résolution d'URLs relatives, stabilité DOM pour SPAs). Suivi de redesign UI et documentation README. |
|---|---|
| Interprétation | Le rythme très rapide (27 commits en ~4h) suggère une itération build-test-fix classique. Les corrections de path importScripts (2 commits espacées de 6 minutes) indiquent un workflow immédiat. |
| Recommandation | L'ordre fork → service worker → capture → markdown polish est bon. Commencer par la base fonctionnelle avant d'enrichir. |

**Commits clés** :

- `41d3e7d` — Fork initial (1806 lignes : popup.js, turndown.js, manifest, styles)
- `b20d2e7` — Service Worker + API message externe
- `439f33d` — Mode auto-capture session (+932 lignes popup)
- `84d06a6` — Readability.js vendorisé (+2825 lignes)
- `981bf03` — Premier redesign popup CSS

### Phase 2 — Redesign complet : état centralisé, crawl engine, dashboard (24 mars)

**Tag** : v1.2.0
**Commits** : `d3febb6` → `a3f0b13` (13 commits)

| Observation | Après 11 jours de pause, un lot de commits (tous timestampés `01:06:19`, même seconde) introduit l'architecture complète : i18n, app-state, styles refondus, crawl-engine (571 lignes), offscreen parser, popup view-based, settings page, dashboard. Le plan crawl feature (daté 14 mars) confirme la préméditation. |
|---|---|
| Interprétation | Les timestamps identiques suggèrent un rebase/squash d'un travail préparé hors-branche. C'était un développement parallèle non-incrémental. |
| Recommandation | L'ordre de cette phase (i18n → state → styles → engine → UI) est un bon pattern bottom-up pour les fondations. |

**Commits clés** :

- `d3febb6` — Module i18n (+352 lignes, traductions FR/EN)
- `b75c69b` — AppState avec machine d'état (+138 lignes)
- `0bd5ec4` — CrawlEngine + offscreen (+1485 lignes) — commit critique
- `bd14716` — Popup view-based refactoring (+1153/-727)
- `dbcdeb7` — Dashboard crawl et vues session (+1042)

### Phase 3 — Polissage UX, perf, tests, refactoring (27 mars)

**Tags** : v1.3.0 → v1.4.0 → v1.5.0
**Commits** : `92cc4dc` → `42afc5d` (36 commits en une journée)

| Observation | Journée intensive : permissions manifest, extraction de modules partagés (theme-icon.js, cleanup-markdown.js), throttling crawl, conversion i18n en ES5, remplacement catch silencieux par logging filtré, tests Jest, durcissement CAPTCHA anti-bot. |
|---|---|
| Interprétation | C'est le pattern classique post-feature : consolidation après la ruée fonctionnelle. L'extraction de `cleanupMarkdown` en module partagé montre une maturité architecturale. |
| Recommandation | Anticiper les extractions (theme-icon, cleanup-markdown) dès la phase 2 pour éviter la duplication. |

**Refactorings notables** :

- `1f42b78` — Extraction theme-icon.js (+51 lignes, -185 réparties) — déduplication du builder d'icônes
- `e340f96` — Extraction cleanup-markdown.js (+127 centralisées, -321 réparties) — logique markdown partagée
- `c39842c` — Remplacement catch silencieux par logging filtré (5 fichiers)

**Tests ajoutés** :

- `af3c890` — Infrastructure Jest + Chrome mock
- 5 suites de tests : crawl-engine, app-state, cleanup-markdown, i18n, url-path
- `b00a1e4` — CI GitHub Actions

### Phase 4 — Single-page conversion (28 avril)

**Tags** : v1.6.0 → v1.6.1 → v1.7.0 → v1.8.0
**Commits** : `04efdf0` → `339a3a2` (4 commits)

| Observation | Après un mois de pause, ajout du mode conversion single-page dans le side panel. Développé rapidement avec une correction immédiate pour l'injection cleanup-markdown.js oubliée. |
|---|---|
| Interprétation | Feature autonome construite sur les fondations existantes. Le pattern est bon : feature → hotfix → polish → shared UI. |

### Phase 5 — CI/CD et gouvernance repo (29 avril)

**Commits** : `e172878` → `5252204` (12 commits)

| Observation | Mise en place industrielle : release workflow (Chrome/Firefox/Edge), CODEOWNERS, auto-labeler, Dependabot, PR templates, CodeQL, stale bot. Corrections itératives CI immédiates (CodeQL perms, npm audit). |
|---|---|
| Interprétation | Batch "repo maturation" fait d'un coup. Le `MIGRATION.md` documente un rebuild de repo le 29 avril. |
| Recommandation | Mettre en place CI/CD plus tôt, après la phase 2, pour capturer les régressions du crawl-engine. |

### Phase 6 — Bugfixes via PR et maintenance (29 avril → 4 mai)

**Commits** : `72b68da` → `711508c` (7 commits via PRs #4-#10)

| Observation | Passage à workflow PR. Corrections : state mirroring pendant crawl actif, races bénignes single-page, split LICENSE/NOTICE, CI badges. Dependabot bumps. |
|---|---|
| Interprétation | Le passage aux PRs coïncide avec CODEOWNERS et branch protection. Signe de maturité du workflow. |

---

## 2. Ordre de construction du projet — leçons clés

### Ce qui a bien marché (reproduire)

1. **Fork fonctionnel dès le jour 1** : Avoir un produit qui marche permet un workflow itératif immédiat.
2. **Service Worker prioritaire** : C'est la colonne vertébrale d'une extension Chrome. L'ajouter tôt débloque tout.
3. **Fondations avant features** : L'ordre i18n → state → styles → engine → UI de la phase 2 est un bon pattern bottom-up.
4. **Plan écrit avant développement majeur** : Le plan crawl (14 mars, développement 24 mars) montre une réflexion préalable qui a payé.
5. **Tests après stabilisation** : Les tests ont été ajoutés quand l'API était stabilisée, pas en TDD. Pragmatique.

### Ce qui aurait pu être amélioré (anticiper)

1. **Duplication évitable** : cleanupMarkdown a été copié 3 fois avant extraction. Créer les modules partagés dès qu'on sait qu'ils seront réutilisés.
2. **CI/CD tardif** : La CI arrive en semaine 4, release en semaine 7. L'ajouter en semaine 2 aurait capturé les bugs du crawl-engine plus tôt.
3. **Licensing dès le départ** : LICENSE et NOTICE arrivent en dernière phase. Les ajouter au fork initial évite la dette.
4. **Commits plus atomiques** : Certains commits sont très larges (ex: `439f33d` avec +932 lignes). Plus petits → meilleur debug et review.
5. **Branch protection plus tôt** : Le workflow PR n'arrive qu'après 95+ commits sur main. L'utiliser dès la phase 2.

### Ordre recommandé pour la reconstruction actuelle

```text
Semaine 1 — Fondations
  ├─ Structure + LICENSE/NOTICE
  ├─ manifest.json complet
  ├─ Service Worker de base
  └─ Conversion markdown single-page (Turndown dans tab context)

Semaine 1-2 — Qualité markdown
  ├─ Readability.js (extraction robuste)
  ├─ GFM tables + code lang detection
  ├─ URL resolution + DOM stability pour SPAs
  └─ Module cleanup-markdown.js **dès le départ**

Semaine 2 — Capture et sessions + CI/CD minimale
  ├─ Auto-capture session mode
  ├─ URL tree + save assets
  ├─ Persistance URLs capturées
  ├─ Popup UI v1
  └─ **CI/CD minimale** (jest, linting) pour détecter les bugs tôt

Semaine 2-3 — Architecture multi-vue
  ├─ AppState (machine d'état)
  ├─ i18n complet
  ├─ Popup view-based
  ├─ Settings page
  └─ Tests unitaires (fondations en place)

Semaine 3-4 — Crawl engine
  ├─ CrawlEngine + offscreen parser
  ├─ Dashboard
  ├─ Anti-bot / CAPTCHA detection
  └─ Performance (throttling, dedup)

Semaine 4 — Side panel + single-page
  ├─ Conversion single-page dans side panel
  ├─ Shortcut Alt+M
  └─ UI partagée

Semaine 4-5 — Governance complète + release
  ├─ Release workflow multi-browser
  ├─ Security (Dependabot, audit, CodeQL)
  ├─ CODEOWNERS + branch protection
  └─ Issue/PR templates
```

---

## 3. Décisions techniques visibles dans les commits

| Décision | Commit(s) | Motivation |
|---|---|---|
| **Turndown dans contexte tab (pas SW)** | `8c0e96f` | Le SW n'a pas accès au DOM (`document is not defined`). Solution : `chrome.scripting.executeScript` dans l'onglet. |
| **Readability.js vendorisé** | `84d06a6` | Pas de bundler en extension Chrome. Le fichier est copié directement (2786 lignes). |
| **Offscreen document pour parser HTML** | `0bd5ec4` | Le crawl-engine a besoin de parser du HTML. L'offscreen document fournit un contexte DOM isolé. |
| **AppState comme machine d'état** | `b75c69b`, `371e8f5` | Transitions d'état explicites avec listeners. Le commit `371e8f5` bloque les transitions invalides au lieu d'un simple warning. |
| **ES5 pour i18n.js** | `9cc095a` | `var`/`function`/`.then` au lieu de `const`/arrow. Compatibilité avec certains contextes Chrome Extension. |
| **Pas de bundler** | Tout | Architecture "plain JS modules" chargés via `<script>` tags. Cohérent avec une extension Chrome simple. |
| **Crawl delay configurable** | `0bd5ec4`, `1f3f3d3` | Anti-rate-limiting : délai entre requêtes de crawl. |
| **CAPTCHA detection heuristique** | `5358c6e`, `cfd1518` | Détection par taille et tags HTML plutôt que pattern matching. Durcissement itératif (2 commits). |

---

## 4. Refactorings et leur motivation

### 1. Extraction `cleanup-markdown.js` (`e340f96`)

- **Problème** : Code dupliqué dans background.js, offscreen.js, popup.js (~100 lignes chacun)
- **Solution** : Module +127 lignes, inclusion via `<script>` dans tous les HTML
- **Impact** : -321 lignes réparties, +144 centralisées. Net : -177
- **Motivation** : Éviter la divergence. Chaque correction devait être faite 3 fois.

### 2. Extraction `theme-icon.js` (`1f42b78`)

- **Problème** : Builder d'icône SVG copié dans popup.js, dashboard.js, settings-page.js
- **Solution** : Module partagé +51 lignes, suppression des copies -185
- **Impact** : Déduplication d'une UI mécanique

### 3. Popup view-based (`bd14716`)

- **Problème** : popup.js était un monolithe procédural (+743 lignes dans `439f33d`)
- **Solution** : Réécriture complète en architecture view-based (+1153/-727)
- **Motivation** : L'ajout du crawl rendait le monolithe ingérable. Les vues deviennent des fonctions indépendantes.

### 4. Error logging (`c39842c`)

- **Problème** : `catch {}` silencieux partout (5 fichiers)
- **Solution** : Logging filtré qui exclut les erreurs bénignes mais log les vraies
- **Motivation** : Debugging en production.

---

## 5. Patterns de construction observés

### Pattern 1 : Batch et rebase

Les commits de la phase 2 ont tous le même timestamp (`01:06:19`), suggérant un rebase/squash. Le travail a été préparé hors-branche pendant 11 jours, puis fusionné en bloc. Bon pour la clarté, mais masque les itérations intermédiaires.

### Pattern 2 : Bugfixing immédiat

Les corrections de path (2 commits en 6 min), les fixes CodeQL (3 commits en qq min) montrent un workflow itératif build-test-fix très serré.

### Pattern 3 : Extraction post-hoc

Les refactorings (cleanup-markdown, theme-icon) arrivent en phase 3 après avoir observé la duplication. Idéalement, les anticiper en phase 2.

### Pattern 4 : Tests après stabilisation

Les tests arrivent en semaine 4 quand le code est stable. Pragmatique pour un prototype, mais rend la refactoring plus risquée.

---

## 6. Statistiques résumées

| Phase | Période | Commits | Contenu approx. |
|---|---|---|---|
| 1. Fork + Capture | 13 mars | 27 | Service Worker, auto-capture, markdown polish |
| 2. Crawl redesign | 24 mars | 13 | i18n, state, crawl-engine, dashboard |
| 3. Polish + Tests | 27 mars | 36 | Refactoring, Jest, performance |
| 4. Single-page | 28 avril | 4 | Side panel conversion |
| 5. CI/CD | 29 avril | 12 | Release workflow, security |
| 6. PRs + maintenance | 29 avr → 4 mai | 7 | Bugfixes, licensing |
| **Dependabot** | 4 mai | 2 | Dep bumps |
| **Total** | 7 semaines | **107** | **~17 900 lignes** |

### Tags de versioning

- `v1.0.1` — Initial fork
- `v1.1.0` — Markdown improvements (Readability, GFM, tables)
- `v1.2.0` — Major redesign (crawl engine, state machine, dashboard)
- `v1.3.0` — Perf & UX (throttling, theme split)
- `v1.4.0` — Jest test suite + CI
- `v1.5.0` — CrawlEngine hardening (CAPTCHA, asset skip)
- `v1.6.0` — Single-page mode
- `v1.6.1` — Fix cleanup-markdown injection
- `v1.7.0` — Single-page polish
- `v1.8.0` — Side panel shortcut + shared UI

---

## Conclusion

La construction du projet suit un pattern pragmatique : **fork → service worker → capture → markdown → state machine → crawl engine → tests → CI/CD → PR workflow**.

Les décisions architecturales (Readability vendorisé, pas de bundler, offscreen parser, ES5) sont des contraintes d'extension Chrome bien compris et respectés. Les refactorings arrivent tardivement mais efficacement.

**Pour la reconstruction actuelle : anticiper les modules partagés (cleanup-markdown) dès la phase 2, mettre en place CI après la phase 2 plutôt que la phase 5, et privilégier les commits atomiques pour faciliter le debugging.**
