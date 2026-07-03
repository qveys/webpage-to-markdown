# Contributing

Ce projet reste volontairement leger. L'objectif est de garder un flux simple, tracable et suffisant pour un projet solo ou une petite equipe.

## Branches

Utiliser le format `type/description-courte`.

Exemples :

- `feat/add-frontmatter-toggle`
- `fix/popup-copy-error`
- `docs/update-readme`
- `refactor/simplify-content-extractor`

Types conseilles :

- `feat` pour une nouvelle fonctionnalite
- `fix` pour une correction
- `docs` pour la documentation
- `refactor` pour un changement structurel sans changement fonctionnel
- `chore` pour la maintenance

## Commits

Utiliser le format `type: description`.

Exemples :

- `feat: add markdown frontmatter option`
- `fix: handle missing active tab`
- `docs: document popup reload workflow`

Regles pratiques :

- une intention claire par commit
- message court et lisible
- decrire le resultat, pas la session de travail

## BMAD simplifie

Le projet suit une version pragmatique de BMAD. On garde seulement le niveau de structure utile.

### 1. Brief

Avant de developper, clarifier :

- le probleme a resoudre
- l'utilisateur ou le contexte vise
- le perimetre et les non-objectifs

Pour les sujets un peu plus larges, s'appuyer sur les templates dans `docs/templates/bmad/`.

### 2. Requirements

Formaliser le comportement attendu :

- user stories ou cas d'usage
- criteres d'acceptation verifiables
- contraintes visibles pour l'utilisateur

Si une demande ne peut pas etre testee ou relue, elle n'est pas encore assez precise.

### 3. Solutioning

Avant une implementation non triviale, cadrer rapidement :

- approche technique choisie
- impact sur `manifest.json`, `src/popup/popup.html`, `src/popup/popup.js` et `src/popup/styles.css`
- risques, dette acceptee et points de retour arriere

Pas d'ADR lourd par defaut. Une note courte dans l'issue ou un document BMAD suffit.

### 4. Implementation

Pendant l'execution :

- garder des changements petits et reversibles
- tester le comportement touche
- mettre a jour la documentation si le flux utilisateur ou developpeur change

## Workflow de contribution

1. Partir d'une issue ou en creer une avec le bon contexte.
2. Ouvrir une branche au format `type/description-courte`.
3. Clarifier les criteres d'acceptation avant de coder.
4. Implementer avec le plus petit rayon d'explosion possible.
5. Verifier localement le comportement modifie.
6. Mettre a jour `README.md` ou la documentation si necessaire.
7. Produire des commits au format `type: description`.
8. Demander revue ou merger quand le scope et les criteres sont couverts.

## Qualité du Code & Linters (Markdown)

### Contexte et Objectif

Le projet `webpage-to-markdown` contient divers documents d'analyse, des guides techniques et des templates au format Markdown. Afin de garantir un formatage uniforme, de faciliter la lecture et d'éviter les régressions visuelles lors des contributions, nous utilisons **markdownlint-cli2** pour valider tous les fichiers `.md`.

### Justification de la Configuration et Dérogations

La configuration par défaut de markdownlint a été adaptée aux spécificités de ce dépôt existant via le fichier `.markdownlint-cli2.jsonc`. Voici les règles désactivées et leurs justifications :

- **MD013 (Line Length)** : Désactivée (`false`). Les documents du projet privilégient un retour à la ligne naturel (soft wrap) géré par l'éditeur de texte, plutôt que des retours à la ligne forcés à 80 caractères.
- **MD029 (Ordered List Prefix)** : Désactivée (`false`). Les rapports d'analyse utilisent parfois des listes ordonnées dont la numérotation continue à travers différents blocs ou sections (ex. 5, 6, 7, etc.), ce qui est interprété par défaut comme une erreur mais s'affiche correctement sur GitHub.
- **MD033 (Inline HTML)** : Désactivée (`false`). Utile pour intégrer des éléments HTML spécifiques dans les cellules de tableaux GFM (GitHub Flavored Markdown) au sein des documents d'analyse.
- **MD036 (No Emphasis as Heading)** : Désactivée (`false`). Les documents d'analyse utilisent couramment des textes en gras isolés (ex. **Description :**, **Preuve :**) pour structurer le contenu sans en faire des titres réels au sens HTML.
- **MD041 (First Line Heading)** : Désactivée (`false`). Les fichiers de template BMAD commencent par des blocs de citation (blockquotes) contenant des métadonnées par conception, et non par un titre de niveau 1.
- **MD060 (Table Column Style)** : Désactivée (`false`). Permet de conserver des styles de tableaux compacts et personnalisés déjà présents dans le dépôt, qui s'affichent correctement.

### Utilisation de l'outil

Pour valider et corriger les fichiers Markdown locaux, suivez ces étapes :

1. **Prérequis** : Assurez-vous d'utiliser Node.js version 22 ou supérieure (défini dans la propriété `engines` de `package.json`).
2. **Installation** : Installez les dépendances de développement du projet si ce n'est pas déjà fait :

   ```bash
   npm install
   ```

3. **Exécuter la vérification** : Pour lancer l'analyse sur l'ensemble des fichiers Markdown du projet (hors `node_modules` et `.paperclip`) :

   ```bash
   npm run lint:md
   ```

4. **Correction automatique** : Pour corriger automatiquement les erreurs de formatage simples (telles que les espaces en fin de ligne, les lignes vides superflues ou les espacements autour des titres) :

   ```bash
   npm run lint:md:fix
   ```

### Fichier de Configuration

Le comportement de l'outil est défini par le fichier de configuration `.markdownlint-cli2.jsonc` à la racine :

```jsonc
{
  "config": {
    "MD013": false,
    "MD029": false,
    "MD033": false,
    "MD036": false,
    "MD041": false,
    "MD060": false
  },
  "globs": [
    "**/*.md"
  ],
  "ignores": [
    "**/node_modules/**",
    "**/.paperclip/**"
  ]
}
```

## Verification locale

Pour ce projet, la verification minimale attendue est :

- recharger l'extension via `chrome://extensions/`
- ouvrir le popup
- executer une conversion sur une vraie page
- verifier les options touchees par le changement
- verifier `Copy` et `Download` si le changement les impacte

## Issue templates

Utiliser :

- `.github/ISSUE_TEMPLATE/feature.md` pour une fonctionnalite ou une amelioration
- `.github/ISSUE_TEMPLATE/bug.md` pour un bug ou une regression

Ces templates servent a conserver le contexte BMAD minimal : besoin, perimetre, contraintes et criteres d'acceptation.
