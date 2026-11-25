# Table JDR 2.5D

Une table de jeu de rôle en ligne, dans le navigateur : cartes en perspective (2.5D), brouillard de guerre piloté par le MJ, pions, journal commun et dés partagés. Pas de compte, pas de serveur, pas d'installation pour les joueurs.

- **Vue MJ** : tout le scénario (notes secrètes, lieux, PNJ, indices, bestiaire), contrôle de ce que voient les joueurs, pions et points de vie, dés secrets.
- **Vue joueurs** : la carte telle que le MJ l'a dévoilée, les lieux/PNJ/indices découverts, le journal, les dés, sa fiche de personnage.
- **Synchro en temps réel** : connexion directe entre navigateurs (WebRTC). Le navigateur du MJ fait foi et n'envoie aux joueurs **que ce qui est révélé** : le scénario ne quitte jamais l'ordinateur du MJ.

## Jouer

1. Le MJ ouvre le site, clique **Charger un fichier scénario** et choisit son fichier `.json` (il reste dans son navigateur).
2. **Créer la table** : un code de 6 lettres apparaît. **Copier le lien joueurs** et l'envoyer à la table.
3. Chaque joueur ouvre le lien, entre son prénom et choisit son personnage.
4. Le MJ garde l'onglet ouvert pendant la partie (c'est lui qui relaie tout). La partie est sauvegardée dans son navigateur ; il peut la reprendre depuis l'accueil.

Côté MJ : outil **Zone** pour révéler une zone d'un clic, pinceaux **Révéler / Cacher** pour retoucher case par case, bouton **Montrer aux joueurs** pour changer la carte affichée, double-clic pour signaler un point. Bouton 💾 pour télécharger une sauvegarde.

Pour essayer seul : bouton **Essayer le scénario de démo**, puis ouvrir le lien joueurs dans un autre onglet. En ajoutant `?local` à l'adresse (ex. `…/jdr-clairval/?local#/`), les onglets d'un même navigateur se parlent sans réseau.

## Mettre en ligne (GitHub Pages, gratuit)

1. Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
2. Chaque envoi sur `main` construit et publie le site (onglet **Actions**). L'adresse est `https://<compte>.github.io/jdr-clairval/`.

## Développer

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

Code : React + TypeScript + Three.js (`@react-three/fiber`), réseau via [Trystero](https://github.com/dmotz/trystero) (signalisation par relais Nostr publics, puis WebRTC direct).

- `src/components/MapView.tsx` : rendu 2.5D des cartes, pions, glisser-déposer.
- `src/lib/state.ts` : état de partie, **`buildPlayerView`** (seule fonction qui décide de ce qui part chez les joueurs), actions autorisées des joueurs.
- `src/lib/net.ts` : connexion pair-à-pair ou locale.
- `docs/SCENARIO.md` : format des fichiers scénario et des cartes.

### Réseau

La connexion directe passe par des serveurs STUN publics. Sur certains réseaux très fermés (entreprise, 4G avec NAT strict) elle peut échouer ; on peut alors ajouter un serveur TURN au moment du build avec les variables `VITE_TURN_URL`, `VITE_TURN_USER`, `VITE_TURN_PASS`.

## Scénarios et droits

Ce dépôt ne contient **que le code** et un petit scénario de démonstration original. Les scénarios commerciaux (par exemple ceux de *Chroniques Oubliées Fantasy*, © Black Book Éditions) ne doivent pas être publiés ici : gardez votre fichier scénario pour vous, le dossier `scenarios/` est ignoré par git.
