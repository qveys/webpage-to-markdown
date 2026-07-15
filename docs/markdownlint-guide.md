# Guide Markdownlint

Ce document clarifie l'etat actuel de Markdownlint dans ce dépôt
et la facon recommandee de l'utiliser sans introduire
d'informations obsoletes.

## Etat actuel du depot

- Le depot contient beaucoup de documentation Markdown (`README.md`,
  `docs/`, templates GitHub, notes de migration).
- Le `package.json` ne declare actuellement **aucun** script `lint:md` ou `lint:md:fix`.
- Aucune configuration versionnee de type `.markdownlint.json`,
  `.markdownlint.yaml` ou `.markdownlint-cli2.jsonc` n'est presente
  a la racine du projet.
- Les verifications automatisees existantes portent aujourd'hui
  sur les tests Jest (`npm test`).

En conséquence, il ne faut pas supposer que Markdownlint fait déjà
partie de la toolchain locale ou de la CI.

## Pourquoi utiliser Markdownlint ici

Markdownlint reste utile pour :

- harmoniser les titres, listes et blocs de code ;
- détecter les erreurs de syntaxe Markdown les plus fréquentes ;
- limiter les regressions de formatage lors des mises a jour de la documentation.

## Utilisation recommandee

Si vous voulez verifier ponctuellement la documentation sans modifier
la configuration du projet, utilisez `npx` :

```bash
npx markdownlint-cli2 "**/*.md"
```

Pour tenter une correction automatique locale :

```bash
npx markdownlint-cli2 --fix "**/*.md"
```

Ces commandes telechargent l'outil a la demande si necessaire
et evitent de documenter des scripts npm inexistants.

## Bonnes pratiques pour ce depot

- Verifier en priorite les fichiers modifies plutot que tout le depot
  lors d'une petite contribution.
- Relire les corrections automatiques sur les listes, tableaux
  et blocs HTML inline avant de valider.
- Eviter d'imposer une mise en forme massive si elle n'apporte
  pas de valeur fonctionnelle ou documentaire.

## Si une integration permanente est ajoutee plus tard

Si le projet adopte officiellement Markdownlint plus tard,
la documentation devra être mise a jour en même temps que :

1. l'ajout de la dependance dans `package.json` ;
2. l'ajout des scripts npm associes ;
3. la creation d'un fichier de configuration versionne ;
4. l'éventuelle integration dans la CI.

Tant que ces éléments ne sont pas présents dans le dépôt,
la documentation doit rester descriptive et ne pas annoncer
une integration deja en place.
