# Analyse Qualité et Risques — `_previous_webpage-to-markdown`

> **Repo analysé :** `https://github.com/qveys/_previous_webpage-to-markdown`  
> **Date :** 2026-06-16  
> **Version :** 1.8.0 (commit `a91b4b0`)  
> **Analyste :** QA Agent (🐛)

---

## 1. Vue d'ensemble

Extension Chrome (Manifest V3) convertissant des pages web en Markdown. Supporte la conversion page unique, les sessions auto-capture, et le crawl multi-pages avec interface side panel. Fork enrichi de [webpage-to-markdown](https://chromewebstore.google.com/detail/webpage-to-markdown/ajeinonckioeekcfanjndliandidilid).

**Architecture :** Pas de bundler. JS vanilla + Turndown/Readability vendorisés. Tests Jest uniquement. Stack minimaliste assumée.

---

## 2. Dimensions de qualité

### 2.1 Tests — ⭐⭐⭐½ (3.5/5)

**Observation :** 7 suites de test, 66 tests, 100% passing.

Modules couverts :
- `app-state.js` : 131 lignes de tests — transitions d'état, listeners, erreurs d'input
- `crawl-engine.js` : 154 lignes — scope, filtrage d'URLs, queue, blocages
- `cleanup-markdown.js` : 59 lignes — liens multilignes, headings cassés, nettoyage Twitter/X
- `i18n.js` : 67 lignes — traductions FR/EN, variables, fallback
- `markdown-output.js` : 47 lignes — YAML frontmatter, strip heading
- `url-path.js` : 51 lignes — URL → chemin fichier, caractères spéciaux
- `smoke.test.js` : 1 test — présence du mock Chrome

**Problème critique — Coverage trompeuse :**  
Jest ne charge que les fichiers explicitement importés. Le rapport de couverture ne couvre PAS :
- `background.js` (1 431 lignes, toute la logique SW + message handlers)
- `popup.js` (1 217 lignes, UI complète du popup)
- `dashboard.js` (1 354 lignes, side panel entier)
- `settings.js` (370 lignes), `offscreen.js` (322 lignes)

**Soit ~3 700 lignes non couvertes = ~75% du code source sans tests.**

**Problème mineur :**  
`markdown-output.js` : 58.33% de couverture de branches (lignes 7–45 et 50–70 non couvertes — fonctions `prependYamlFrontmatter` et `stripPreviewLeadingHeading` partiellement testées).

**Pattern technique :** Les tests utilisent `vm.runInThisContext` pour contourner l'isolation de modules Jest avec les IIFEs. Technique valide mais fragile — tout changement du modèle de module peut casser les tests sans avertissement.

**Absence totale :** Pas de tests E2E (Playwright, Puppeteer pour extension Chrome), pas de tests d'intégration avec le navigateur.

---

### 2.2 Documentation — ⭐⭐⭐⭐ (4/5)

**Observation :**
- **README.md** (12 708 octets) : Excellente documentation utilisateur. Features détaillées, diagrammes ASCII, tableau technique, badges CI/CodeQL/version.
- **CLAUDE.md** : Guide clair pour Claude Code — architecture, conventions de code, permissions, git conventions, hooks. À jour.
- **AGENTS.md** : Équivalent pour Codex — plus complet que CLAUDE.md (inclut les lessons learned). Légèrement en avance sur CLAUDE.md.
- **MIGRATION.md** : Document de transition expliquant le rebuild du repo au 2026-04-29.
- **Commentaires inline** : Denses dans `background.js` (séparateurs ASCII art, explication des décisions). Quasi-absents dans `popup.js` et `dashboard.js`.

**Risque identifié :**  
`MIGRATION.md` indique lui-même : *"Ce fichier est temporaire. Il sera supprimé par un PR de nettoyage dans deux semaines (≈ 2026-05-13)."* — Il est toujours là un mois après. Fichier zombie.

**JSDoc :** Minimal — 4 annotations dans `background.js`, 2 dans `crawl-engine.js`. Pour du code aussi critique que les handlers de messages, c'est insuffisant.

---

### 2.3 Robustesse du code — ⭐⭐⭐½ (3.5/5)

**Points positifs :**
- `AppState` est une vraie machine à états avec `STATES` + `TRANSITIONS` frozen — transitions invalides bloquées silencieusement (warn console).
- `CrawlEngine` : auto-pause sur N blocages consécutifs, AbortController pour annuler les fetches en vol, gestion des erreurs 403/429.
- `background.js` : ~124 occurrences de `try/catch` — gestion d'erreurs intensive.
- URL validation dans CrawlEngine : `isFetchableHttpUrl` filtre les `chrome://`, `data:`, `javascript:`.

**Code dupliqué — Risque majeur :**  
La logique d'extraction de contenu existe en **deux versions** dans `background.js` :
- **Version 1** (ligne 27) : `extractPageContent()` — injectée dans les pages via `scripting.executeScript`
- **Version 2** (ligne 940) : logique inline dans `extractMarkdownFromTab()` — utilise Readability + fallback heuristique

Les deux versions partagent le même tableau de sélecteurs CSS :  
```js
["main", "article", ".content", ".post", ".entry", "[role='main']", "#content", ".main"]
```
Toute modification dans l'une risque d'être oubliée dans l'autre.

**Edge case non testé :** Le Service Worker se réinitialise à chaque redémarrage de l'extension et réinitialise la session (`capturedUrls: []`). Si une session de capture était active, les URLs déjà capturées sont perdues. Le comportement est documenté dans CLAUDE.md mais non testé.

---

### 2.4 Sécurité — ⭐⭐⭐½ (3.5/5)

**Points positifs :**
- **CSP stricte :** `"script-src 'self'; object-src 'self'"` — aucun `unsafe-inline`, aucun CDN externe.
- **MV3 :** Le Service Worker remplace le background persistant — surface d'attaque réduite.
- **Dépendances :** `npm audit` → 0 vulnérabilités. `brace-expansion` correctement patchée via `overrides`.
- **Pas de `content_scripts` :** Pas d'injection automatique sur toutes les pages — l'exécution est déclenchée manuellement.

**Risques identifiés :**

1. **`host_permissions: ["<all_urls>"]`** — Nécessaire pour le crawl, mais octroie à l'extension la permission de fetch toute URL et d'exécuter des scripts sur toute page. La permission est documentée comme contrainte de design dans README et CLAUDE.md.

2. **`chrome.runtime.onMessage` sans validation du sender** (ligne 268) :
   ```js
   chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
     // sender.id non vérifié
   ```
   En MV3, d'autres extensions ou des pages web (si `externally_connectable` était défini) pourraient envoyer des messages. Actuellement, `externally_connectable` est absent du manifest → risque limité mais validité non vérifiée explicitement.

3. **`innerHTML` sans sanitization explicite** (background.js lignes 982, 1018; popup.js ligne 194) :
   - Ligne 982 : `_clean.innerHTML = html; // safe: html comes from Readability / same-origin DOM` — Commentaire correct, mais "safe" dépend du fait que Readability est correctement appelé en amont. Si `html` vient du fallback heuristique sans Readability, cette garantie ne tient plus.
   - Ligne 1018 : `el.innerHTML = \`<p>${text}</p>${src ? \`<p><a href="${src}">Source</a></p>\` : ""}\`` — `text` et `src` viennent de la page distante via le SW. Risque XSS si le SW ou le pipeline est compromis.

4. **`actions/checkout@v6`** dans `release.yml` et `security.yml` :
   - `test.yml` et `sync-labels.yml` utilisent `actions/checkout@v4` (stable, actuel).
   - `release.yml` et `security.yml` utilisent `@v6` — version non encore publiée officiellement en production. Si ce tag est publié par un acteur malveillant via un hijack de tag, le workflow exécuterait du code arbitraire avec `permissions: contents: write`. **Risque supply chain.**

---

### 2.5 Dette technique — ⭐⭐⭐ (3/5)

**TODO/FIXME :**  
Aucun `TODO`, `FIXME`, ou `HACK` trouvé dans le code source principal (hors vendored libs). Positif.

**Complexité :**
- `background.js` : 1 431 lignes, 27 fonctions, 118 conditions. Fichier god-object combinant SW lifecycle, extraction, conversion, sessions, crawl orchestration, et download management.
- `popup.js` : 1 217 lignes, IIFE masquant toute la complexité UI.
- `dashboard.js` : 1 354 lignes, idem.

**Incohérence ES5/ES6 :**  
CLAUDE.md stipule : *"ES5-compatible in IIFEs: `var`, `function` — no arrow functions"*. Or `popup.js` contient 2 `const`/`let` et des usages de arrow functions — légère dérive non détectée.

**Vendored libs non versionnées automatiquement :**  
`Readability.js` (2 786 lignes), `turndown.js` (973 lignes), `turndown-plugin-gfm.js` (165 lignes) sont dans le repo. Un hook bloque les modifications accidentelles, mais aucune automation de mise à jour n'existe. Les CVEs dans ces libs nécessitent une action manuelle.

**`MIGRATION.md` zombie :** Voir §2.2.

---

### 2.6 Dépendances — ⭐⭐⭐⭐ (4/5)

**Observation :**
- **1 seule dépendance de dev :** `jest@^29.0.0` — minimaliste, excellent.
- **Dependabot configuré :** Mises à jour hebdomadaires pour npm et GitHub Actions, groupées.
- **0 dépendance de runtime via npm** — les libs sont vendorisées → pas de compromission via supply chain npm.

**Risque :** Le `package.json` déclare `jest@^29` mais l'invocation `npx jest` a installé `jest@30.4.2` (non lockée). La `package-lock.json` résout `jest@29.7.0`. `npx jest` bypasse la lockfile — divergence de comportement selon l'environnement d'exécution.

---

### 2.7 CI/CD — ⭐⭐⭐⭐ (4/5)

**Workflows présents :**
| Workflow | Trigger | Rôle |
|---|---|---|
| `test.yml` | PR → main | `npm ci && npm test` |
| `security.yml` | Push/PR → main | `npm audit --audit-level=high` |
| `release.yml` | Tag `v*` | Build Chrome/Firefox/Edge bundles |
| `triage.yml` | Issues/PRs ouverts | Labels conventionnels |
| `sync-labels.yml` | Push `labels.yml` | Synchronise les labels GitHub |
| `stale.yml` | Quotidien | Marque les issues/PRs inactifs après 60j |

**Absent :**
- Pas de **linting** (ESLint) dans CI — les erreurs de style ne sont pas bloquantes.
- Pas de **formatage** (Prettier) — cohérence stylistique non enforced.
- **CodeQL supprimé** (commit `5252204` : *"remove workflow — requires GitHub Advanced Security on private repo"*) → Analyse statique de sécurité absente. `npm audit` est insuffisant pour détecter les XSS, message handler abuses, etc.

**Bug CI :** `actions/checkout@v6` dans `release.yml` et `security.yml` (voir §2.4, point 4).

---

### 2.8 Pratiques qualité — ⭐⭐⭐ (3/5)

| Pratique | Présent | Note |
|---|---|---|
| Jest | ✅ | Version ^29, bien configuré |
| ESLint | ❌ | Absent |
| Prettier | ❌ | Absent |
| TypeScript | ❌ | Vanilla JS assumé |
| Husky/pre-commit | ❌ | Absent |
| Dependabot | ✅ | Bien configuré |
| CODEOWNERS | ✅ | `* @qveys` |
| Conventional commits | ✅ | Emoji + type(scope) |
| Branch protection | Partiel | CODEOWNERS en place, règles à configurer |
| Changelog automatique | ❌ | Manuel via `/release` skill |

---

## 3. Limites et risques identifiés

| Risque | Impact | Probabilité | Priorité |
|---|---|---|---|
| 75% du code sans tests (background/popup/dashboard) | Élevé | Certaine | 🔴 Critique |
| `actions/checkout@v6` inexistant en prod → supply chain | Élevé | Faible | 🟠 Haut |
| `innerHTML` sans sanitization explicite dans certains chemins | Moyen | Faible | 🟠 Haut |
| Duplication extraction de contenu dans background.js | Moyen | Certaine | 🟡 Moyen |
| Libs vendorisées sans update automation | Moyen | Probable | 🟡 Moyen |
| Absence ESLint/Prettier | Faible | Certaine | 🟡 Moyen |
| `onMessage` sans validation sender | Faible | Très faible | 🟢 Bas |
| MIGRATION.md zombie | Très faible | Certaine | 🟢 Bas |

---

## 4. Ce qu'il ne faut PAS reproduire

1. **God-object Service Worker** : `background.js` à 1 431 lignes combine trop de responsabilités. Séparer en modules distincts (extraction, conversion, session, crawl, download).

2. **Coverage trompeuse** : Configurer `collectCoverageFrom` dans jest.config pour inclure tous les fichiers `js/*.js` même non importés dans les tests. La couverture affichée `100%` est une illusion.

3. **Duplication silencieuse** : La logique d'extraction existe deux fois. Refactoriser en une seule fonction partagée avec test explicite.

4. **Versions d'actions incohérentes** : Un seul workflow peut utiliser une version défectueuse et compromettre le release. Utiliser Dependabot pour synchroniser les versions.

5. **innerHTML sans DOMPurify** : Même pour du contenu "same-origin", ajouter une sanitization explicite avec DOMPurify ou équivalent pour les chemins critiques.

6. **Pas de linting dans CI** : L'absence d'ESLint permet aux déviations de style de s'accumuler. L'incohérence ES5/ES6 dans popup.js en est un symptôme.

---

## 5. Bonnes pratiques à adopter

1. **Architecture modulaire assumée** : La séparation `app-state.js`, `crawl-engine.js`, `cleanup-markdown.js` est une bonne pratique. À amplifier : `background.js` devrait être décomposé.

2. **State machine explicite** : `AppState` avec `STATES`/`TRANSITIONS` frozen est une excellente pratique. À reproduire pour tout workflow multi-état.

3. **Tests avec mock Chrome bien structuré** : Le `chrome-mock.js` dans `tests/setup/` est réutilisable et maintenable.

4. **Dependabot groupé** : Grouper les mises à jour (jest-*, actions-*) évite le bruit de PR. Bonne pratique à adopter.

5. **CSP stricte dès le départ** : `script-src 'self'; object-src 'self'` sans compromis. À maintenir.

6. **Convention de commits enforced** : Emoji + Conventional Commits dans le workflow CI (via `triage.yml`). Permet la génération de changelog automatique.

7. **Vendor lock-in conscient** : Les libs vendorisées sont protégées par un hook. Si on choisit de vendoriser, l'isolation explicite est correcte.

---

## 6. Recommandations priorisées pour le projet actuel

### 🔴 Critique

1. **Configurer `collectCoverageFrom` dans Jest pour inclure tous les modules JS** — La fausse confiance en `100% coverage` est plus dangereuse que l'absence de couverture affichée. Cibler 60%+ sur background.js avec des tests unitaires de handlers de messages.

### 🟠 Haut

2. **Corriger `actions/checkout@v6` → `@v4`** dans `release.yml` et `security.yml`. Utiliser Dependabot pour maintenir à jour.

3. **Ajouter ESLint** avec règles minimales (no-eval, no-implied-eval, no-new-func, no-undef) + règle de cohérence ES5/ES6 par dossier.

4. **Sanitizer explicite** pour les chemins `innerHTML` hors Readability — documenter ou ajouter DOMPurify léger.

### 🟡 Moyen

5. **Refactoriser la duplication d'extraction** dans `background.js` — extraire une fonction `buildContentHtml(doc, bodyClone, iframeContents)` partagée entre les deux chemins.

6. **Ajouter une automation de mise à jour des vendored libs** — script npm ou Dependabot custom pour Turndown/Readability.

7. **Supprimer `MIGRATION.md`** — La deadline était le 2026-05-13.

### 🟢 Bas

8. **Valider `sender.id` dans `onMessage`** si des messages inter-extensions sont possibles.

9. **Configurer `npx jest` → `jest` local** dans les scripts npm pour éviter le mismatch de version avec `npx`.

---

## 7. Score global

| Dimension | Score |
|---|---|
| Tests | ⭐⭐⭐½ |
| Documentation | ⭐⭐⭐⭐ |
| Robustesse | ⭐⭐⭐½ |
| Sécurité | ⭐⭐⭐½ |
| Dette technique | ⭐⭐⭐ |
| Dépendances | ⭐⭐⭐⭐ |
| CI/CD | ⭐⭐⭐⭐ |
| Pratiques qualité | ⭐⭐⭐ |
| **Moyenne** | **⭐⭐⭐½ (3.5/5)** |

**Verdict :** Projet correctement structuré pour une extension Chrome vanilla JS. Architecture claire, CI fonctionnelle, tests présents. Risques principaux : couverture trompeuse sur les fichiers critiques, god-object `background.js`, et incohérences de sécurité dans les workflows CI. Pas de bloqueur absolu pour un fork, mais les risques identifiés méritent une résolution avant de considérer le code comme production-ready pour un projet plus large.
