# Format d'un fichier scénario

Un scénario est un fichier JSON chargé par le MJ dans son navigateur. Exemple complet : `public/demo-scenario.json`, construit par `tools/build-demo.mjs`.

```jsonc
{
  "format": "jdr25d-scenario",
  "version": 1,
  "id": "mon-scenario",          // identifiant stable (sert à reprendre une partie)
  "title": "Titre",
  "parts": [ { "id", "title", "level", "summary", "intro", "gmNotes", "mapIds": [] } ],
  "maps": [ /* voir plus bas */ ],
  "locations": [ { "id", "partId", "mapId", "zone", "num", "name", "publicText", "readAloud", "gmNotes", "page" } ],
  "npcs": [ { "id", "name", "role", "publicText", "gmNotes", "partIds": [] } ],
  "clues": [ { "id", "partId", "kind": "indice|objet|document", "title", "text", "gmNotes" } ],
  "monsters": [ { "id", "name", "short", "stats": { "FOR": 0, ... }, "init", "def", "hp", "attacks": [ { "name", "bonus", "dmg" } ], "abilities": [], "tactics", "color" } ],
  "characters": [ /* personnages prétirés, voir la démo */ ]
}
```

- `publicText` : ce que les joueurs lisent une fois l'élément révélé.
- `readAloud` : texte d'ambiance que le MJ peut envoyer au journal d'un clic.
- `gmNotes` : jamais envoyé aux joueurs. Mise en forme simple : `## titre`, `- liste`, `**gras**`.

## Cartes

```jsonc
{
  "id": "village", "name": "Le village", "width": 30, "height": 20,
  "ambient": "day | dusk | night | dungeon",
  "terrain": ["....=....", ...],   // une chaîne par rangée, un caractère par case
  "zones":   ["aaaabbbb", ...],    // même taille : identifiant de zone de chaque case
  "zoneInfo": { "a": { "name": "La place", "nolabel": false } },
  "startZones": ["a"],              // zones visibles dès le début
  "start": [3, 4]                    // case d'arrivée des pions
}
```

Le brouillard fonctionne par zone (révéler un lieu révèle sa zone), avec des retouches case par case au pinceau.

### Légende du terrain

| Car. | Terrain | Car. | Terrain |
|---|---|---|---|
| `.` | herbe | `,` | sous-bois |
| `=` | chemin | `:` | pavés |
| `_` | plancher | `-` | dalles |
| `~` | eau | `m` | marais |
| `x` | fosse | `#` | mur |
| `H` | bâtiment (toit rouge) | `G` | grange |
| `K` | muraille de château | `^` | rochers |
| `\|` | palissade | `T` | arbre |
| `Y` | sapin | `"` | broussailles |
| `t` | tombe | `k` | sarcophage |
| `w` | puits | `+` | porte |
| `o` | champignons | `b` | lit |
| `c` | cage | `f` | feu |
| `A` | tente | `P` | pont |
| `s` | escalier | `r` | table / étal |
| `*` | cercle rituel | `S` | statue |
| `h` | foin | `n` | pierre blanche |
| ` ` (espace) | vide (rien n'est dessiné) | | |

Pour dessiner des cartes par programme : `tools/mapbuilder.mjs` (rectangles, chemins, maisons, pièces, dispersion d'arbres…).
