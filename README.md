# On mange quoi ?

Le site de la famille pour arrêter de se demander quoi manger, et surtout quoi
acheter en conséquence. On coche les repas qu'on a envie de faire, le site
additionne tous les ingrédients et sort une liste d'épicerie classée dans
l'ordre des allées, en PDF ou à l'écran.

## Comment c'est organisé

Tout le site tient dans [docs/](docs/), le dossier que GitHub Pages sait
publier tel quel. Les trois fichiers YAML de [docs/data/](docs/data/)
contiennent tout le contenu, et c'est là qu'on modifie les choses :

| Fichier | Ce qu'il contient |
| --- | --- |
| [docs/data/recettes.yaml](docs/data/recettes.yaml) | Les 50 repas : nom, tags, portions, liste d'ingrédients avec quantités, note |
| [docs/data/ingredients.yaml](docs/data/ingredients.yaml) | Le rayon de chaque article (« persil » → légumes frais), nourriture ou non |
| [docs/data/meta.yaml](docs/data/meta.yaml) | L'ordre des rayons à l'épicerie et les groupes de tags des filtres |

La page elle-même : [index.html](docs/index.html) pour la structure,
[app.js](docs/app.js) pour toute la logique, [theme.css](docs/theme.css)
et [app.css](docs/app.css) pour l'allure. Tout ce dont la page a besoin est
embarqué dans [docs/lib/](docs/lib/) : js-yaml pour lire les YAML, jsPDF pour
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

Les alias `repas` et `bouffe` font exactement ça depuis n'importe où.

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

Le site est publié par GitHub Pages depuis le dossier `docs/` de la branche
`main` : un `git push` suffit à mettre la version en ligne à jour. Les filtres,
la compilation de la liste, le PDF et l'impression fonctionnent exactement
pareil qu'à la maison, tout se passe dans le navigateur.

En ligne, la page demande d'abord un mot de passe. C'est un écriteau, pas un
verrou : le site est fait de fichiers statiques, donc la vérification se fait en
JavaScript et les YAML restent atteignables à leur adresse directe. Ça suffit
pour que la page ne s'ouvre pas au premier venu, et c'est tout ce qu'on lui
demande. À la maison, sur le serveur local, la porte ne s'affiche pas.

L'autre différence : sans le serveur local, la page ne peut pas écrire sur le
disque. L'onglet **Gérer** reste utilisable pour bricoler, mais rien n'est
conservé au rechargement ; il propose de télécharger `recettes.yaml` et
`ingredients.yaml` mis à jour, qu'on dépose ensuite dans `docs/data/`. Les
vraies modifications de recettes se font à la maison, puis on pousse.

Un double-clic sur `docs/index.html` ne suffit pas : le navigateur refuse de
lire les YAML depuis `file://`. Il faut passer par le serveur, ou par le site
en ligne.

## Se servir de la page

**Choisir les repas.** Les tuiles ne portent que le nom du plat, pour voir toute
la carte d'un coup d'œil ; le détail (portions, tags, nombre d'ingrédients)
s'affiche en infobulle au survol. Les filtres de gauche se combinent de façon
naturelle : plusieurs tags d'un même groupe s'additionnent (soupe **ou** salade), et les
groupes se cumulent (soupe **et** végétarien). La recherche fouille aussi dans
les ingrédients, donc taper « saumon » sort tous les plats qui en contiennent.
Le bouton « Au hasard : 5 repas » tire au sort parmi ce qui est affiché, ce qui
est pratique un soir de panne d'inspiration.

Les repas cochés sont mémorisés dans le navigateur : on peut fermer l'onglet et
revenir, la sélection est toujours là.

**À ajouter quand même.** Sous les repas, une case sert à mettre sur la liste
ce qui ne vient d'aucune recette : le café, le savon, l'eau micellaire. Elle
propose tous les articles connus au fur et à mesure de la frappe, avec une
quantité facultative. Ces ajouts se rangent dans leur rayon comme le reste, et
se cumulent avec les recettes : deux oignons ajoutés à la main s'additionnent
aux quatre des recettes.

**La liste.** Elle se compile toute seule sous les repas. Chaque article porte
son total et, entre parenthèses, les plats qui le demandent, ce qui permet de
savoir quoi remplacer si on change d'idée dans l'allée. Trois sorties : le PDF
(deux colonnes, une case à cocher devant chaque article, la quantité en gras et
la provenance en petit au bout de la ligne), l'impression directe, et une copie
en texte brut à coller dans un message.

**Les quantités.** Elles s'écrivent entre parenthèses à la fin d'une ligne
d'ingrédient et sont toujours facultatives : `beurre (250 g)`, `oignon (2)`,
`lait (1 tasse)`, `ail (2 gousses)`. Le site les additionne d'une recette à
l'autre et convertit ce qui est convertible, en gardant l'unité de la recette
tant que tout le monde parle la même langue :

| Ce qui est écrit | Ce qui sort |
| --- | --- |
| 500 g + 750 g | 1,25 kg |
| 1 l + 750 ml | 1,75 l |
| 1 tasse + 1 tasse | 2 tasses |
| 2 c. à soupe + 1 c. à soupe | 3 c. à soupe |
| 1 boîte + 200 g | 1 boîte + 200 g |
| 250 g, et une recette sans quantité | 250 g + ? |

La tasse vaut 250 ml, la cuillère à soupe 15 ml, la cuillère à thé 5 ml, comme
d'habitude ici. Le `+ ?` signale qu'au moins une recette ne disait pas combien.
Une parenthèse qui ne commence pas par un chiffre appartient au nom, donc
`pâte brisée (surgelée)` reste entier.

Chaque ingrédient de la liste part avec un **crochet vert** : il est sur la
liste, on l'achète. Un clic le passe en **croix rouge** et barre la ligne :
c'est du déjà-vu au garde-manger, ça disparaît du PDF, de l'impression et du
texte copié. La ligne reste visible barrée à l'écran,
justement pour qu'on n'oublie jamais ce qu'on a écarté, et le compteur de
chaque rayon passe en « reste / total ». Le bouton **Tout remettre** annule
d'un coup. Ces marques sont mémorisées d'une visite à l'autre, pensez à les
remettre à zéro quand le garde-manger se vide.

La case **Économiser l'encre** sort le même PDF entièrement en noir sur blanc :
plus de bandeau plein ni de titres colorés, juste un filet sous le titre. Une
semaine de repas tient alors sur peu de pages, et l'imprimante ne dépense
presque rien. Le choix est mémorisé d'une fois à l'autre, et le fichier est
suffixé `-nb` pour ne pas se mélanger avec la version couleur.

Le corps de texte du PDF est volontairement grand, pour se lire à bout de bras
dans une allée sans chercher ses lunettes. Un seul chiffre le règle, la
constante `Z` au début de `construirePdf` dans `docs/app.js`.

**Gérer les recettes.** Le formulaire ajoute ou modifie un plat, avec un
aide-mémoire du format à côté. Si la recette introduit des ingrédients jamais
vus, la page le signale tout de suite.

**Gérer les ingrédients.** Le deuxième onglet de gestion sert à déclarer un
nouvel article et son rayon, et à corriger le rayon de ceux qui existent. Rien
n'oblige à ce que ce soit de la nourriture : le savon, le papier ou l'eau
micellaire se rangent dans « Soins et nettoyage » et se retrouvent sur la liste
comme le reste. Un article sans rayon n'est jamais perdu : il atterrit dans
« À classer », bien visible au bas de la liste.

## Ajouter des choses à la main

Un repas de plus dans `docs/data/recettes.yaml` :

```yaml
  - nom: Gratin de courgettes
    tags: [plat principal, été, four, végétarien]
    portions: 4
    ingredients:
      - courgettes (4)
      - crème 15% (200 ml)
      - gruyère râpé (150 g)
      - ail (2 gousses)
    note: Bien égoutter les courgettes, sinon c'est de la soupe.
```

Les tags viennent des `facettes` de `docs/data/meta.yaml` ; un tag inventé sur place
fonctionne quand même, il se retrouve simplement regroupé sous « Autres tags »
dans les filtres. Un ingrédient inconnu de `docs/data/ingredients.yaml` apparaît dans
« À classer », il suffit alors de lui choisir un rayon depuis l'onglet Gérer.

Pour changer l'ordre du PDF, on déplace les entrées de `rayons` dans
`docs/data/meta.yaml` : c'est cet ordre-là, et pas l'alphabet, qui décide de la
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
