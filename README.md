# On mange quoi ?

Le site de la famille pour arrêter de se demander quoi manger, et surtout quoi
acheter en conséquence. On coche les repas qu'on a envie de faire, le site
additionne tous les ingrédients et sort une liste d'épicerie classée dans
l'ordre des allées, en PDF ou à l'écran.

## Comment c'est organisé

Trois fichiers YAML dans [data/](data/) contiennent tout le contenu, et c'est
là qu'on modifie les choses :

| Fichier | Ce qu'il contient |
| --- | --- |
| [data/recettes.yaml](data/recettes.yaml) | Les 50 repas : nom, tags, portions, liste d'ingrédients, note |
| [data/ingredients.yaml](data/ingredients.yaml) | Le rayon de chaque ingrédient (« persil » → légumes frais) |
| [data/meta.yaml](data/meta.yaml) | L'ordre des rayons à l'épicerie et les groupes de tags des filtres |

La page elle-même est dans [web/](web/) : [index.html](web/index.html) pour la
structure, [app.js](web/app.js) pour toute la logique, [theme.css](web/theme.css)
et [app.css](web/app.css) pour l'allure. Tout ce dont la page a besoin est
embarqué dans [web/lib/](web/lib/) : js-yaml pour lire les YAML, jsPDF pour
fabriquer le PDF, et `polices.js` qui contient les deux polices du site
réduites au latin, pour que le PDF écrive « bœuf haché » correctement. Rien
n'est chargé depuis un serveur extérieur, à part les polices d'écran de Google
Fonts, dont l'absence est sans conséquence.

Enfin, [on-mange-quoi.py](on-mange-quoi.py) est le petit serveur qu'on lance à
la maison quand on veut modifier les recettes depuis la page plutôt que dans un
éditeur de texte.

## À la maison

```bash
cd on-mange-quoi
python3 on-mange-quoi.py
```

Le navigateur s'ouvre sur `http://127.0.0.1:5757/`. Aucune installation, aucun
`pip install` : le serveur n'utilise que la bibliothèque standard de Python 3.

Si le port est déjà pris, le script le dit et propose le suivant :

```bash
python3 on-mange-quoi.py --port 5758
```

Dans ce mode, la pastille en haut à droite affiche « ● serveur local » et
l'onglet **Gérer les recettes** peut réécrire les YAML directement (une copie
`.bak` est conservée à chaque enregistrement).

## En ligne

Le site marche aussi en pur statique : il suffit de servir le dossier du projet
tel quel (GitHub Pages, ou n'importe quel hébergement de fichiers). Les filtres,
la compilation de la liste, le PDF et l'impression fonctionnent pareil, tout se
passe dans le navigateur.

La seule différence : sans le serveur local, la page ne peut pas écrire sur le
disque. L'onglet **Gérer** reste utilisable, mais au lieu d'enregistrer il
propose de télécharger `recettes.yaml` et `ingredients.yaml` mis à jour, qu'on
dépose ensuite dans `data/`.

Un double-clic sur `web/index.html` ne suffit pas : le navigateur refuse de lire
les YAML depuis `file://`. Il faut passer par le serveur, ou par l'hébergement.

## Se servir de la page

**Choisir les repas.** Les filtres de gauche se combinent de façon naturelle :
plusieurs tags d'un même groupe s'additionnent (soupe **ou** salade), et les
groupes se cumulent (soupe **et** végétarien). La recherche fouille aussi dans
les ingrédients, donc taper « saumon » sort tous les plats qui en contiennent.
Le bouton « Au hasard : 5 repas » tire au sort parmi ce qui est affiché, ce qui
est pratique un soir de panne d'inspiration.

Les repas cochés sont mémorisés dans le navigateur : on peut fermer l'onglet et
revenir, la sélection est toujours là.

**La liste.** Elle se compile toute seule sous les repas. Chaque ingrédient
indique entre parenthèses les plats qui le demandent, ce qui permet de savoir
quoi remplacer si on change d'idée dans l'allée. Trois sorties : le PDF
(deux colonnes serrées, une case à cocher devant chaque article, la provenance
en petit au bout de la ligne), l'impression directe, et une copie en texte brut
à coller dans un message.

La case **Économiser l'encre** sort le même PDF entièrement en noir sur blanc :
plus de bandeau plein ni de titres colorés, juste un filet sous le titre. Une
semaine de repas tient alors couramment sur une seule page, et l'imprimante ne
dépense presque rien. Le choix est mémorisé d'une fois à l'autre, et le fichier
est suffixé `-nb` pour ne pas se mélanger avec la version couleur.

**Gérer les recettes.** Le formulaire ajoute ou modifie un plat. Si la recette
introduit des ingrédients jamais vus, la page le signale tout de suite, et la
carte de droite sert à leur attribuer un rayon. Un ingrédient sans rayon n'est
jamais perdu : il atterrit dans « À classer », bien visible au bas de la liste.

## Ajouter des choses à la main

Un repas de plus dans `data/recettes.yaml` :

```yaml
  - nom: Gratin de courgettes
    tags: [plat principal, été, four, végétarien]
    portions: 4
    ingredients:
      - courgettes
      - crème 15%
      - gruyère râpé
      - ail
    note: Bien égoutter les courgettes, sinon c'est de la soupe.
```

Les tags viennent des `facettes` de `data/meta.yaml` ; un tag inventé sur place
fonctionne quand même, il se retrouve simplement regroupé sous « Autres tags »
dans les filtres. Un ingrédient inconnu de `data/ingredients.yaml` apparaît dans
« À classer », il suffit alors de lui choisir un rayon depuis l'onglet Gérer.

Pour changer l'ordre du PDF, on déplace les entrées de `rayons` dans
`data/meta.yaml` : c'est cet ordre-là, et pas l'alphabet, qui décide de la
séquence sur la liste.

## D'où viennent les données

Les 50 plats reprennent la liste du document familial `Repas .docx` (Salades,
Soupes, Végétarien, Viande). Les rayons reprennent la liste d'épicerie type de
la famille, d'où le regroupement un peu particulier mais fidèle aux habitudes :
les bouillons et le vin avec les produits laitiers et boissons, les épices avec
les huiles, les œufs avec la viande.

Les listes d'ingrédients, elles, ont été remplies à partir des versions
classiques de chaque plat. Elles sont à relire et à ajuster : c'est exactement
ce à quoi sert l'onglet Gérer.
