# Application iOS « Webpage to Markdown »

## Résumé

Créer trois dépôts distincts :

- `qveys/webpage-to-markdown` : extension Chrome existante.
- `qveys/webpage-to-markdown-core` : moteur JavaScript partagé et indépendant des navigateurs.
- `qveys/webpage-to-markdown-ios` : application universelle iPhone/iPad, Share Extension et Safari Web Extension.

La v1 ciblera iOS/iPadOS 17+, sera distribuée publiquement sur l’App Store, fonctionnera sans serveur et sans compte. Les traitements resteront locaux. iCloud sera facultatif pour les réglages, l’historique et les fichiers Markdown, mais pas pour les assets ni les archives de crawl.

Chrome et Brave seront pris en charge via la feuille de partage. Safari bénéficiera en plus d’une véritable WebExtension capable de lire le DOM courant. Les pages authentifiées pourront être converties dans Safari ou dans le navigateur intégré à l’application.

## Architecture et interfaces

### Moteur partagé

Extraire dans `webpage-to-markdown-core` les composants sans dépendance `chrome.*` :

- Readability, Turndown, plugin GFM et licences associées.
- Nettoyage Markdown et génération du frontmatter.
- Résolution des URL, découverte des liens et calcul d’arborescence.
- Détection de CAPTCHA, pages bloquées et coquilles JavaScript vides.
- Validation des images et limites de taille.
- Options ATX/Setext, listes, blocs de code, assets et métadonnées.

Exposer une API JavaScript stable, versionnée par SemVer :

```text
convertHTML({ html, url, title, settings }) -> ConversionResult
convertDocument({ document, url, settings }) -> ConversionResult
discoverLinks({ html, url, scope, depth }) -> LinkResult[]
urlToPath(url) -> OutputPath
inspectResponse({ status, contentType, html }) -> PageDisposition
```

`ConversionResult` contiendra `schemaVersion`, `title`, `url`, `markdown`, `links`, `assets`, `warnings` et `diagnostics`.

Le core restera composé de scripts JavaScript directement chargeables, sans bundler nécessaire à l’exécution. Les deux dépôts consommateurs l’intégreront comme sous-module Git, verrouillé sur un tag et un SHA. Leur CI refusera un sous-module non initialisé ou une version de schéma incompatible.

Avant extraction, figer des fixtures et snapshots de référence. Les tests actuellement verts constitueront le minimum de non-régression. Les modifications non validées déjà présentes dans le worktree de l’extension devront être préservées et intégrées depuis une branche propre, sans reset destructif.

### Application native

Utiliser SwiftUI avec `WKWebView` pour iOS 17+ :

- iPhone : navigation par onglets.
- iPad : `NavigationSplitView`, dashboard et aperçu côte à côte.
- Sections : Bibliothèque, Navigateur, Crawl, Réglages.
- Cinq thèmes : Light, Dark, GitHub Dark, Monokai et AgentMesh.
- Localisation complète français/anglais.
- Interface Dynamic Type, VoiceOver, contrastes et navigation clavier iPad.

Le navigateur intégré fournira barre d’adresse, précédent/suivant, rechargement, ouverture externe, conversion, partage et session d’auto-capture. Son stockage de cookies restera propre à l’application : aucune tentative d’import des cookies de Chrome, Brave ou Safari.

Le moteur JavaScript sera chargé dans un monde WebKit isolé :

- conversion directe du DOM dans le navigateur intégré ;
- conversion du DOM Safari par content script ;
- pool limité de `WKWebView` invisibles pour convertir le HTML téléchargé par le crawl ou la Share Extension ;
- réseau parallèle configurable, conversion limitée à deux workers pour maîtriser la mémoire.

### Stockage et synchronisation

Utiliser un store Core Data en mode WAL dans un App Group partagé par les trois targets, plus un répertoire de documents dans le même conteneur.

Identifiants par défaut :

```text
Application : be.quentinveys.webpagetomarkdown
Safari      : be.quentinveys.webpagetomarkdown.safari
Partage     : be.quentinveys.webpagetomarkdown.share
App Group   : group.be.quentinveys.webpagetomarkdown
CloudKit    : iCloud.be.quentinveys.webpagetomarkdown
```

Modèles principaux :

- `ConversionRecord` : UUID, source, URL, titre, dates, état, Markdown, chemin local, assets, avertissements et erreur.
- `CaptureSession` : dossier, réglages, URLs vues, compteurs, état et dates.
- `CrawlJob` : URL initiale, portée, configuration, état, statistiques et journal.
- `CrawlItem` : URL, profondeur, état, tentatives, sortie et motif de blocage.
- `PendingImport` : URL partagée, application source, état rapide/interactif et erreur.
- `SettingsSnapshot` : réglages Markdown, capture, crawl, thème, langue et synchronisation.

Toutes les écritures venant des extensions seront transactionnelles. Les fichiers seront écrits atomiquement avant que l’enregistrement Core Data soit marqué comme terminé.

La synchronisation iCloud utilisera la base privée CloudKit :

- désactivée par défaut et activée explicitement ;
- synchronisation des réglages, métadonnées d’historique et Markdown sous forme de `CKAsset` ;
- union des historiques par UUID ;
- réglages résolus par dernière modification ;
- tombstones de suppression conservés 30 jours ;
- assets, cookies, journaux debug et archives ZIP toujours locaux ;
- désactiver iCloud conserve toutes les données locales.

### Contrat entre Safari et l’application

Tous les messages utiliseront :

```json
{
  "schemaVersion": 1,
  "requestId": "UUID",
  "type": "getSettings|capturePage|captureStatus|reportError",
  "payload": {}
}
```

Le content script Safari enverra le DOM converti à son background script, qui utilisera `sendNativeMessage`. Le handler natif enregistrera le résultat dans l’App Group et retournera le statut. L’app iOS ne pouvant pas pousser spontanément un message vers la WebExtension, l’extension demandera les réglages natifs avant chaque conversion ou au démarrage de session. [Architecture de messagerie Safari](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)

## Fonctionnalités par surface

| Fonction | Safari | Chrome/Brave | Application |
|---|---|---|---|
| Conversion de la page affichée | DOM direct | URL via Partager | DOM direct |
| Page connectée | Session Safari | Réouverture dans l’app requise | Session propre à l’app |
| Copie, aperçu, `.md` | Oui | Oui après conversion | Oui |
| Auto-capture | WebExtension activée | Non accessible par iOS | Navigateur intégré |
| Crawl multipage | Piloté dans l’app | URL initiale partageable | Complet |
| Assets et arborescence | Oui | Pages publiques | Oui |
| Historique | App Group | App Group | Bibliothèque complète |
| Synchronisation iCloud | Via l’app | Via l’app | Optionnelle |

### Conversion et export

Conserver la parité avec l’extension :

- Readability avec repli heuristique.
- Tables GFM, détails/summary, code avec langage, URL absolues et images dimensionnées.
- Frontmatter optionnel avec titre, URL et date.
- Copie presse-papiers, partage système et export `.md`.
- Export d’une session ou d’un crawl en ZIP contenant l’arborescence URL et les assets relatifs.
- Téléchargement sécurisé des images avec credentials omis, validation MIME/signature, SVG passif uniquement et limites actuelles de 10 Mo par asset/50 Mo par session, plafonnées à 100 Mo/1 Go.
- Historique conservé jusqu’à suppression manuelle, avec recherche, filtrage par source et vue du stockage utilisé.

Utiliser ZIPFoundation, verrouillé dans `Package.resolved`, uniquement pour produire des ZIP interopérables.

### Share Extension pour Chrome et Brave

La Share Extension acceptera une URL HTTP(S) :

1. Lire l’URL et le titre transmis par le navigateur.
2. Télécharger la page sans cookies, avec timeout de 15 secondes et limite HTML de 10 Mo.
3. Convertir immédiatement les pages publiques simples.
4. Enregistrer et afficher le succès avec actions Copier/Partager.
5. Placer automatiquement dans `PendingImport` les pages dynamiques, authentifiées, bloquées, trop lourdes ou interrompues.
6. L’application affichera une boîte de réception et proposera d’ouvrir ces URLs dans son navigateur intégré.

La Share Extension ne tentera pas de récupérer les cookies ou le DOM privé de Chrome/Brave et ne lancera pas de crawl long.

### Safari Web Extension

Adapter le manifest pour Safari avec permissions par site et `nativeMessaging`.

Fonctions :

- bouton Convertir et résultat rapide ;
- capture du DOM réellement affiché, y compris les pages authentifiées ;
- session d’auto-capture ;
- détection des navigations complètes, `pushState`, `replaceState`, `popstate` et fragments ;
- délai configurable de 500 ms à 10 s ;
- détection des doublons avec retour visuel vert/orange ;
- sauvegarde des assets et arborescence ;
- consultation des résultats dans l’application.

L’onboarding expliquera comment activer l’extension Safari et autoriser les sites nécessaires.

### Auto-capture et crawl

Reproduire la machine d’état actuelle :

```text
stopped -> running -> paused -> running -> completed/stopped
```

Le crawl conservera :

- même origine et préfixe de chemin ;
- profondeur 0 ou 1–5 ;
- concurrence configurable, valeur par défaut 3 ;
- délai par défaut 1 seconde ;
- FIFO, déduplication et exclusion des assets ;
- 403/429/CAPTCHA, pause après cinq blocages consécutifs ;
- pause, reprise, arrêt, retry individuel/global et dismiss ;
- dashboard temps réel, vitesse, durée, compteurs, journal et panneau debug ;
- checkpoint après chaque page et avant passage en arrière-plan ;
- restauration après fermeture forcée ou redémarrage de l’app.

Sur iOS 17–25, le crawl se suspend proprement lorsque l’application devient inactive et reprend au retour. Sur iOS 26+, utiliser conditionnellement `BGContinuedProcessingTask` pour poursuivre un crawl initié par l’utilisateur, tout en conservant exactement le même checkpoint de secours. [Documentation Apple](https://developer.apple.com/documentation/BackgroundTasks/performing-long-running-tasks-on-ios-and-ipados)

Les crawls utilisent toujours `credentials: omit`. Les sites nécessitant une connexion doivent passer par une session d’auto-capture dans le navigateur intégré ou Safari.

## Ordre d’implémentation

1. **Core partagé**
   - Créer le dépôt core, fixtures, snapshots et API versionnée.
   - Migrer l’extension Chrome vers le sous-module sans changement fonctionnel.
   - Obtenir les mêmes sorties Markdown et garder tous les tests verts.

2. **Fondations iOS**
   - Créer le projet Xcode, les trois targets, App Group, Core Data, services de fichiers et schémas de messages.
   - Ajouter thèmes, FR/EN, navigation adaptative et bibliothèque vide.

3. **Conversion native**
   - Intégrer le core dans WebKit.
   - Construire navigateur, conversion directe, aperçu, copie, export et historique.
   - Ajouter sessions d’auto-capture dans le navigateur intégré.

4. **Intégrations système**
   - Implémenter Share Extension avec conversion rapide et file d’attente.
   - Implémenter Safari Web Extension, permissions, native messaging et auto-capture.
   - Ajouter onboarding et diagnostic des permissions Safari.

5. **Crawl**
   - Porter queue, workers, portée, anti-bot, assets, persistance et dashboard.
   - Ajouter reprise après suspension, restauration après terminaison et tâche continue iOS 26.

6. **iCloud et finition**
   - Ajouter opt-in CloudKit, conflits, tombstones et fonctionnement hors ligne.
   - Finaliser recherche, stockage, ZIP, accessibilité, thèmes et localisation.

7. **Publication**
   - TestFlight interne puis externe.
   - Privacy Manifest : aucun tracking, aucune analytics et aucune transmission à un serveur tiers.
   - Politique de confidentialité publique expliquant le traitement local et l’opt-in iCloud.
   - Icônes App Store, captures iPhone/iPad, support URL, notes de licence et fiche App Store.
   - Soumission seulement après validation de la Safari Web Extension et des permissions HTTP(S).

## Tests et critères d’acceptation

- Tests core Node : sorties Markdown identiques sur les fixtures Chrome/iOS, URL, frontmatter, GFM, CAPTCHA, assets et sécurité.
- Tests Swift : state machines, Core Data concurrent, écritures atomiques, restauration, chemins, budgets, ZIP et conflits CloudKit.
- Tests réseau avec serveur fixture : redirections, HTTP, erreurs TLS, 401/403/429, contenu non HTML, timeout, pages JS et images invalides.
- Tests UI sur plus petit iPhone pris en charge, grand iPhone et iPad portrait/paysage.
- Tests manuels Safari, Chrome et Brave sur appareil réel.
- Test de suspension : crawl interrompu à chaque étape, application terminée, puis reprise sans doublon ni perte.
- Test iOS 26 : crawl continu en arrière-plan, expiration système et repli vers checkpoint.
- Test iCloud : activation, deuxième appareil, conflit, suppression, désactivation et mode hors ligne.
- Test accessibilité : VoiceOver, Dynamic Type maximal, contraste, Reduce Motion et clavier iPad.
- Tous les tests de l’extension existante restent verts après extraction du core.
- Une même fixture doit produire un Markdown identique dans Chrome, Safari, le navigateur intégré et le crawl.
- Depuis Chrome ou Brave, une page publique doit être convertie en une seule ouverture de la feuille de partage ; une page privée doit apparaître dans la file d’attente avec une explication claire.
- Aucun crawl, historique ou contenu ne quitte l’appareil hors synchronisation iCloud explicitement activée.

## Hypothèses verrouillées

- Application gratuite en v1, sans achat intégré, compte utilisateur, publicité ni analytics.
- Pas de backend, de proxy distant ou de crawl cloud.
- Pas de navigateur par défaut iOS en v1 ; le navigateur intégré sert uniquement à la capture et aux pages authentifiées.
- Minimum iOS/iPadOS 17, avec amélioration conditionnelle iOS 26.
- iPhone et iPad uniquement ; macOS est hors v1.
- Le Markdown peut être prévisualisé, copié et exporté, mais pas édité dans la v1.
- HTTP reste pris en charge avec avertissement visuel ; HTTPS est privilégié.
- Le contenu Chrome/Brave authentifié n’est jamais présenté comme capturable directement.
