# Carte de chaleur : un type `heatmap` pour chart()

Opened: 2026-11-19
Updated: 2026-11-19
Author: agent:main (Syrtis)

## Le besoin
Syrtis a des **matrices de test** : les cas d'un scénario sont joués sur toutes les combinaisons de valeurs de quelques variables (un modèle, une température…). Le rapport d'une matrice (page du run, `front/pages/project/scenario/evaluation_run/show.html.twig` de l'api Syrtis) dessine aujourd'hui, pour **deux variables**, une courbe par valeur de la seconde, faute de mieux. La lecture naturelle est une **carte de chaleur** : une variable en abscisse, l'autre en ordonnée, chaque cellule colorée par le taux de réussite de la combinaison.

## À faire
Un type `heatmap` dans `ChartType` (`src/Enum/ChartType.php`) et dans `assets/components/chart/chart.ts`, sur ECharts (série `heatmap` + `visualMap`).

Forme des données proposée, dans l'esprit des autres types :

```
chart('heatmap', {
    x: ['gpt-4o-mini', 'gpt-4.1', 'gpt-5.5'],      // libellés des colonnes
    y: ['0', '0.5', '1'],                            // libellés des lignes
    values: [[x_index, y_index, value], ...],        // une cellule ; null = pas de donnée (case vide, hachée ou grisée)
}, {
    format: { style: 'unit', unit: 'percent', decimals: 0 },   // comme les autres types : tooltip et légende
    min: 0, max: 100,                                         // bornes de l'échelle ; par défaut, celles des valeurs
    scale: 'sequential' | 'diverging',                        // option ; séquentielle par défaut
    title: '…',
})
```

- Couleurs : une échelle tirée des tokens du design system (comme les catégories `--cat-<name>-9` le sont pour les séries), lisible en clair et en sombre ; la valeur écrite dans la cellule quand elle tient (petite grille), au survol sinon.
- Tooltip : « x · y : valeur formatée ».
- Une cellule cliquable serait un plus (un événement avec x et y) : Syrtis y ouvrirait les sessions de la combinaison. Pas bloquant.
- Documenter la forme dans le docblock de `ChartType` comme les autres.

## Usage côté Syrtis (fait par l'agent Syrtis une fois livré)
Dans le rapport d'une matrice à deux variables en mode « toutes les combinaisons » : `x` les valeurs de la première, `y` celles de la seconde, `values` le taux de réussite (0–100) de chaque combinaison, `null` pour une combinaison pas encore jugée. Les courbes groupées actuelles disparaissent.

## Hors périmètre
Le reste du rapport (tableau des combinaisons, frontière qualité / coût) ne change pas.

## Fait
- `ChartType::HEATMAP` (docblock), `chart.ts` : série `heatmap` d'ECharts et deux `visualMap` — la continue des valeurs (`min`, `max`, `scale` : l'accent pâle → plein en `sequential`, erreur → ligne → succès en `diverging`), une cachée pour les cases sans valeur (`null`, grisées, « — » au survol).
- Valeur écrite dans la case jusqu'à 64 cases, au survol au-delà ; tooltip « x · y » puis la valeur formatée (`format`).
- Clic : événement DOM `chart-cell` sur l'élément du graphique, `{ x, y, value }`.
- Options passées par `ChartExtension` (`min`, `max`, `scale`) ; doc `usage/overview` ; démo sur la page des graphiques (modèles × températures).
