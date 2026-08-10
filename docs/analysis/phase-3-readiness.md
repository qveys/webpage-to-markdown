# Readiness d'implémentation - Phase 3 (Amelia)
>
> **Auteur** : 🏗️ Winston (Architecte Système)
> **Cible** : Amelia (Lead Dev)
> **Statut** : Approuvé pour démarrage (infrastructure de test migrée).

## 1. Contexte & Alignement

Le projet a achevé son socle MV3 (Background + Side Panel). Contrairement aux rapports précédents, le **Service Worker est actif** et le **Side Panel est fonctionnel**.

## 2. Infrastructure de Test Standardisée (STORY-001)

L'infrastructure de test a été standardisée avec succès sur **Vitest** dans le cadre de [QUE-379](/QUE/issues/QUE-379).

### Statut actuel

- La dépendance `vitest` est installée dans `package.json`.
- Le script `npm test` utilise désormais Vitest pour exécuter l'ensemble des tests.
- Toutes les suites de tests unitaires ont été migrées vers la syntaxe ESM de Vitest.
- La CI passe à 100% avec le nouveau runner de tests.

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
- [ ] Confirmer le bon fonctionnement de `npm test` localement avec Vitest.
- [ ] Découpler la logique Turndown de `popup.js` pour la rendre réutilisable par le Side Panel via `src/core/turndown-service.js`.

---
*Ce document fait office de contrat technique pour la Phase 3.*
