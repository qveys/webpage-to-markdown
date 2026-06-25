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
