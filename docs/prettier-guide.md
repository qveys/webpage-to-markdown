# Guide technique : Configuration et utilisation de Prettier

Ce guide détaille la mise en place, la configuration et l'utilisation de **Prettier** au sein de ce dépôt pour assurer un style de code cohérent et automatisé.

---

## État actuel du dépôt

Prettier est entièrement configuré sur ce dépôt. Le formatage de l'ensemble des fichiers sources a été appliqué et validé : la commande de contrôle `npm run format:check` est désormais au vert (passante).

---

## Guide d'installation et de configuration (Checklist)

### 1. Choisir d'utiliser Prettier

_Justification :_ Garantir que le projet bénéficie d'un formatage de code cohérent et automatique, évitant ainsi les débats de style lors des revues de code et améliorant la collaboration au sein de l'équipe.

* **Action :** Valider l'utilisation de Prettier pour tous les fichiers JavaScript, HTML, CSS et JSON du dossier `src/`.

### 2. Installer Prettier comme dépendance de développement

_Justification :_ L'enregistrement de Prettier dans les dépendances de développement garantit que tous les développeurs et l'intégration continue utilisent exactement la même version de l'outil.

* **Action :** Exécuter la commande suivante à la racine du projet (Prettier est déjà présent dans le `package.json`) :

    ```bash
    npm install
    ```

    _(Pour ajouter manuellement Prettier dans un nouveau projet : `npm install --save-dev prettier`)_

### 3. Fichier de configuration Prettier

_Justification :_ Centraliser et standardiser les choix de style (quotes, indentations, points-virgules) pour tous les contributeurs du projet via un fichier versionné.

* **Action :** Configurer les règles dans le fichier `.prettierrc` à la racine :

    ```json
    {
      "singleQuote": true,
      "trailingComma": "none",
      "tabWidth": 4,
      "semi": true,
      "printWidth": 120
    }
    ```

  * `singleQuote: true` : Utilise des guillemets simples.
  * `trailingComma: "none"` : Pas de virgule traînante en fin d'objet/tableau.
  * `tabWidth: 4` : Indentation de 4 espaces.
  * `semi: true` : Ajoute des points-virgules en fin d'instructions.
  * `printWidth: 120` : Limite la longueur des lignes à 120 caractères.

### 4. Fichier d'exclusion Prettier

_Justification :_ Éviter que Prettier ne modifie des fichiers tiers (bibliothèques externes, dossiers de dépendances ou de métadonnées) dont le format d'origine doit être préservé.

* **Action :** Configurer les exclusions dans le fichier `.prettierignore` à la racine :

    ```text
    src/lib/
    node_modules/
    _metadata/
    ```

### 5. Ajouter les scripts de formatage au package.json

_Justification :_ Rendre les commandes de formatage et de vérification facilement mémorisables et exécutables pour tous les développeurs.

* **Action :** S'assurer de la présence des scripts suivants dans la section `scripts` du `package.json` :

    ```json
    "scripts": {
      "format": "prettier --write 'src/**/*.{js,html,css,json}'",
      "format:check": "prettier --check 'src/**/*.{js,html,css,json}'"
    }
    ```

  * `format` : Formate et écrit directement les modifications sur les fichiers cibles de `src/`.
  * `format:check` : Analyse et signale les fichiers non conformes, sans les modifier (utile pour l'intégration continue).

### 6. Intégration avec votre éditeur de texte (VS Code)

_Justification :_ Permettre un formatage automatique à chaque sauvegarde de fichier, rendant l'utilisation de Prettier transparente au quotidien.

* **Action :**
    1. Installez l'extension **Prettier - Code formatter** (`esbenp.prettier-vscode`).
    2. Activez le formatage à la sauvegarde dans vos paramètres utilisateurs ou créez un fichier `.vscode/settings.json` :

        ```json
        {
          "editor.defaultFormatter": "esbenp.prettier-vscode",
          "editor.formatOnSave": true
        }
        ```

### 7. Vérification de fonctionnement et commande de contrôle

_Justification :_ S'assurer que le code est conforme avant chaque commit ou validation finale de la Pull Request.

* **Action :**
    1. Pour tester la conformité du code sans le modifier :

       ```bash
       npm run format:check
       ```

    2. Si des erreurs de formatage sont détectées, appliquez le formatage automatique :

       ```bash
       npm run format
       ```

    3. _Note importante :_ La vérification finale dépend de l'état entièrement formaté du dépôt. Actuellement, tous les fichiers du dépôt respectent ces règles et la commande `npm run format:check` est passante (vert).

---

## Conclusion

L'utilisation conjointe de Prettier et d'un éditeur configuré permet de maintenir une base de code propre et harmonisée sans effort supplémentaire. N'oubliez pas d'exécuter `npm run format:check` avant de soumettre vos contributions pour valider que le style de code est respecté.
