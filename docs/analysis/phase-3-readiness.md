# Readiness d'implémentation - Phase 3 (Amelia)
>
> **Auteur** : 🏗️ Winston (Architecte Système)
> **Cible** : Amelia (Lead Dev)
> **Statut** : Approuvé pour démarrage après correction de l'infra de test.

## 1. Contexte & Alignement

Le projet a achevé son socle MV3 (Background + Side Panel). Contrairement aux rapports précédents, le **Service Worker est actif** et le **Side Panel est fonctionnel**.

## 2. Dette Technique Prioritaire (STORY-001)

Le système de test est actuellement fragmenté et empêche la validation automatique en CI.

### Problème

- `tests/markdown-utils.test.js` utilise **Vitest** (ESM).
- `tests/storage.test.js` utilise **node:test** (CommonJS via `require`).
- `package.json` lance `node --test` qui échoue sur les imports Vitest.

### Solution recommandée

1. **Standardisation Vitest** : Abandonner `node:test` au profit de Vitest pour tout le projet (meilleur support ESM et mocks Chrome API).
2. **Installation** : `npm install -D vitest`.
3. **Migration** : Convertir `storage.test.js` en ESM et utiliser les API Vitest (`describe`, `it`, `expect`).

## 3. Contrats API & Messaging (Phase 3)

Pour les prochaines stories, Amelia doit suivre le schéma de messaging suivant :

### Capture de page (Side Panel ↔ Background)

- **Message** : `{ type: 'CAPTURE_PAGE', tabId: number }`
- **Background** : Orchestre l'injection du Content Script, récupère le DOM, passe par `Readability.js`, puis retourne le Markdown.
- **Réponse** : `{ status: 'success', markdown: string } | { status: 'error', code: string }`

### Historique

- **Storage** : Utiliser `chrome.storage.local` avec la clé `conversionHistory`.
- **Modèle de données** :

  ```json
  {
    "id": "uuid",
    "timestamp": "iso-date",
    "title": "string",
    "url": "string",
    "content": "markdown-string",
    "flavor": "gfm|plain"
  }
  ```

## 4. Intégration Readability (STORY-002)

- Le fichier `lib/readability.js` doit être importé dans `src/core/page-extractor.js`.
- L'extracteur actuel (`page-extractor.js`) doit devenir un wrapper autour de Readability.

## 5. Check-list de démarrage pour Amelia

- [ ] Vérifier que `manifest.json` contient bien toutes les permissions nécessaires (`sidePanel`, `downloads`, `contextMenus`).
- [ ] Installer `vitest` et s'assurer que `npm test` passe à 100%.
- [ ] Découpler la logique Turndown de `popup.js` pour la rendre réutilisable par le Side Panel via `src/core/turndown-service.js`.

---
*Ce document fait office de contrat technique pour la Phase 3.*
