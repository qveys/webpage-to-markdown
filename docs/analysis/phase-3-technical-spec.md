# Spécifications Techniques Détaillées — Phase 3
> **Auteur** : 🏗️ Winston (Architecte Système)
> **Statut** : DRAFT / En cours de validation
> **Projet** : Webpage to Markdown

## 1. Architecture du Système (MV3)

L'extension repose sur quatre piliers communicant par messages :

1.  **Background (Service Worker)** : Le chef d'orchestre. Gère les événements système (contextMenus, sidePanel).
2.  **Side Panel (UI)** : L'interface principale de contrôle et d'historique.
3.  **Content Script** : Injecté à la demande pour extraire le DOM.
4.  **Core Libs** : Logique de conversion (Turndown) et d'extraction (Readability) partagée.

### Diagramme de flux : Capture de page
```mermaid
sequence_level_diagram
Side Panel -> Background: { type: 'CAPTURE_PAGE', tabId: X }
Background -> Content Script: Execute Script (DOM extraction)
Content Script -> Background: { domContent: string }
Background -> Readability: parse(DOM)
Readability -> Background: { title, content, excerpt }
Background -> Turndown: convert(content)
Turndown -> Background: { markdown: string }
Background -> Storage: saveHistory({ title, url, markdown })
Background -> Side Panel: { status: 'success', data: { markdown, metadata } }
```

## 2. Modèles de Données

### Historique des Conversions (`chrome.storage.local`)
Clé : `conversion_history`
Type : `Array<ConversionEntry>`

```typescript
interface ConversionEntry {
  id: string;          // UUID v4
  timestamp: number;   // Unix timestamp
  url: string;         // URL source
  title: string;       // Titre de la page (via Readability)
  markdown: string;    // Contenu converti
  excerpt: string;     // Résumé court
  flavor: 'gfm' | 'plain';
  metadata: {
    wordCount: number;
    charCount: number;
  }
}
```

## 3. Contrats de Messaging

### Requêtes (de UI vers Background)
- `GET_HISTORY` : Récupère la liste des conversions.
- `DELETE_HISTORY_ITEM` : Supprime une entrée.
- `DOWNLOAD_MARKDOWN` : Déclenche le téléchargement via `chrome.downloads`.
- `CAPTURE_PAGE` : Initie le processus d'extraction.

### Événements (de Background vers UI)
- `HISTORY_UPDATED` : Notifie le Side Panel qu'une nouvelle conversion est disponible.

## 4. Découpage en Epics (Roadmap Amelia)

### EPIC-01 : Stabilisation de l'Infrastructure (P0)
*   **STORY-101** : Migration vers Vitest. Suppression de `node:test`.
*   **STORY-102** : Configuration du coverage et des mocks Chrome API dans Vitest.

### EPIC-02 : Moteur d'Extraction Robuste (P1)
*   **STORY-201** : Intégration de `@mozilla/readability`.
*   **STORY-202** : Refactoring de `src/core/page-extractor.js` pour utiliser Readability.

### EPIC-03 : Side Panel & Flux Asynchrone (P1)
*   **STORY-301** : Implémentation du flux `CAPTURE_PAGE` dans le Service Worker.
*   **STORY-302** : UI du Side Panel : Affichage du Markdown et boutons d'action (Copy/Download).

### EPIC-04 : Persistance & UX (P2)
*   **STORY-401** : Gestion de l'historique dans le Side Panel avec recherche.
*   **STORY-402** : Paramètres de "Flavor" Markdown persistants.

## 5. Recommandations de Sécurité
- **Sanitization** : Toujours nettoyer le DOM avant de le passer à Turndown pour éviter l'injection de scripts dans le Markdown (bien que le risque soit limité, c'est une bonne pratique).
- **Permissions** : Utiliser `activeTab` autant que possible au lieu de `<all_urls>` pour respecter le principe du moindre privilège.

---
*Ce document doit être validé par le CTO avant transmission à Amelia.*
