# SL Stockholm

Les prochains départs de vos arrêts SL à Stockholm dans Gladys : métro, trains de banlieue
(pendeltåg), tram, bus et bateaux, avec retards, suppressions et messages de trafic, en temps réel.

Les données viennent de **SL** (Storstockholms Lokaltrafik), les transports publics de la région de
Stockholm, par ses API ouvertes publiées sur [Trafiklab](https://www.trafiklab.se) : **ni compte, ni
clé**. Cette intégration n'est affiliée ni à SL ni à Trafiklab.

## Ce que vous obtenez

- **Un appareil par arrêt suivi** (avec un filtre facultatif de lignes, de direction ou de mode) :
  prochain départ et départ suivant (minutes), retard du prochain départ (minutes), sa ligne et sa
  destination (texte), et la présence d'un message de trafic SL sur l'arrêt ou ses lignes (oui/non).
- **Un widget de tableau de bord** avec les prochains départs d'un arrêt : heure, minutes, retard,
  départs supprimés en rouge, messages de trafic en tête.
- **Quatre déclencheurs de scène** : c'est l'heure de partir, départ en retard, départ supprimé,
  nouvelle perturbation.
- **Une action de scène** qui lit les prochains départs d'un arrêt, avec une phrase prête à envoyer
  par message ou sur une enceinte.

## Prérequis

- Gladys Assistant 5.3.0 ou plus récent.
- Un accès à Internet depuis la machine de Gladys (l'intégration appelle
  `transport.integration.sl.se` et `deviations.integration.sl.se`).
- Un arrêt du réseau SL (comté de Stockholm). Les autres régions de Suède ne sont pas couvertes.

## Installation

1. Dans Gladys, ouvrez **Intégrations → Installer depuis GitHub**.
2. Collez `https://github.com/guim31/gladys-sl-stockholm` et installez.
3. Ouvrez l'onglet **Configuration** de l'intégration.

## Configuration

### Réglages

- **Langue des textes** : langue des noms de fonctionnalités (fixés à la création d'un appareil) et
  des phrases des scènes. SL écrit ses messages de trafic en suédois : ils sont montrés tels quels.
- **Fréquence de mise à jour** : 1 minute (par défaut) ou 2 minutes. Une requête par appareil créé ;
  les messages de trafic sont lus toutes les 5 minutes.

### Ajouter un arrêt

1. **Chercher un arrêt** : tapez un nom (`Slussen`, `Odenplan`…) ou son abréviation (`TCE`). La
   réponse liste les arrêts trouvés avec leur numéro, `Slussen [9192]` par exemple.
2. **Ajouter un arrêt** : tapez le numéro (ou le nom exact quand il est unique). Filtres facultatifs :
   - **Lignes** : `17, 18` ne garde que ces lignes (telles qu'écrites sur le véhicule : `43X`,
     `474`…). Elles sont vérifiées sur les départs des 20 prochaines heures.
   - **Direction** : `Hagsätra` ne garde que les départs dont la destination contient ce texte
     (accents et majuscules ignorés, `hagsatra` marche aussi), vérifiée sur les départs des 20 prochaines heures.
   - **Mode** : métro, pendeltåg, tram, bus ou bateau, pour les grands pôles.
3. Ouvrez l'onglet **Découverte** et ajoutez l'appareil à Gladys.

Le même arrêt avec d'autres filtres donne un autre appareil : ajoutez Slussen vers Hagsätra et
Slussen vers Åkeshov pour suivre les deux sens. Jusqu'à 10 arrêts.

### Retirer un arrêt, vérifier l'état

- **Retirer un arrêt** : tapez son nom tel que l'affiche l'état (`Slussen (17)`) ou son numéro. Son
  appareil reste dans Gladys jusqu'à ce que vous le supprimiez.
- **Voir ce qui est suivi** : les arrêts, l'existence de leur appareil, la dernière lecture de SL et
  la dernière erreur.

## Appareils

| Fonctionnalité       | Type              | Contenu                                                         |
| -------------------- | ----------------- | --------------------------------------------------------------- |
| Prochain départ      | durée (min)       | minutes avant le prochain départ maintenu (0 = part maintenant) |
| Départ suivant       | durée (min)       | minutes avant le suivant                                        |
| Retard               | durée (min)       | retard du prochain départ (0 à l'heure ou en avance)            |
| Ligne et destination | texte             | `17 → Åkeshov`                                                  |
| Perturbation         | binaire (oui/non) | un message de trafic SL concerne l'arrêt ou ses lignes          |

Les départs supprimés sont sautés par les comptes à rebours. Sans départ annoncé dans les 20 heures,
les comptes à rebours affichent 1440 minutes. Seuls les départs gardés par les filtres comptent. Un
message de trafic compte quand il nomme l'arrêt, ou une ligne suivie par le filtre ; les ascenseurs
et entrées fermés (importance la plus basse chez SL) sont écartés.

## Widget du tableau de bord

**Prochains départs** : choisissez un arrêt. Le widget affiche ses huit prochains départs (ligne,
destination, heure prévue, minutes, retard) : vert quand le décompte est en temps réel, orange à
partir de deux minutes de retard, rouge quand il est supprimé, gris pour un horaire théorique. La
légende affiche les messages de trafic de l'arrêt. Le titre est le nom donné à l'appareil dans
Gladys.

## Déclencheurs de scène

Chaque déclencheur peut se limiter à un arrêt et à une ligne (telle qu'écrite sur le véhicule, en
majuscules).

- **C'est l'heure de partir** : un départ part dans le nombre de minutes choisi (1 à 20). Une fois
  par départ, quand son compte à rebours atteint ce nombre. Un départ vu pour la première fois
  dans la fenêtre ne déclenche rien.
- **Départ en retard** : un départ a au moins le retard choisi (1 à 60 minutes). Une fois par départ
  et par seuil.
- **Départ supprimé** : un départ est supprimé. Une fois par départ.
- **Nouvelle perturbation** : un nouveau message de trafic concerne un arrêt ou l'une de ses lignes
  suivies. Une fois par message et par ligne.

Variables transmises à la scène : arrêt, ligne, mode (`METRO`, `TRAIN`, `TRAM`, `BUS`, `SHIP`),
destination, quai, heures prévue et estimée, minutes, retard ; pour une perturbation, son résumé et
ses détails (en suédois). Ce qui existe déjà au démarrage de l'intégration n'est pas annoncé ; les
suppressions et messages déjà annoncés ne le sont pas de nouveau après un redémarrage.

## Actions de scène

**Lire les prochains départs SL** : choisissez un arrêt, et facultativement une ligne. Sorties : une
phrase (`Métro 17 vers Åkeshov à Slussen : dans 3 et 8 min`), l'arrêt, la ligne, la destination,
les minutes d'attente, les minutes avant le suivant, le retard, l'heure prévue, le quai, le temps
réel (1/0), la perturbation (1/0). La phrase suit la langue de la configuration.

## Exemples de scènes

- **Partir pour le métro** : déclencheur « C'est l'heure de partir », arrêt Slussen (17), 7 min →
  envoyer « Ton métro part dans {{minutes}} min du quai {{platform}} » et faire clignoter l'entrée.
- **Point du matin** : à 7 h en semaine, action « Lire les prochains départs SL » → envoyer sa phrase
  sur l'enceinte de la cuisine.
- **Prévenir d'un bus supprimé** : déclencheur « Départ supprimé », arrêt T-Centralen (65) → envoyer
  un message avec la destination et l'heure prévue.

## Données, mise à jour et quotas

Les API SL de Trafiklab sont gratuites et sans clé. Elles répondent `429 Quota has been exceeded`
aux rafales de requêtes : l'intégration lit les arrêts l'un après l'autre, au plus une fois par
minute, uniquement pour les appareils créés dans Gladys, lit les messages de trafic toutes les
5 minutes et la liste des arrêts (1,6 Mo) seulement quand vous cherchez ou ajoutez un arrêt, gardée
une semaine dans `/data`. Les requêtes sont espacées, et une requête refusée est retentée deux fois. Les départs sont le temps réel de SL quand le véhicule est suivi, sinon l'horaire.

## Dépannage

- **Aucun appareil dans Découverte** : ajoutez d'abord l'arrêt, avec « Ajouter un arrêt ».
- **« SL est injoignable »** : la machine de Gladys n'a pas accès à Internet, SL est en panne, ou son
  quota est dépassé (HTTP 429). L'intégration réessaie à chaque mise à jour et signale le retour.
- **Un filtre de ligne est refusé** : la réponse liste les lignes vues à l'arrêt dans les 20
  prochaines heures ; tapez la ligne telle qu'écrite là.
- **Plusieurs arrêts ont le même nom** (`Slussen` et `Slussen (ersättningstrafik)`, l'arrêt des bus
  de remplacement) : utilisez le numéro donné par « Chercher un arrêt ».
- **Un déclencheur ne part pas** : vérifiez la ligne (exacte, en majuscules) et que l'appareil existe
  dans Gladys : seuls les appareils créés sont lus.

## Limites

- Développée sans habiter Stockholm, contre la vraie API de SL : vos retours sont les bienvenus.
- Les noms de fonctionnalités sont fixés à la création de l'appareil.
- Les messages de trafic sont en suédois, jamais traduits.
- SL renvoie les prochains départs de chaque ligne et direction sur 20 heures, pas tous : le widget
  et les comptes à rebours montrent les premiers, ce dont un tableau a besoin.
- SL seulement : ni les grandes lignes de SJ, ni les autres régions de Suède.

## Crédits

Données : SL, publiées sur [Trafiklab](https://www.trafiklab.se/api/our-apis/sl/). Inspirée de
l'intégration communautaire HASL pour Home Assistant et de l'intégration `gladys-entur`.
