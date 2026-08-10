# Guide technique : Configuration et utilisation de Markdownlint

Ce guide detaille la mise en place, la configuration et l'utilisation de **Markdownlint** au sein de ce depot pour assurer la qualite et la coherence de la documentation en Markdown.

---

## Contexte et objectifs (Pourquoi Markdownlint ?)

Le projet `webpage-to-markdown` contient une quantite importante de documentation en Markdown (analyses de commits, architectures, specifications, templates de processus BMAD, etc.). Afin d'eviter la derive du style de documentation, l'introduction d'incoherences de formatage, et pour automatiser la detection des erreurs de syntaxe, nous avons integre l'outil **Markdownlint** (via `markdownlint-cli2`).

L'objectif de cette integration est de :

- Garantir une structure uniforme pour tous les fichiers `.md`.
- Eviter les regressions de formatage lors des contributions futures.
- Integrer des validations automatiques en integration continue (CI).

---

## Justification de la configuration et derogations aux regles

Nous utilisons une configuration personnalisee de Markdownlint definie dans le fichier `.markdownlint-cli2.jsonc`. Certaines regles par defaut de Markdownlint ont ete desactivees ou adaptees pour correspondre au style d'ecriture existant du depot et eviter des modifications de masse inutiles sur des fichiers deja conformes et lisibles.

Voici la liste des regles modifiees et leurs justifications :

### `MD013` (Line Length) : Desactivee (`false`)

- **Justification :** La documentation existante utilise un retour a la ligne naturel (soft wrapping) sans sauts de ligne forces. Imposer une limite stricte de 80 ou 120 caracteres par ligne necessiterait un reformatage massif de toute la prose, ce qui nuirait a la lisibilite et a l'historique git.

### `MD029` (Ordered list item prefix) : Desactivee (`false`)

- **Justification :** Les documents d'analyse du depot (notamment les syntheses de commits ou de structure) utilisent des listes ordonnees dont la numerotation se poursuit de maniere logique d'une section a l'autre (ex. 5, 6, 7...). Markdownlint impose par defaut de commencer chaque liste par `1.` ou d'avoir des chiffres croissants consecutifs stricts a partir de 1 dans chaque sous-bloc. La desactiver permet de conserver ce style de redaction qui s'affiche correctement sur GitHub.

### `MD033` (No Inline HTML) : Desactivee (`false`)

- **Justification :** L'usage de balises HTML en ligne est necessaire dans certains tableaux de nos documents d'analyse pour formater correctement les sauts de ligne ou inserer des badges/liens au format GitHub Flavored Markdown (GFM).

### `MD036` (No emphasis as heading) : Desactivee (`false`)

- **Justification :** Nos rapports d'analyse utilisent frequemment du texte en gras (ex. `**Description**`, `**Preuve**`) en guise de sous-titres visuels legers au sein de sections structurees. Cette mise en forme est intentionnelle et preferee a l'utilisation de titres de niveau 5 ou 6.

### `MD041` (First line in a file should be a top-level heading) : Desactivee (`false`)

- **Justification :** Nos fichiers de templates (dans `docs/templates/bmad/`) debutent par des blocs de citation (blockquotes) ou du frontmatter par conception, plutot que par un titre de niveau 1 (`#`).

### `MD060` (Table column style) : Desactivee (`false`)

- **Justification :** Les tableaux dans les analyses de commits existantes possedent des alignements et des styles de colonnes varies qui s'affichent parfaitement sur GitHub mais declenchent de fausses alertes sur Markdownlint.

---

## Guide d'installation et d'utilisation (Checklist)

Pour executer et utiliser Markdownlint sur le depot, suivez les etapes concises ci-dessous :

### Etape 1 : Installation des dependances

Installez les dependances de developpement du projet (Markdownlint y est deja inclus en tant que `markdownlint-cli2`).

```bash
npm install
```

### Etape 2 : Lancer la verification (Linting)

Pour analyser tous les fichiers Markdown du depot et detecter d'eventuelles erreurs :

```bash
npm run lint:md
```

### Etape 3 : Correction automatique des erreurs

Pour corriger automatiquement la majorite des erreurs de style (espaces superflus, lignes vides incorrectes, etc.) :

```bash
npm run lint:md:fix
```

---

## Fichiers de configuration et exemples de commandes

### Fichier `.markdownlint-cli2.jsonc` (Configuration finale)

Ce fichier est place a la racine du depot et regit le comportement de l'analyseur :

```json
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
    "node_modules",
    ".paperclip"
  ]
}
```

### Scripts definis dans le `package.json`

Les commandes de verification et de correction sont definies comme suit dans la section `scripts` du `package.json` :

```json
"scripts": {
  "lint:md": "markdownlint-cli2",
  "lint:md:fix": "markdownlint-cli2 --fix"
}
```
