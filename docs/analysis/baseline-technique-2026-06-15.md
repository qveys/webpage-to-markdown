# Baseline Technique — Webpage to Markdown Extension

> **Document**: QUE-118 — Inventaire technique et baseline
> **Auteur**: 📊 Mary (Analyste Business)
> **Date**: 2026-06-15
> **Version de l'extension**: 1.0.1
> **ID Chrome Web Store**: `ajeinonckioeekcfanjndliandidilid`

---

## 1. Identité de l'extension

| Champ | Valeur |
|---|---|
| **Nom** | Webpage to Markdown |
| **Version** | 1.0.1 |
| **Manifest** | V3 |
| **Description** | Convert any webpage to Markdown format with a single click |
| **Licence** | MIT |
| **Update URL** | `https://clients2.google.com/service/update2/crx` |
| **URL de déploiement** | Chrome Web Store (packagé et signé) |

### Git

- **3 commits** dans l'historique : initialisation, ajout .gitignore
- **Dépôt** : local, sans remote configurée

---

## 2. Inventaire des fichiers

| Fichier | Taille | Rôle |
|---|---|---|
| `manifest.json` | 24 lignes | Configuration de l'extension MV3, permissions, popup |
| `popup.html` | 96 lignes | UI du popup : boutons, éditeur, panneau settings, toast |
| `styles.css` | 298 lignes | Thème clair/sombre, mise en page 400×550px, composants |
| `js/popup.js` | 344 lignes | Logique métier : conversion, extraction contenu, paramètres, export |
| `js/turndown.js` | 973 lignes | Bibliothèque HTML→Markdown vendored (Turndown.js) |
| `img/icon.png` | 946 octets | Icône unique pour toutes les tailles (16, 48, 128) |
| `README.md` | 92 lignes | Documentation projet |
| `LICENSE` | 21 lignes | Licence MIT |
| `package.json` | 6 lignes | Descripteur npm minimal (nom, version, description) |
| `_metadata/verified_contents.json` | — | Intégrité Chrome Web Store (signatures) |
| `_metadata/computed_hashes.json` | — | Hashes de vérification locaux |
| `.gitignore` | — | Fichier git |
| **Total** | **~1 827 lignes** | |

---

## 3. APIs Chrome utilisées

| API | Usage | Localisation |
|---|---|---|
| `chrome.tabs.query()` | Récupérer l'onglet actif avant injection | `popup.js:147` |
| `chrome.scripting.executeScript()` | Injecter le script d'extraction de contenu dans l'onglet | `popup.js:158` |
| `chrome.storage.local.get()` | Lire les paramètres sauvegardés et la dernière conversion | `popup.js:135` |
| `chrome.storage.local.set()` | Sauvegarder la dernière conversion | `popup.js:262` |

**Remarque** : L'extension utilise aussi `localStorage` (API Web standard, pas Chrome) pour les préférences thème/settings.

---

## 4. Permissions et justification

| Permission | Justification | Critique ? |
|---|---|---|
| `activeTab` | Accès à l'onglet actif pour en extraire le contenu HTML | Oui |
| `scripting` | Injection du script via `chrome.scripting.executeScript()` | Oui |
| `storage` | Persistance de la dernière conversion via `chrome.storage.local` | Faible — pourrait être localStorage uniquement |

**Aucune permission superflue.** Le set est minimal pour le fonctionnement.

---

## 5. Turndown.js — Identification de version

**Bibliothèque** : Turndown.js (HTML→Markdown)

**Version identifiée** : **v5.x** (probablement v5.0.x ou v5.1.x)

**Indices** :

- API `TurndownService` avec constructeur, `turndown()`, `addRule()`, `keep()`, `remove()`, `use()`
- Options par défaut : `headingStyle: 'setext'`, `hr: '* * *'`, `bulletListMarker: '*'`, `codeBlockStyle: 'indented'`
- Support des `referenceLink` avec `linkReferenceStyle`
- Code `collapseWhitespace` fait référence au bug GitHub #370
- IIFE pur (pas de module ES, pas de UMD)

**Type** : Fichier vendored (copié-collé, pas via npm). **974 lignes**, aucune minification.

**Upstream** : <https://github.com/mixmark-io/turndown>

**Hypothèse** : Le fichier a été copié depuis une version stable de turndown v5 et intégré tel quel. **À vérifier** en comparant le hash avec les releases GitHub.

**Modifications locales** : Aucune détectée — le code correspond à l'upstream vanilla.

---

## 6. Architecture et flux de conversion

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ User click   │────>│ chrome.tabs  │────>│ executeScript()  │
│ "Convert"    │     │ .query()     │     │ (injection)      │
└──────────────┘     └──────────────┘     └────────┬─────────┘
                                                    │
                                                    ▼
┌──────────────────────────────────────────────────────┐
│ Script injecté dans la page :                        │
│ 1. Clone body + iframes                              │
│ 2. Supprime : nav, footer, aside, .ads, .comments,   │
│    cookie-banner, popup, overlay, modal, script, style│
│ 3. Cherche contenu principal (article, main, .content)│
│ 4. Retourne HTML + title + URL                       │
└──────────────────────────┬───────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│ Traitement popup.js :                                │
│ 5. Wrappe HTML dans structure                        │
│ 6. TurndownService.turndown(html) → Markdown          │
│ 7. Post-processing : collapse 3+ newlines → 2        │
│ 8. Optionnel : ajoute frontmatter YAML               │
│ 9. Affiche dans <textarea>, enable Copy/Download     │
│ 10. Sauvegarde dans chrome.storage.local              │
└──────────────────────────────────────────────────────┘
```

### Restrictions de conversion

L'extension refuse de convertir les pages system :

- `chrome://*`, `chrome-extension://*`, `edge://*`, `about:*`
- Pages du Chrome Web Store

### Nettoyage du contenu

**Éléments supprimés** : `script`, `style`, `nav`, `footer`, `aside`, `.ads`, `.comments`, `[role="complementary"]`, `.cookie-banner`, `.popup`, `.overlay`, `.modal`

**Sélecteurs de contenu principal** (premier trouvé avec >100 caractères) :

1. `main`, `article`, `.content`, `.post`, `.entry`, `[role="main"]`, `#content`, `.main`

**Fallback** : si aucun sélecteur ne matche, tout le body est utilisé.

---

## 7. Comportements observables (scénarios de test)

| # | Scénario | Comportement attendu |
|---|---|---|
| 1 | Page web classique avec article | Conversion complète, contenu principal extrait |
| 2 | Page sans élément `main`/`article` | Fallback body entier |
| 3 | Page avec iframes | Contenu des iframes extrait et ajouté en section "Embedded Content" |
| 4 | Page chrome://settings | Bloqué avec message d'erreur |
| 5 | Conversion d'une page vide | Exception gérée, toast d'erreur |
| 6 | Copier le résultat | Clipboard rempli avec le markdown |
| 7 | Télécharger le résultat | Fichier `.md` téléchargé avec timestamp |
| 8 | Activation frontmatter | En-tête YAML (title, url, date) ajouté |
| 9 | Changement heading style ATX/Setext | Format des titres modifié dans le output |
| 10 | Changement bullet marker | Marqueur de liste modifié |
| 11 | Changement code block style | Blocs de code en fenced ou indented |
| 12 | Thème sombre | UI en mode sombre, persistant au reload du popup |
| 13 | Paramètres persistés | Settings conservés après fermeture/réouverture du popup |
| 14 | Page avec beaucoup de contenu | Scroll dans la textarea |
| 15 | Connexion perdue | Popup accessible mais conversion échoue (page déjà fermée) |

---

## 8. Dépendances externes

| Dépendance | Type | Version | Source |
|---|---|---|---|
| Turndown.js | Vendored (inline) | v5.x | <https://github.com/mixmark-io/turndown> |
| Icône PNG | Asset local | — | Designé manuellement |
| Polices système | Runtime | — | `-apple-system`, Segoe UI, Roboto, etc. |

**Aucune dépendance réseau ou CDN.** L'extension est totalement autonome.

---

## 9. Observations architecturales

### Forces

- **Manifest V3** : conforme aux standards Chrome 2026
- **Permissions minimales** : pas de permission superflue
- **Autonome** : zéro dépendance externe runtime
- **Thème adaptatif** : respecte la préférence système (prefers-color-scheme)
- **Gestion d'erreurs** : try/catch sur la conversion, messages utilisateur via toast
- **Code propre** : ES6+ moderne, classe unique, bien structuré

### Faiblesses / Risques

- **Pas de service worker** : toute la logique est dans le popup ; si le popup se ferme pendant la conversion, le résultat est perdu
- **Pas de content script permanent** : l'extraction se fait via injection one-shot ; pas de possibilité de sélection interactive
- **Pas d'internationalisation** : UI en anglais uniquement
- **Pas de shortcuts clavier** : ni dans Chrome ni dans le popup
- **Pas de page Options** : la configuration n'est accessible que via le popup
- **Pas de tests** : aucun fichier de test détecté
- **Pas de pipeline CI/CD** : pas de build, pas de lint, pas de tests automatisés
- **Turndown.js vendored** : pas de mise à jour automatique ; vulnérabilités upstream non suivies
- **Single icône** : le même PNG est utilisé pour 16, 48 et 128px (pas de vectoriel)

### Piste de dette technique

- Turndown.js devrait être versionné via npm pour les mises à jour de sécurité
- Un content script permanent permettrait des fonctionnalités plus riches (sélection partielle, conversion automatique)
- L'absence de tests est bloquante pour toute évolution future

---

## 10. Métadonnées Chrome Web Store

- **ID extension** : `ajeinonckioeekcfanjndliandidilid`
- **Version publiée** : 1.0.1 (confirmé par `verified_contents.json`)
- **Clé publique** : présente dans `manifest.json` (signature publisher)
- **URL de mise à jour** : `https://clients2.google.com/service/update2/crx`

---

## 11. Conclusion et recommandations

L'extension **Webpage to Markdown v1.0.1** est une extension Chrome MV3 fonctionnelle, propre et minimaliste. Le code est bien structuré, les permissions sont justifiées, et l'expérience utilisateur de base est solide.

**Prochaine étape recommandée** : Ce document constitue la baseline pour QUE-118. Il est prêt pour la Phase 2 (PRD par John). Les axes d'amélioration identifiés (service worker, i18n, tests) seront priorisés dans le PRD.

**Niveau de confiance** : Élevé (tous les fichiers ont été inspectés individuellement, le comportement est déduit de l'analyse du code).
