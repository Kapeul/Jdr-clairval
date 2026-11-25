// Génère public/demo-scenario.json : un mini-scénario original pour essayer la table.
// node tools/build-demo.mjs
import { writeFileSync } from 'node:fs'
import { MapBuilder } from './mapbuilder.mjs'

const b = new MapBuilder(30, 22, ',', 'f')
b.scatter(0, 0, 30, 22, 'Y', 0.35, 3, ',')
b.path([[0, 11], [9, 11], [15, 8], [22, 8]], '=', 2, 'r')
b.name('r', 'Le vieux chemin')
// clairière + puits
b.disc(9, 13, 4, '.', 'c').set(9, 13, 'w', 'c').name('c', 'La clairière')
b.house(5, 15, 3, 2, 'c', 'N')
// tour en ruine
b.room(20, 3, 7, 7, '-', 't').set(23, 9, '+', 't').set(21, 4, 's', 't').set(25, 7, 'k', 't').name('t', 'La tour du Corbeau')
b.scatter(20, 3, 7, 7, '^', 0.08, 7, '#')
// mare
b.disc(4, 4, 3, '~', 'm').name('m', 'La mare noire')
b.claim(0, 0, 30, 22, 'f', 'f')
b.name('f', 'Les bois')
const map = b.build({ id: 'demo-bois', name: 'Les bois du Corbeau', partId: 'p1', startZones: ['r'], start: [2, 11] })

const scenario = {
  format: 'jdr25d-scenario',
  version: 1,
  id: 'demo-corbeau',
  title: 'Démo : La tour du Corbeau',
  subtitle: 'Mini-scénario original pour tester la table (15 minutes)',
  parts: [
    {
      id: 'p1',
      title: 'La tour du Corbeau',
      level: 'Niveau 1',
      summary: "Un corbeau parlant a volé la clef de la meunière et s'est réfugié dans une tour en ruine au fond des bois.",
      intro: "La meunière vous a confié une mission simple : retrouver la clef de son moulin, volée ce matin par un corbeau… qui l'a insultée avant de s'envoler vers les bois.",
      gmNotes:
        "## Déroulé\n\n- Les héros suivent le vieux chemin.\n- Dans la clairière, une ermite indique la tour.\n- Dans la tour, le corbeau garde la clef ; il négocie (une pomme suffit) ou appelle deux rats géants.\n\n## Astuce\n\nRévèle la clairière quand les joueurs avancent, puis la tour. Pose les rats en pions cachés et rends-les visibles au moment du combat.",
      mapIds: ['demo-bois'],
    },
  ],
  maps: [map],
  locations: [
    { id: 'l-chemin', partId: 'p1', mapId: 'demo-bois', zone: 'r', num: '1', name: 'Le vieux chemin', publicText: 'Un chemin envahi de racines qui s’enfonce dans les bois.', gmNotes: 'Rien de dangereux ici.' },
    { id: 'l-clairiere', partId: 'p1', mapId: 'demo-bois', zone: 'c', num: '2', name: 'La clairière', publicText: 'Une clairière avec un puits et une petite cabane.', readAloud: "Le chemin débouche sur une clairière ensoleillée. Une vieille femme tire de l'eau d'un puits.", gmNotes: "L'ermite Odile indique la tour contre un coup de main pour remonter son seau." },
    { id: 'l-tour', partId: 'p1', mapId: 'demo-bois', zone: 't', num: '3', name: 'La tour du Corbeau', publicText: 'Une tour effondrée couverte de lierre.', readAloud: 'Au sommet des pierres écroulées, un corbeau vous toise. Une clef brille dans son bec.', gmNotes: 'Test de CHA difficulté 10 pour négocier, sinon deux rats géants surgissent.' },
    { id: 'l-mare', partId: 'p1', mapId: 'demo-bois', zone: 'm', num: '4', name: 'La mare noire', publicText: 'Une mare sombre et silencieuse.', gmNotes: 'Fausse piste : des grenouilles.' },
  ],
  npcs: [
    { id: 'n-odile', name: 'Odile', role: 'Ermite de la clairière', publicText: "Une vieille femme bourrue mais serviable.", gmNotes: 'Connaît le corbeau, « un voleur de malheur ».', partIds: ['p1'] },
    { id: 'n-corbeau', name: 'Croâ', role: 'Corbeau parlant', publicText: 'Un corbeau insolent qui parle comme un notaire.', gmNotes: 'Adore les pommes. Cède la clef contre un cadeau.', partIds: ['p1'] },
  ],
  clues: [
    { id: 'c-plume', partId: 'p1', kind: 'indice', title: 'Une plume noire', text: 'Une grande plume de corbeau trouvée au bord du chemin, pointée vers le nord-est.' },
    { id: 'c-clef', partId: 'p1', kind: 'objet', title: 'La clef du moulin', text: 'Une grosse clef de fer, un peu tordue par un bec.' },
  ],
  monsters: [
    { id: 'm-rat', name: 'Rat géant', short: 'R', level: 'Niveau 1/2', stats: { FOR: -2, DEX: 2, CON: 0, INT: -4, SAG: 1, CHA: -4 }, init: 14, def: 13, hp: 5, attacks: [{ name: 'Morsure', bonus: 2, dmg: '1d4' }], abilities: [], tactics: 'Attaque le plus petit.', color: '#7d5a44' },
  ],
  characters: [
    {
      id: 'pc-brune', name: 'Brune', title: 'Guerrière humaine', hitDie: 'd10', hpLevel1: 12, def: 16, color: '#c0392b',
      stats: { FOR: [16, 3], DEX: [12, 1], CON: [14, 2], INT: [10, 0], SAG: [10, 0], CHA: [10, 0] },
      attackMods: { contact: 4, distance: 2 }, attacks: [{ name: 'Épée longue', bonus: 4, dmg: '1d8+3' }],
      armor: ['Cotte de mailles +5'], paths: [{ name: 'Voie du combat', ranks: [{ name: 'Coup puissant', text: '+2 aux DM une fois par combat.' }] }],
      equipment: ['Épée longue', 'Torche', 'Corde'], description: 'Une ancienne garde de la milice, franche et têtue.', meta: '28 ans',
    },
    {
      id: 'pc-pim', name: 'Pim', title: 'Voleur halfelin', hitDie: 'd6', hpLevel1: 7, def: 15, color: '#27ae60',
      stats: { FOR: [8, -1], DEX: [17, 3], CON: [12, 1], INT: [12, 1], SAG: [12, 1], CHA: [14, 2] },
      attackMods: { contact: 1, distance: 4 }, attacks: [{ name: 'Dague', bonus: 1, dmg: '1d4' }, { name: 'Fronde', bonus: 4, dmg: '1d4' }],
      armor: ['Cuir +2'], paths: [{ name: 'Voie du roublard', ranks: [{ name: 'Discrétion', text: '+2 aux tests de discrétion.' }] }],
      equipment: ['Dague', 'Fronde', 'Pomme'], description: 'Petit, vif, et toujours une pomme en poche.', meta: '31 ans',
    },
  ],
}

writeFileSync(new URL('../public/demo-scenario.json', import.meta.url), JSON.stringify(scenario))
console.log('public/demo-scenario.json écrit', JSON.stringify(scenario).length, 'octets')
