# Analyse architecture et patterns du repo source

> **Issue** : [QUE-141](https://paperclip.qveys.cloud/QUE/issues/QUE-141)
> **Auteur** : CTO
> **Date** : 2026-06-26
> **Source analysée** : [`qveys/_previous_webpage-to-markdown`](https://github.com/qveys/_previous_webpage-to-markdown)
> **Origine** : export du document Paperclip `analysis`

---

## Résumé exécutif

Le repo analysé est une extension Chrome Manifest V3 très petite, organisée autour d'une seule surface UI (`src/popup/*`) et d'un seul module applicatif (`popup.js`). L'architecture actuelle convient à un prototype, mais pas encore à une V2 maintenable: logique produit, extraction DOM, conversion Markdown et gestion d'état UI sont concentrées dans une seule classe côté popup.

Point critique: l'extension référence `src/lib/turndown.js` depuis `src/popup/popup.html`, mais ce fichier n'existe pas dans le repo analysé. En l'état, la dépendance centrale de conversion Markdown manque, ce qui rend le flux principal probablement non fonctionnel au runtime malgré un lint vert.

## Architecture observée

- Runtime: Chrome Extension Manifest V3.
- Surface active: popup uniquement (`src/popup/popup.html`, `src/popup/popup.js`, `src/popup/styles.css`).
- Pas de background service worker, pas de content script persistant, pas de side panel, pas de couche domain séparée.
- Extraction du contenu: injection on-demand via `chrome.scripting.executeScript` depuis le popup dans l'onglet actif.
- Conversion Markdown: `TurndownService` attendu comme global navigateur.
- Persistance:
  - `localStorage` pour thème et settings.
  - `chrome.storage.local` pour la dernière conversion.

## Patterns techniques en place

### 1. Pattern monolithique côté popup

**Description**

Une classe `MarkdownConverter` orchestre tout:
- boot UI
- préférences
- injection script dans la page
- heuristiques d'extraction DOM
- conversion HTML -> Markdown
- persistance
- feedback utilisateur

**Preuve observée**

- Module principal: `src/popup/popup.js`
- Classe centrale: `MarkdownConverter`

**Intérêt pour le projet actuel**

Le pattern permet de livrer vite un MVP popup-only, avec une surface cognitive réduite.

**Recommandation d'adaptation**

Ne pas prolonger ce pattern en V2. Extraire rapidement les responsabilités en modules dédiés (`page-extractor`, `markdown-converter`, `export-store`, `popup-controller`).

### 2. Extraction ad hoc par heuristiques DOM

**Description**

Le code clone `document.body`, retire certains sélecteurs, puis tente de choisir un conteneur principal via une petite liste de sélecteurs (`main`, `article`, `.content`, etc.).

**Preuve observée**

- Logique injectée inline dans `chrome.scripting.executeScript`
- Sélecteurs principaux dans `src/popup/popup.js`

**Intérêt pour le projet actuel**

Pattern utile pour un MVP, car simple à maintenir et peu coûteux à implémenter.

**Recommandation d'adaptation**

Conserver le principe heuristique comme fallback, mais le compléter par une extraction plus robuste de type Readability et le sortir du contrôleur UI.

### 3. Injection de logique inline via `executeScript`

**Description**

L'algorithme d'extraction est défini directement dans la fonction injectée dans l'onglet.

**Preuve observée**

- `chrome.scripting.executeScript({ ..., func: () => { ... } })`
- Fichier: `src/popup/popup.js`

**Intérêt pour le projet actuel**

Très rapide pour un prototype, sans infrastructure supplémentaire ni content script dédié.

**Recommandation d'adaptation**

Éviter ce pattern comme fondation long terme. Séparer la collecte DOM de l'orchestration UI pour améliorer testabilité, réutilisation et débogage.

### 4. Gestion d'état locale hétérogène

**Description**

Le repo mélange `localStorage` et `chrome.storage.local` sans convention d'architecture formelle.

**Preuve observée**

- `localStorage` pour thème et settings
- `chrome.storage.local` pour `lastConversion`
- Fichier: `src/popup/popup.js`

**Intérêt pour le projet actuel**

Accepte une mise en œuvre rapide sans design de persistance préalable.

**Recommandation d'adaptation**

Normaliser la stratégie de stockage en V2, idéalement autour de `chrome.storage.local` avec schéma de données explicite et versioning si besoin.

## Forces

- Surface technique réduite, donc faible coût de reprise.
- Manifest MV3 propre et permissions limitées (`activeTab`, `scripting`, `storage`).
- CSP d'extension déclarée.
- Lint ESLint en place et vert.
- UX popup exploitable comme base de refonte.

## Faiblesses et risques

### Critique

- Dépendance manquante: `src/lib/turndown.js` absent alors que requis par `popup.html`.

### Élevé

- Architecture non modulaire: extraction, conversion, UI et persistance dans un seul fichier.
- Pas de stratégie de test visible pour les heuristiques d'extraction ou la conversion.
- `service.keep(['iframe', 'script', 'style'])` conserve des balises non éditoriales dans la conversion Markdown, ce qui risque de dégrader fortement la sortie.

### Moyen

- Heuristiques de nettoyage DOM limitées et codées en dur.
- Aucune couche de configuration/versioning de format d'export.
- `manifest.json` contient une clé d'extension (`key`) commitée. Ce n'est pas un secret applicatif classique, mais c'est un artefact de publication sensible à gouverner explicitement.
- README possiblement plus optimiste que l'état réellement exécutable du repo.

## Lecture CTO

Le repo source ressemble à un prototype fonctionnel ou semi-fonctionnel, pas à une base de produit prête pour une Phase 2 ambitieuse. La bonne nouvelle est que la taille est petite: une remise à plat incrémentale est moins coûteuse qu'un durcissement progressif du monolithe popup.

Le meilleur chemin n'est pas une réécriture totale immédiate, mais une extraction en modules stables:

- `page-extractor`
- `markdown-converter`
- `export-store`
- `popup-controller`

Cela permet de garder la même UX tout en rendant le coeur testable et extensible.

## Recommandations de découpage

### Pour Winston (Architecture)

- Définir une frontière claire entre collecte DOM, normalisation HTML et rendu Markdown.
- Spécifier quelle logique reste injectée dans la page et quelle logique revient dans l'extension.
- Normaliser la stratégie de stockage (`chrome.storage.local` vs autre).
- Décider si Turndown reste vendorié, bundlé ou remplacé.

### Pour Amelia (Dev)

- Restaurer ou rebundler la dépendance Markdown manquante.
- Extraire les heuristiques DOM hors du contrôleur UI.
- Ajouter un petit jeu de fixtures HTML et tests de non-régression sur la conversion.
- Corriger la politique de conservation des balises `script/style/iframe` selon le comportement produit souhaité.

## Conclusion

Le repo est une bonne source d'inspiration pour l'ergonomie du MVP et pour le flux `activeTab -> extract -> convert -> copy/download`, mais pas une architecture cible. Il faut l'utiliser comme référence comportementale, pas comme fondation technique directe.
