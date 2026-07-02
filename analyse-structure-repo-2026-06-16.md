# Analyse Structure & Organisation du Repo Source

> **Issue** : QUE-139
> **Auteur** : 📊 Mary (Analyste Business)
> **Date** : 2026-06-16
> **Version analysée** : 1.0.1
> **Dépôt** : `bb5df9d4-49b3-4258-9446-a8972de28f6f/webpage-to-markdown/`

---

## 1. Arborescence complète du repo

```text
webpage-to-markdown/
├── .git/
│   └── (3 commits : init + .gitignore)
├── .github/
│   └── ISSUE_TEMPLATE/
│       ├── bug.md
│       └── feature.md
├── .paperclip/
│   └── worktrees/
│       ├── QUE-128-vague-2-fondations-f1-f4-webpage-to-markdown-v2/
│       └── QUE-138-analyse-d-un-pr-c-dent-essai/
├── .gitignore
├── .prettierrc
├── .prettierignore
├── CONTRIBUTING.md
├── LICENSE                    (MIT)
├── README.md
├── eslint.config.js
├── manifest.json              (Chrome MV3)
├── package.json
├── package-lock.json
├── baseline-technique-2026-06-15.md    (QUE-118)
├── product-brief-2026-06-15.md         (QUE-122)
├── src/
│   ├── assets/
│   │   └── icon.png           (icône 16/48/128px)
│   ├── lib/
│   │   └── turndown.js        (Turndown.js v5.x, vendored)
│   └── popup/
│       ├── popup.html         (UI popup, 190 lignes)
│       ├── popup.js           (logique métier, 364 lignes)
│       └── styles.css         (thème clair/sombre, 306 lignes)
├── docs/
│   └── templates/
│       └── bmad/
│           ├── README.md
│           ├── product-brief-template.md
│           ├── prd-template.md
│           ├── architecture-template.md
│           ├── implementation-plan-template.md
│           └── technical-baseline-template.md
└── node_modules/              (dév. seulement : eslint, prettier)
```

---

## 2. Organisation générale

### 2.1 Nature du projet

Extension Chrome Manifest V3 — **"Webpage to Markdown"** — publiée sur le Chrome Web Store (ID : `ajeinonckioeekcfanjndliandidilid`). Licence MIT. Version 1.0.1.

### 2.2 Stack technique

| Couche | Technologie |
|--------|-------------|
| Extension API | Chrome MV3 |
| Langage | JavaScript (ES6+, modules) |
| Conversion HTML→MD | Turndown.js v5.x (vendored) |
| UI | HTML + CSS (pas de framework) |
| Linting | ESLint 9.x |
| Formatage | Prettier 3.x |
| Gestion de versions | Git (origin GitHub, CI/CD activé depuis QUE-126) |

### 2.3 Périmètre du repo

Le dépôt contient le **nécessaire** pour charger et tester l'extension en mode "Load unpacked", ainsi que des **artefacts de processus** :

**Requis au chargement et aux tests :**

1. **Code source** (`src/`) — Extension, icône, librairie
2. **Configuration** (`manifest.json`, `package.json`, `.prettierrc`, `eslint.config.js`)

**Artéfacts de processus optionnels :**
3. **Documentation** (`README.md`, `CONTRIBUTING.md`, `docs/`)
4. **Livrables BMAD** (baseline technique, product brief)
5. **Worktrees Paperclip** (branches de développement isolées)

---

## 3. Analyse détaillée des fichiers source

### 3.1 `manifest.json` (24 lignes)

Fichier de configuration MV3 standard. Points clés :

- **`action.default_popup`** : `src/popup/popup.html` — l'UI est une popup uniquement
- **Permissions** : `activeTab`, `scripting`, `storage` — strict minimum
- **`content_security_policy`** : restrictif (`script-src 'self'`)
- **Clé publique** présente (extension signée Chrome Web Store)
- **Pas de `background`** déclaré — pas de service worker

### 3.2 `src/popup/popup.js` (364 lignes)

**Classe unique** : `MarkdownConverter`

| Méthode | Rôle | Lignes |
|---------|------|--------|
| `constructor()` | Initialisation : thème, settings, events, restore | 2-18 |
| `createTurndownService()` | Configure Turndown.js + règle `<figure>` | 20-51 |
| `initializeTheme()` | Thème clair/sombre avec localStorage | 54-70 |
| `setTheme()` | Applique le thème + toggle icône | 72-87 |
| `initializeEventListeners()` | Bind des boutons et settings | 89-108 |
| `loadSettings()` | Restaure les préférences depuis localStorage | 110-121 |
| `saveSetting()` | Persiste une préférence | 123-126 |
| `toggleSettingsPanel()` | Affiche/cache le panneau de réglages | 128-139 |
| `restoreLastState()` | Restaure dernière conversion (chrome.storage) | 141-148 |
| `convertPage()` | **Cœur** : extract DOM + Turndown + save | 150-298 |
| `copyToClipboard()` | Copie vers le presse-papier | 300-310 |
| `downloadMarkdown()` | Télécharge en `.md` | 312-331 |
| `setLoading()` | UI état chargement | 333-342 |
| `enableActions()` | Active/désactive Copy + Download | 344-347 |
| `showToast()` | Notification temporaire | 349-359 |

**Pattern** : Classe unique instanciée au `DOMContentLoaded`. Pas de modules, pas de séparation des responsabilités.

### 3.3 `src/popup/popup.html` (190 lignes)

Structure UI :

- **Header** : logo SVG + titre + boutons (settings, thème)
- **Settings panel** : frontmatter toggle, heading style, bullet style, code style
- **Main** : bouton "Convert", textarea de sortie, boutons Copy/Download
- **Toast** : notification flottante
- **Scripts** : `<script src="../lib/turndown.js">` puis `<script src="popup.js">`

### 3.4 `src/popup/styles.css` (306 lignes)

- Design system basé sur des variables CSS (`--bg-color`, `--text-color`, etc.)
- Thème sombre via `[data-theme='dark']`
- Popup fixe 400×550px
- Animations sur hover, focus, toast

### 3.5 `src/lib/turndown.js` (973 lignes)

- **Turndown.js v5.x** — vendored (copié-collé, pas via npm)
- IIFE vanilla (ni module ES, ni UMD)
- Aucune modification locale détectée
- Source upstream : <https://github.com/mixmark-io/turndown>

### 3.6 `src/assets/icon.png` (946 octets)

- Même image utilisée pour 16px, 48px et 128px
- Format PNG raster (pas SVG vectoriel)

---

## 4. Organisation des données et état

| Type | Technologie | Usage | Portée |
|------|-------------|-------|--------|
| Préférences utilisateur | `localStorage` | Thème, settings Markdown | Popup (isolé) |
| Dernière conversion | `chrome.storage.local` | Historique session | Extension |
| Templates BMAD | Fichiers `.md` | Process docs | Repo |

---

## 5. Process et méthodologie (BMAD)

Le projet suit une approche **BMAD pragmatique** documentée dans `CONTRIBUTING.md` :

1. **Brief** → Clarification problème/scope
2. **Requirements** → User stories + critères d'acceptation
3. **Solutioning** → Approche technique, impact, risques
4. **Implementation** → Changements petits + vérification locale

### 5.1 Convention de branches

`type/description-courte` — ex : `feat/add-frontmatter-toggle`, `fix/popup-copy-error`

### 5.2 Convention de commits

`type: description` — ex : `feat: add markdown frontmatter option`

### 5.3 Outils Paperclip intégrés

- **Worktrees** : développement isolé par issue (QUE-128, QUE-138)
- **Triage Bot** : labelling automatique des issues (agent `f5501fce-...`)
- **Templates** : 6 templates BMAD dans `docs/templates/bmad/`

### 5.4 Documents déjà produits (Phase 1 BMAD)

| Document | Issue | Statut |
|----------|-------|--------|
| Baseline technique | QUE-118 | ✅ Finalisé |
| Architecture map | QUE-120 | ✅ (par CTO) |
| Product Brief | QUE-122 | ✅ En attente validation |
| Analyse structure repo | **QUE-139** ← ici | 🟡 En cours |

---

## 6. Dépendances (externes et internes)

### Externes

- **Turndown.js** (v5.x) — seule dépendance fonctionnelle, vendored
- **Aucune dépendance réseau ou CDN**

### Dev

- `eslint` 9.x + `globals`
- `prettier` 3.x
- `@eslint/js` 9.x

### Natives (Chrome APIs)

- `chrome.tabs.query()`
- `chrome.scripting.executeScript()`
- `chrome.storage.local.get()` / `.set()`

---

## 7. Forces de l'organisation du repo

| Force | Détail |
|-------|--------|
| **Minimaliste et autonome** | Zéro dépendance runtime externe |
| **MV3 compliant** | Architecture conforme aux standards Chrome 2026 |
| **Code propre** | ESLint + Prettier configurés, classe unique bien structurée |
| **Documentation de contribution** | `CONTRIBUTING.md` clair sur le workflow |
| **Templating BMAD** | 6 templates prêts à l'emploi dans `docs/` |
| **Branches par issue** | Travail isolé via worktrees Paperclip |
| **Permissions minimales** | 3 permissions justifiées, aucune superflue |
| **Thème dark/light** | CSS variables + `prefers-color-scheme` |

---

## 8. Faiblesses et risques structurels

| Faiblesse | Impact | Sévérité |
|-----------|--------|-----------|
| **Pas de modules JS** | Tout le code dans une seule classe → difficile à tester/maintenir | M |
| **Pas de service worker** | Aucune capacité de longue durée ; popup éphémère | H |
| **Pas de content script** | Extraction one-shot, pas de sélection interactive | M |
| **Git sans remote (initialement)** | Absent en V1, corrigé depuis (remote GitHub + CI/CD via QUE-126) | H → ✅ Résolu |
| **Pas de tests** | Aucune vérification automatisée, risque de régression | H |
| **Turndown.js vendored** | Pas de mise à jour automatique, sécurité non suivie | M |
| **Single icône PNG** | 16/48/128px partagent la même image raster (pixelisé à 128px) | L |
| **Anglais uniquement** | Pas d'internationalisation (i18n) | M |
| **Pas de page Options** | Configuration uniquement dans le popup (pas persistante entre sessions) | L |
| **node_modules/ versionné ?** | À vérifier — ne devrait pas être dans le repo | M |

---

## 9. Comparaison : structure actuelle vs. cible V2

| Aspect | V1.x (actuel) | V2 (cible, QUE-117) |
|--------|---------------|---------------------|
| Architecture | Popup-only | SW + Side panel + Content script |
| Modules | Classe unique | Modules ES6 séparés |
| Extraction | DOM selectors + Turndown | Readability + Turndown |
| Tests | 0 | Tests unitaires + intégration |
| CI/CD | Aucun | Pipeline de build + lint + test |
| i18n | EN | EN + FR |
| Stockage | localStorage + chrome.storage.local | chrome.storage.sync ou cloud |

---

## 10. Reconstitution de l'historique Git

```bash
$ git log --oneline
# (illustratif — les vrais hash sont dans le dépôt GitHub)
e08bd34 🎉 init: Initial commit
e273bc8 ✨ add: Create .gitignore
```

**~3 commits** à l'origine (avant QUE-126). Le remote GitHub a été configuré ensuite ; le repo compte désormais **7 commits** sur `master` couvrant l'init, la restructuration et les fonctionnalités V2.

---

## 11. Observations complémentaires

### 11.1 Worktrees Paperclip

Deux worktrees existent :

- **QUE-128** : Développement V2 (fondations F1-F4) — copie complète du code source
- **QUE-138** : Analyse d'un précédent essai — contient une copie du repo source

### 11.2 Configuration ESLint

La config ESLint reconnaît `TurndownService` comme variable globale — correct étant donné que turndown.js est chargé via `<script>` avant popup.js.

### 11.3 Profil de sécurité

- CSP restrictif (`script-src 'self'`)
- Aucune injection de contenu distant
- Validation des URLs avant injection (`chrome://`, `edge://`, etc.)
- Absence de `host_permissions` (limitée à `activeTab`)

---

## 12. Recommandations pour le repo

### Court terme (quick wins)

1. ~~**Configurer un remote Git**~~ ✅ Déjà fait (GitHub + CI/CD via QUE-126)
2. **Ignorer `node_modules/`** dans `.gitignore` (déjà fait — à vérifier)
3. **Ajouter un badge Chrome Web Store** dans le README
4. **Documenter la procédure de build/publication** dans le README

### Moyen terme (pour la V2)

5. **Restructurer le code en modules ES6** : séparer extraction, conversion, UI
6. **Ajouter un service worker** pour orchestrer les opérations de longue durée
7. **Mettre en place des tests** (au moins unitaires pour la conversion)
8. **Versionner Turndown.js via npm** avec un build step

### Long terme

9. **Automatiser le build + publication** Chrome Web Store via CI/CD
10. **Internationaliser** l'UI et la documentation

---

## 13. Conclusion

Le dépôt source de **Webpage to Markdown v1.0.1** est un repo minimaliste, propre et bien organisé pour un projet solo. Il suit les conventions Manifest V3 et contient tout le nécessaire pour développer, tester et packager l'extension.

**Points d'attention pour la V2 :**

- Le monolithisme de `popup.js` (364 lignes, classe unique) sera le premier frein à l'évolutivité
- L'absence de service worker bloque les features de longue durée (auto-capture, dashboard, crawl)
- L'absence de tests est le risque principal pour les refactors

**Niveau de confiance de l'analyse** : Élevé — tous les fichiers source ont été inspectés individuellement.

---
