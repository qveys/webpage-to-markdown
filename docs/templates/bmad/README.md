# Processus de Documentation BMAD

Ce dossier contient les templates de documentation pour le processus BMAD (Analyse, Planification, Solutioning, Implémentation) utilisé dans nos projets. Chaque phase du BMAD produit des artefacts spécifiques qui assurent la clarté, la traçabilité et la cohérence de nos développements.

## Les Phases BMAD

Le processus se décompose en quatre phases principales, chacune avec ses propres livrables.

### 1. Analyse (Briefing)

**Objectif** : Comprendre le "Pourquoi" et le "Quoi". Cette phase consiste à définir le problème, à analyser l'état existant et à esquisser la vision du produit.

**Livrables** :
- **Product Brief** (`product-brief-template.md`): Un document de haut niveau qui décrit le contexte métier, les objectifs, les non-objectifs, et les hypothèses. Il est généralement rédigé par un Analyste (Mary).
- **Technical Baseline** (`technical-baseline-template.md`): Un audit technique de l'état actuel du système. Il inventorie le code, l'architecture, les dépendances et les risques techniques.

### 2. Planification (Mapping)

**Objectif** : Définir le "Comment" d'un point de vue fonctionnel. Cette phase transforme la vision du Product Brief en exigences détaillées.

**Livrable** :
- **Product Requirements Document (PRD)** (`prd-template.md`): Un document qui détaille les features, les user stories, les critères d'acceptation, et les priorités. Il est la source de vérité pour l'équipe de développement et est généralement rédigé par un Product Manager (John).

### 3. Solutioning (Architecture)

**Objectif** : Concevoir la solution technique. Cette phase s'appuie sur le PRD pour définir l'architecture qui supportera les fonctionnalités requises.

**Livrable** :
- **Architecture Document** (`architecture-template.md`): Un document qui décrit l'architecture logicielle, les choix technologiques, les modèles de données, les flux de données, et les interfaces (API). Il est la responsabilité de l'Architecte (Winston).

### 4. Implémentation (Development)

**Objectif** : Construire et livrer la solution. Cette phase est celle du développement, des tests et du déploiement.

**Livrable** :
- **Implementation Plan** (`implementation-plan-template.md`): Un document qui décompose le travail de développement en tâches concrètes, estime les efforts et planifie les sprints ou les étapes de livraison. Il est souvent créé par un Tech Lead ou le CTO.

## Comment utiliser ces templates

1.  Choisissez le template correspondant à la phase et au livrable que vous devez produire.
2.  Copiez le contenu du template dans un nouveau document.
3.  Nommez le nouveau document de manière descriptive (par exemple, `product-brief-feature-X-AAAA-MM-JJ.md`).
4.  Remplissez les sections en suivant les instructions et les exemples fournis dans le template.
5.  Associez le document à l'issue Paperclip correspondante.
