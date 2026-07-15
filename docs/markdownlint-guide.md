# Guide Markdownlint

Ce document clarifie l'état actuel de Markdownlint dans ce dépôt
et la façon recommandée de l'utiliser sans introduire
d'informations obsolètes.

## État actuel du dépôt

- Le dépôt contient beaucoup de documentation Markdown (`README.md`,
  `docs/`, templates GitHub, notes de migration).
- Le `package.json` ne déclare actuellement **aucun** script `lint:md`
  ou `lint:md:fix`.
- Aucune configuration versionnée de type `.markdownlint.json`,
  `.markdownlint.yaml` ou `.markdownlint-cli2.jsonc` n'est présente
  à la racine du projet.
- Les vérifications automatisées existantes portent aujourd'hui
  sur les tests Jest (`npm test`).

En conséquence, il ne faut pas supposer que Markdownlint fait déjà
partie de la toolchain locale ou de la CI.

## Pourquoi utiliser Markdownlint ici

Markdownlint reste utile pour :

- harmoniser les titres, listes et blocs de code ;
- détecter les erreurs de syntaxe Markdown les plus fréquentes ;
- limiter les régressions de formatage lors des mises à jour
  de la documentation.

## Utilisation recommandée

Si vous voulez vérifier ponctuellement la documentation sans modifier
la configuration du projet, utilisez `npx` :

```bash
npx markdownlint-cli2 "**/*.md"
```

Pour tenter une correction automatique locale :

```bash
npx markdownlint-cli2 --fix "**/*.md"
```

Ces commandes téléchargent l'outil à la demande si nécessaire
et évitent de documenter des scripts npm inexistants.

## Bonnes pratiques pour ce dépôt

- Vérifier en priorité les fichiers modifiés plutôt que tout le dépôt
  lors d'une petite contribution.
- Relire les corrections automatiques sur les listes, tableaux
  et blocs HTML inline avant de valider.
- Éviter d'imposer une mise en forme massive si elle n'apporte
  pas de valeur fonctionnelle ou documentaire.

## Si une intégration permanente est ajoutée plus tard

Si le projet adopte officiellement Markdownlint plus tard,
la documentation devra être mise à jour en même temps que :

1. l'ajout de la dépendance dans `package.json` ;
2. l'ajout des scripts npm associés ;
3. la création d'un fichier de configuration versionné ;
4. l'éventuelle intégration dans la CI.

Tant que ces éléments ne sont pas présents dans le dépôt,
la documentation doit rester descriptive et ne pas annoncer
une intégration déjà en place.
