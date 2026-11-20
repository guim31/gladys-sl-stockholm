// -----------------------------------------------------------------------------
// Texts sent from the container (feature names, action messages, widget
// contents, scene outputs), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted". Brand, line and place names never translate; the traffic
// messages come from SL in Swedish and are shown as they are.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Feature names (frozen when the device is created, in the configured language).
export const NAMES = {
  en: {
    next: 'Next departure',
    following: 'Following departure',
    delay: 'Delay',
    line: 'Line and destination',
    disruption: 'Disruption',
  },
  fr: {
    next: 'Prochain départ',
    following: 'Départ suivant',
    delay: 'Retard',
    line: 'Ligne et destination',
    disruption: 'Perturbation',
  },
  de: {
    next: 'Nächste Abfahrt',
    following: 'Übernächste Abfahrt',
    delay: 'Verspätung',
    line: 'Linie und Ziel',
    disruption: 'Störung',
  },
  es: {
    next: 'Próxima salida',
    following: 'Salida siguiente',
    delay: 'Retraso',
    line: 'Línea y destino',
    disruption: 'Incidencia',
  },
};

// SL transport modes (`transport_mode` of the API).
export const MODES = {
  en: {
    METRO: 'Metro',
    TRAIN: 'Commuter train',
    TRAM: 'Tram',
    BUS: 'Bus',
    SHIP: 'Boat',
    FERRY: 'Ferry',
    TAXI: 'Taxi',
  },
  fr: {
    METRO: 'Métro',
    TRAIN: 'Pendeltåg',
    TRAM: 'Tram',
    BUS: 'Bus',
    SHIP: 'Bateau',
    FERRY: 'Ferry',
    TAXI: 'Taxi',
  },
  de: {
    METRO: 'U-Bahn',
    TRAIN: 'Pendelzug',
    TRAM: 'Tram',
    BUS: 'Bus',
    SHIP: 'Schiff',
    FERRY: 'Fähre',
    TAXI: 'Taxi',
  },
  es: {
    METRO: 'Metro',
    TRAIN: 'Tren de cercanías',
    TRAM: 'Tranvía',
    BUS: 'Autobús',
    SHIP: 'Barco',
    FERRY: 'Ferry',
    TAXI: 'Taxi',
  },
};

export const TEXT = {
  en: {
    searchNeedText: 'Type a stop name, e.g. Slussen.',
    searchNone: ({ query }) => `No stop matches "${query}".`,
    searchFound: ({ count }) => `${count} stop(s) found:`,
    searchHint: 'To watch one, copy its number (in brackets) into "Add a stop".',
    addUnknown: ({ query }) => `SL knows no stop "${query}".`,
    addAmbiguous: 'Several stops match: use the number of the one you want.',
    addUnknownLines: ({ lines, available }) =>
      `Line(s) not served at this stop: ${lines}. Lines of the next 20 hours: ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `No departure towards "${direction}" in the next 20 hours. Destinations: ${available}.`,
    addUnknownMode: ({ mode }) =>
      `Unknown mode "${mode}": METRO, TRAIN, TRAM, BUS, SHIP, FERRY, TAXI or empty.`,
    added: ({ name }) => `${name} added.\nOpen the Discover tab to create its device.`,
    alreadyWatched: ({ name }) => `${name} is already watched with these filters.`,
    tooMany: ({ max }) => `You already watch ${max} stops, the maximum.`,
    removed: ({ name }) => `${name} is no longer watched. Delete its device in Gladys if you wish.`,
    removeUnknown: ({ query }) => `No watched stop matches "${query}".`,
    removeAmbiguous:
      'Several watched stops match: use the full name shown by "Show what is watched".',
    statusNone: 'No stop watched yet: use "Find a stop" then "Add a stop".',
    statusHeader: ({ count }) => `Watched stops: ${count}`,
    statusCreated: 'device created',
    statusNotCreated: 'device not created yet (Discover tab)',
    statusRefreshed: ({ age }) => `Last read from SL: ${age} s ago.`,
    statusNeverRefreshed: 'Not read from SL yet (only the created devices are read).',
    statusError: ({ error }) => `Last error: ${error}`,
    serviceDown: ({ error }) => `SL cannot be reached (${error}). Try again in a moment.`,
    now: 'now',
    in: ({ minutes }) => `in ${minutes} min`,
    inTwo: ({ first, second }) => `in ${first} and ${second} min`,
    nowThen: ({ second }) => `now, then in ${second} min`,
    noDeparture: 'No departure in the next 20 hours',
    cancelled: 'Cancelled',
    delayedNote: ({ delay }) => ` (${delay} min late)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} to ${destination} at ${stop}: ${when}`,
    nothingAt: ({ stop }) => `No departure from ${stop} in the next 20 hours.`,
    pickStop: 'Choose a stop in the widget settings.',
    loading: 'Departures are being read…',
    gone: 'This stop is no longer watched.',
    legend: 'Time · minutes · delay. Grey: timetable only.',
    unavailable: 'Departures not available yet, try again in a minute.',
  },
  fr: {
    searchNeedText: "Saisissez un nom d'arrêt, par exemple Slussen.",
    searchNone: ({ query }) => `Aucun arrêt ne correspond à « ${query} ».`,
    searchFound: ({ count }) => `${count} arrêt(s) trouvé(s) :`,
    searchHint: 'Pour en suivre un, copiez son numéro (entre crochets) dans « Ajouter un arrêt ».',
    addUnknown: ({ query }) => `SL ne connaît aucun arrêt « ${query} ».`,
    addAmbiguous: 'Plusieurs arrêts correspondent : utilisez le numéro de celui que vous voulez.',
    addUnknownLines: ({ lines, available }) =>
      `Ligne(s) absente(s) de cet arrêt : ${lines}. Lignes des 20 prochaines heures : ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `Aucun départ vers « ${direction} » dans les 20 heures. Destinations : ${available}.`,
    addUnknownMode: ({ mode }) =>
      `Mode « ${mode} » inconnu : METRO, TRAIN, TRAM, BUS, SHIP, FERRY, TAXI ou vide.`,
    added: ({ name }) => `${name} ajouté.\nOuvrez l'onglet Découverte pour créer son appareil.`,
    alreadyWatched: ({ name }) => `${name} est déjà suivi avec ces filtres.`,
    tooMany: ({ max }) => `Vous suivez déjà ${max} arrêts, le maximum.`,
    removed: ({ name }) =>
      `${name} n'est plus suivi. Supprimez son appareil dans Gladys si vous le souhaitez.`,
    removeUnknown: ({ query }) => `Aucun arrêt suivi ne correspond à « ${query} ».`,
    removeAmbiguous:
      'Plusieurs arrêts suivis correspondent : utilisez le nom complet affiché par « Voir ce qui est suivi ».',
    statusNone: 'Aucun arrêt suivi : utilisez « Chercher un arrêt » puis « Ajouter un arrêt ».',
    statusHeader: ({ count }) => `Arrêts suivis : ${count}`,
    statusCreated: 'appareil créé',
    statusNotCreated: 'appareil pas encore créé (onglet Découverte)',
    statusRefreshed: ({ age }) => `Dernière lecture d'SL : il y a ${age} s.`,
    statusNeverRefreshed: 'Pas encore lu chez SL (seuls les appareils créés sont lus).',
    statusError: ({ error }) => `Dernière erreur : ${error}`,
    serviceDown: ({ error }) => `SL est injoignable (${error}). Réessayez dans un instant.`,
    now: 'maintenant',
    in: ({ minutes }) => `dans ${minutes} min`,
    inTwo: ({ first, second }) => `dans ${first} et ${second} min`,
    nowThen: ({ second }) => `maintenant, puis dans ${second} min`,
    noDeparture: 'Aucun départ dans les 20 heures',
    cancelled: 'Supprimé',
    delayedNote: ({ delay }) => ` (${delay} min de retard)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} vers ${destination} à ${stop} : ${when}`,
    nothingAt: ({ stop }) => `Aucun départ de ${stop} dans les 20 heures.`,
    pickStop: 'Choisissez un arrêt dans les réglages du widget.',
    loading: 'Lecture des départs en cours…',
    gone: "Cet arrêt n'est plus suivi.",
    legend: 'Heure · minutes · retard. Gris : horaire théorique.',
    unavailable: 'Départs pas encore disponibles, réessayez dans une minute.',
  },
  de: {
    searchNeedText: 'Gib den Namen einer Haltestelle ein, z. B. Slussen.',
    searchNone: ({ query }) => `Keine Haltestelle passt zu „${query}“.`,
    searchFound: ({ count }) => `${count} Haltestelle(n) gefunden:`,
    searchHint:
      'Um eine zu verfolgen, kopiere ihre Nummer (in Klammern) in „Haltestelle hinzufügen“.',
    addUnknown: ({ query }) => `SL kennt keine Haltestelle „${query}“.`,
    addAmbiguous: 'Mehrere Haltestellen passen: nimm die Nummer der gewünschten.',
    addUnknownLines: ({ lines, available }) =>
      `Linie(n) hier nicht bedient: ${lines}. Linien der nächsten 20 Stunden: ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `Keine Abfahrt Richtung „${direction}“ in den nächsten 20 Stunden. Ziele: ${available}.`,
    addUnknownMode: ({ mode }) =>
      `Unbekanntes Verkehrsmittel „${mode}“: METRO, TRAIN, TRAM, BUS, SHIP, FERRY, TAXI oder leer.`,
    added: ({ name }) => `${name} hinzugefügt.\nÖffne den Tab „Entdecken“, um das Gerät anzulegen.`,
    alreadyWatched: ({ name }) => `${name} wird mit diesen Filtern schon verfolgt.`,
    tooMany: ({ max }) => `Du verfolgst schon ${max} Haltestellen, das Maximum.`,
    removed: ({ name }) =>
      `${name} wird nicht mehr verfolgt. Lösche das Gerät in Gladys, wenn du willst.`,
    removeUnknown: ({ query }) => `Keine verfolgte Haltestelle passt zu „${query}“.`,
    removeAmbiguous:
      'Mehrere verfolgte Haltestellen passen: nimm den vollen Namen aus „Verfolgte anzeigen“.',
    statusNone:
      'Noch keine Haltestelle: nutze „Haltestelle suchen“, dann „Haltestelle hinzufügen“.',
    statusHeader: ({ count }) => `Verfolgte Haltestellen: ${count}`,
    statusCreated: 'Gerät angelegt',
    statusNotCreated: 'Gerät noch nicht angelegt (Tab „Entdecken“)',
    statusRefreshed: ({ age }) => `Zuletzt bei SL gelesen: vor ${age} s.`,
    statusNeverRefreshed: 'Noch nicht bei SL gelesen (nur angelegte Geräte werden gelesen).',
    statusError: ({ error }) => `Letzter Fehler: ${error}`,
    serviceDown: ({ error }) =>
      `SL ist nicht erreichbar (${error}). Versuch es gleich noch einmal.`,
    now: 'jetzt',
    in: ({ minutes }) => `in ${minutes} Min.`,
    inTwo: ({ first, second }) => `in ${first} und ${second} Min.`,
    nowThen: ({ second }) => `jetzt, dann in ${second} Min.`,
    noDeparture: 'Keine Abfahrt in den nächsten 20 Stunden',
    cancelled: 'Fällt aus',
    delayedNote: ({ delay }) => ` (${delay} Min. Verspätung)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} nach ${destination} ab ${stop}: ${when}`,
    nothingAt: ({ stop }) => `Keine Abfahrt ab ${stop} in den nächsten 20 Stunden.`,
    pickStop: 'Wähle eine Haltestelle in den Widget-Einstellungen.',
    loading: 'Abfahrten werden gelesen…',
    gone: 'Diese Haltestelle wird nicht mehr verfolgt.',
    legend: 'Uhrzeit · Minuten · Verspätung. Grau: nur Fahrplan.',
    unavailable: 'Abfahrten noch nicht verfügbar, versuch es in einer Minute.',
  },
  es: {
    searchNeedText: 'Escriba el nombre de una parada, por ejemplo Slussen.',
    searchNone: ({ query }) => `Ninguna parada coincide con «${query}».`,
    searchFound: ({ count }) => `${count} parada(s) encontrada(s):`,
    searchHint: 'Para seguir una, copie su número (entre corchetes) en «Añadir una parada».',
    addUnknown: ({ query }) => `SL no conoce ninguna parada «${query}».`,
    addAmbiguous: 'Varias paradas coinciden: use el número de la que desea.',
    addUnknownLines: ({ lines, available }) =>
      `Línea(s) sin servicio en esta parada: ${lines}. Líneas de las próximas 20 horas: ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `Ninguna salida hacia «${direction}» en las próximas 20 horas. Destinos: ${available}.`,
    addUnknownMode: ({ mode }) =>
      `Modo «${mode}» desconocido: METRO, TRAIN, TRAM, BUS, SHIP, FERRY, TAXI o vacío.`,
    added: ({ name }) => `${name} añadida.\nAbra la pestaña Descubrir para crear su dispositivo.`,
    alreadyWatched: ({ name }) => `${name} ya se sigue con estos filtros.`,
    tooMany: ({ max }) => `Ya sigue ${max} paradas, el máximo.`,
    removed: ({ name }) => `${name} ya no se sigue. Elimine su dispositivo en Gladys si lo desea.`,
    removeUnknown: ({ query }) => `Ninguna parada seguida coincide con «${query}».`,
    removeAmbiguous:
      'Varias paradas seguidas coinciden: use el nombre completo que muestra «Ver lo que se sigue».',
    statusNone: 'Ninguna parada seguida: use «Buscar una parada» y luego «Añadir una parada».',
    statusHeader: ({ count }) => `Paradas seguidas: ${count}`,
    statusCreated: 'dispositivo creado',
    statusNotCreated: 'dispositivo aún no creado (pestaña Descubrir)',
    statusRefreshed: ({ age }) => `Última lectura de SL: hace ${age} s.`,
    statusNeverRefreshed: 'Aún no leído en SL (solo se leen los dispositivos creados).',
    statusError: ({ error }) => `Último error: ${error}`,
    serviceDown: ({ error }) =>
      `No se puede contactar con SL (${error}). Vuelva a intentarlo en un momento.`,
    now: 'ahora',
    in: ({ minutes }) => `en ${minutes} min`,
    inTwo: ({ first, second }) => `en ${first} y ${second} min`,
    nowThen: ({ second }) => `ahora, y luego en ${second} min`,
    noDeparture: 'Ninguna salida en las próximas 20 horas',
    cancelled: 'Cancelado',
    delayedNote: ({ delay }) => ` (${delay} min de retraso)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} hacia ${destination} en ${stop}: ${when}`,
    nothingAt: ({ stop }) => `Ninguna salida de ${stop} en las próximas 20 horas.`,
    pickStop: 'Elija una parada en los ajustes del widget.',
    loading: 'Leyendo las salidas…',
    gone: 'Esta parada ya no se sigue.',
    legend: 'Hora · minutos · retraso. Gris: solo horario teórico.',
    unavailable: 'Salidas aún no disponibles, vuelva a intentarlo en un minuto.',
  },
};

/** A text of `table` in `language` (English when missing), rendered with `params`. */
export function say(table, language, key, params = {}) {
  const entry = table[language]?.[key] ?? table.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

/** Every language of a text: a multi-language action message. */
export function sayAll(table, key, params = {}) {
  return Object.fromEntries(
    Object.keys(table).map((lang) => [lang, say(table, lang, key, params)]),
  );
}

/** The name of a transport mode ("rail" → "Train"), the raw mode when unknown. */
export function modeName(mode, language) {
  return (MODES[language] ?? MODES.en)[mode] ?? String(mode ?? '');
}
