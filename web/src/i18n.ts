// Croatian (original) and English UI text. Elements name their text with data attributes:
//   data-i18n="key"        -> textContent
//   data-i18n-title="key"  -> title
//   data-i18n-aria="k1 k2" -> aria-label (translations joined with spaces)
// so switching language just re-applies the dictionary to the page.

export type Lang = 'hr' | 'en';

const STRINGS = {
  'page.title': { hr: 'Simulacija semafora', en: 'Traffic light simulation' },
  'page.description': {
    hr: 'Simulacija rada semafora na raskrižju — Nikola Srdoč',
    en: 'Simulation of traffic lights at an intersection — Nikola Srdoč',
  },
  'scene.label': { hr: 'Raskrižje sa semaforima', en: 'Intersection with traffic lights' },
  'lang.label': { hr: 'Jezik', en: 'Language' },
  'fullscreen.enter': { hr: 'Cijeli zaslon (F)', en: 'Full screen (F)' },
  'fullscreen.exit': { hr: 'Izađi iz cijelog zaslona (F)', en: 'Exit full screen (F)' },

  'tipkalo': { hr: 'Tipkalo', en: 'Walk' },
  'tipkalo.wait': { hr: 'Čekajte…', en: 'Wait…' },
  'tipkalo.long': { hr: 'Tipkalo — zahtjev za pješake', en: 'Pedestrian button — request to cross' },
  'tipkalo.longWait': { hr: 'Zahtjev primljen — čekajte zeleno', en: 'Request received — wait for green' },

  'menu': { hr: 'Izbornik', en: 'Menu' },
  'menu.mode': { hr: 'Mod rada', en: 'Operating mode' },
  'mode.normal': { hr: 'Glavni prednost', en: 'Main road priority' },
  'mode.secondary': { hr: 'Sporedni prednost', en: 'Side road priority' },
  'mode.flashing': { hr: 'Policajac', en: 'Flashing yellow' },
  'menu.signal': { hr: 'Semafor:', en: 'Signal:' },
  'menu.open': { hr: 'Vrijeme otvorenosti:', en: 'Green time:' },
  'menu.closed': { hr: 'Vrijeme zatvorenosti:', en: 'Red time:' },
  'spinner.more': { hr: 'više', en: 'increase' },
  'spinner.less': { hr: 'manje', en: 'decrease' },
  'menu.apply': { hr: 'Prihvati', en: 'Apply' },
  'menu.traffic': { hr: 'Promet', en: 'Traffic' },
  'menu.traffic.unit': { hr: 'broj vozila', en: 'number of cars' },
  'traffic.count': { hr: '– broj vozila', en: '– number of cars' },

  'traffic.istok': { hr: 'Vozila istok', en: 'Cars from east' },
  'traffic.istok.desc': {
    hr: 'Vozila s istoka (glavna cesta, dolje desno)',
    en: 'Cars from the east (main road, bottom right)',
  },
  'traffic.sjever': { hr: 'Vozila sjever', en: 'Cars from north' },
  'traffic.sjever.desc': {
    hr: 'Vozila sa sjevera (sporedna cesta, gore desno)',
    en: 'Cars from the north (side road, top right)',
  },
  'traffic.zapad': { hr: 'Vozila zapad', en: 'Cars from west' },
  'traffic.zapad.desc': {
    hr: 'Vozila sa zapada (glavna cesta, gore lijevo)',
    en: 'Cars from the west (main road, top left)',
  },

  // Menu tabs and new controls
  'tab.signals': { hr: 'Semafori', en: 'Signals' },
  'tab.traffic': { hr: 'Promet', en: 'Traffic' },
  'tab.view': { hr: 'Prikaz', en: 'View' },
  'menu.control': { hr: 'Upravljanje', en: 'Control' },
  'control.fixed': { hr: 'Fiksni ciklus', en: 'Fixed cycle' },
  'control.demand': { hr: 'Na zahtjev (petlje)', en: 'On demand (loops)' },
  'control.actuated': { hr: 'Prilagodljivo', en: 'Actuated' },
  'control.queue': { hr: 'Najdulja kolona', en: 'Longest queue' },
  'control.hint': {
    hr: 'Fiksni: ciklus uvijek teče. Na zahtjev: stoji dok nitko ne čeka na crvenom. Prilagodljivo: zeleno se produljuje dok vozila pristižu, a skraćuje kad ih nema. Najdulja kolona: zeleno dobiva cesta s više vozila koja čekaju.',
    en: 'Fixed: the cycle always runs. On demand: it holds while nobody waits at red. Actuated: green is extended while cars keep coming and cut short when none do. Longest queue: the road with more waiting cars gets green.',
  },
  'menu.defaults': { hr: 'Zadano', en: 'Defaults' },
  'menu.defaults.hint': { hr: 'Vrati zadana vremena ovog moda', en: 'Restore this mode\'s default timings' },
  'timeline.label': { hr: 'Ciklus', en: 'Cycle' },
  'timeline.legend': {
    hr: 'žuto 2 s · crveno-žuto 1 s · sve crveno 1 s',
    en: 'yellow 2 s · red+yellow 1 s · all-red 1 s',
  },
  'timeline.flashing': { hr: 'Treptanje žutog — nema ciklusa', en: 'Flashing yellow — no cycle' },
  'timeline.preempted': { hr: 'Prednost hitnoj pomoći', en: 'Ambulance priority' },
  'timeline.aria': { hr: 'Vremenski dijagram ciklusa semafora 1-5', en: 'Cycle diagram of signals 1-5' },
  // Charts and export
  'chart.title': { hr: 'Statistika kroz vrijeme', en: 'Statistics over time' },
  'chart.note': {
    hr: 'Podaci za zadnju minutu, jedna točka svakih {n} s. Pređite mišem ili strelicama.',
    en: 'Figures for the last minute, one point every {n} s. Hover, or use the arrow keys.',
  },
  'chart.flow': { hr: 'Vozila u minuti', en: 'Cars per minute' },
  'chart.wait': { hr: 'Prosječno čekanje (s)', en: 'Average wait (s)' },
  'chart.queue': { hr: 'Vozila u koloni', en: 'Cars in queue' },
  'chart.cars': { hr: 'Vozila', en: 'Cars' },
  'chart.peds': { hr: 'Pješaci', en: 'Pedestrians' },
  'chart.keys': { hr: 'Strelice lijevo i desno čitaju vrijednosti.', en: 'Left and right arrow keys read the values.' },
  'chart.table': { hr: 'Tablica', en: 'Table' },
  'chart.charts': { hr: 'Grafikoni', en: 'Charts' },
  'chart.csv.series': { hr: 'Preuzmi niz (CSV)', en: 'Download series (CSV)' },
  'chart.csv.summary': { hr: 'Preuzmi sažetak (CSV)', en: 'Download summary (CSV)' },
  'chart.empty': { hr: 'Skupljam podatke… grafikon se dopunjuje svakih {n} s.', en: 'Collecting data… the chart fills in every {n} s.' },
  'chart.time': { hr: 'Vrijeme', en: 'Time' },
  'chart.col.carWait': { hr: 'Čekanje vozila (s)', en: 'Car wait (s)' },
  'chart.col.pedWait': { hr: 'Čekanje pješaka (s)', en: 'Pedestrian wait (s)' },
  'stats.charts': { hr: 'Grafikoni i izvoz…', en: 'Charts & export…' },
  'safety.overlap': {
    hr: 'Sukob: glavna i sporedna cesta su istodobno otvorene ({from}–{to} s).',
    en: 'Conflict: the main and side road are open at once ({from}–{to} s).',
  },
  'safety.tight': {
    hr: 'Manje od 1 s „sve crveno” između cesta ({from}–{to} s).',
    en: 'Less than 1 s of all-red between the roads ({from}–{to} s).',
  },
  'safety.range': { hr: 'Sigurno zeleno za semafor {n}: {min}–{max} s.', en: 'Safe green for signal {n}: {min}–{max} s.' },
  'safety.none': { hr: 'Za ovaj semafor nema sigurne vrijednosti.', en: 'There is no safe value for this signal.' },
  'safety.blocked': { hr: 'Prihvati je isključeno dok postoji sukob', en: 'Apply is off while there is a conflict' },
  'traffic.ped': { hr: 'Pješaci', en: 'Pedestrians' },
  'traffic.ped.desc': { hr: 'Pješaci koji sami dolaze i pritišću tipkalo (na minutu)', en: 'Pedestrians arriving and pressing the button on their own (per minute)' },
  'traffic.ped.unit': { hr: '– pješaka na minutu', en: '– pedestrians per minute' },
  'traffic.variety': { hr: 'Autobusi, kamioni, motori, bicikli', en: 'Buses, lorries, motorbikes, bicycles' },
  'traffic.drivers': { hr: 'Različiti vozači', en: 'Different drivers' },
  'traffic.drivers.hint': {
    hr: 'Svaki vozač ima svoju brzinu, ubrzanje, razmak i vrijeme reakcije; neki prolaze na žuto',
    en: 'Each driver has their own speed, acceleration, gap and reaction time; some go through on yellow',
  },
  'traffic.day': { hr: 'Dnevni ciklus', en: 'Day cycle' },
  'traffic.day.hint': {
    hr: 'Dan traje 24 minute: jutarnja i popodnevna gužva, mirna noć (noć se i vidi)',
    en: 'A day lasts 24 minutes: morning and afternoon rush, quiet night (and it gets dark)',
  },
  'traffic.rush': { hr: 'Špica', en: 'Rush hour' },
  'traffic.rush.hint': { hr: 'Dvostruko više vozila idućih 60 s (H)', en: 'Twice the traffic for the next 60 s (H)' },
  'traffic.rush.on': { hr: 'Špica…', en: 'Rush…' },
  'traffic.breakdown': { hr: 'Kvar', en: 'Breakdown' },
  'traffic.breakdown.hint': {
    hr: 'Automobil ispred raskrižja ostaje stajati 25 s i blokira traku (B)',
    en: 'A car before the junction breaks down and blocks its lane for 25 s (B)',
  },
  'traffic.emergency': { hr: 'Hitna pomoć', en: 'Ambulance' },
  'traffic.emergency.hint': {
    hr: 'Pošalji vozilo hitne pomoći; semafori mu daju zeleno (E)',
    en: 'Send an ambulance; the signals give it green (E)',
  },
  'view.weather': { hr: 'Vrijeme', en: 'Weather' },
  'weather.dry': { hr: 'Suho', en: 'Dry' },
  'weather.rain': { hr: 'Kiša', en: 'Rain' },
  'view.night': { hr: 'Noć', en: 'Night' },
  'view.night.auto': { hr: 'Noć (prati dnevni ciklus)', en: 'Night (follows the day cycle)' },
  'view.sound': { hr: 'Zvuk', en: 'Sound' },
  'view.stats': { hr: 'Statistika', en: 'Statistics' },
  'view.debug': { hr: 'Prikaz putanja (debug)', en: 'Show routes (debug)' },
  'view.copy': { hr: 'Kopiraj poveznicu', en: 'Copy link' },
  'view.copied': { hr: 'Kopirano!', en: 'Copied!' },
  'view.copy.hint': { hr: 'Poveznica s trenutnim postavkama', en: 'A link with the current settings' },
  'view.reset': { hr: 'Vrati sve', en: 'Reset all' },
  'view.reset.hint': { hr: 'Zadana vremena, promet i prikaz', en: 'Default timings, traffic and view' },

  'preset.label': { hr: 'Scenarij', en: 'Scenario' },
  'preset.hint': { hr: 'Gotov promet: količina vozila, pješaka, vrijeme i upravljanje', en: 'Ready-made traffic: cars, pedestrians, weather and control' },
  'preset.choose': { hr: 'Odaberi…', en: 'Choose…' },
  'preset.quiet': { hr: 'Mirna noć', en: 'Quiet night' },
  'preset.rush': { hr: 'Vršni sat', en: 'Rush hour' },
  'preset.event': { hr: 'Događaj (bočna cesta)', en: 'Event (side road)' },
  'preset.rain': { hr: 'Kišno jutro', en: 'Rainy commute' },
  'preset.school': { hr: 'Školska zona', en: 'School zone' },
  'file.save': { hr: 'Spremi u datoteku', en: 'Save to file' },
  'file.save.hint': { hr: 'Spremi postavke i vremena kao JSON', en: 'Save settings and timings as JSON' },
  'file.load': { hr: 'Učitaj datoteku', en: 'Load file' },
  'file.load.hint': { hr: 'Učitaj spremljeni scenarij', en: 'Load a saved scenario' },
  'file.bad': { hr: 'Ovo nije datoteka scenarija.', en: 'That is not a scenario file.' },

  // Toolbar
  'tool.pause': { hr: 'Pauza (razmaknica)', en: 'Pause (Space)' },
  'tool.play': { hr: 'Pokreni (razmaknica)', en: 'Play (Space)' },
  'tool.speed': { hr: 'Brzina simulacije (1–4)', en: 'Simulation speed (1–4)' },
  'tool.step': { hr: 'Jedan korak (.)', en: 'Step one frame (.)' },
  'tool.stats': { hr: 'Statistika (S)', en: 'Statistics (S)' },
  'tool.help': { hr: 'Pomoć (?)', en: 'Help (?)' },
  'tool.label': { hr: 'Upravljanje simulacijom', en: 'Simulation controls' },

  // Statistics
  'stats.title': { hr: 'Statistika', en: 'Statistics' },
  'stats.approach': { hr: 'Smjer', en: 'Approach' },
  'stats.flow': { hr: 'voz/min', en: 'cars/min' },
  'stats.flow.hint': { hr: 'Vozila kroz raskrižje u zadnjoj minuti', en: 'Cars through the junction in the last minute' },
  'stats.wait': { hr: 'čekanje', en: 'wait' },
  'stats.wait.hint': { hr: 'Prosječno / najdulje čekanje na crti zaustavljanja (s)', en: 'Average / longest wait at the stop line (s)' },
  'stats.queue': { hr: 'kolona', en: 'queue' },
  'stats.queue.hint': { hr: 'Vozila u koloni sada / najviše', en: 'Cars queueing now / most so far' },
  'stats.trend': { hr: 'zadnje 2 min', en: 'last 2 min' },
  'stats.istok': { hr: 'Istok', en: 'East' },
  'stats.sjever': { hr: 'Sjever', en: 'North' },
  'stats.zapad': { hr: 'Zapad', en: 'West' },
  'stats.total': { hr: 'Ukupno', en: 'Total' },
  'stats.peds': { hr: 'Pješaci čekaju', en: 'Pedestrian wait' },
  'stats.reset': { hr: 'Poništi', en: 'Reset' },
  'stats.compare': { hr: 'Usporedi i optimiraj…', en: 'Compare & optimise…' },
  'stats.close': { hr: 'Zatvori statistiku', en: 'Close statistics' },

  // Comparison dialog
  'bench.title': { hr: 'Usporedba upravljanja', en: 'Control comparison' },
  'bench.intro': {
    hr: 'Trenutne postavke (vremena, promet, pješaci, vozila) simuliraju se {n} minuta za svaki način upravljanja, s istim početnim slučajnim brojem.',
    en: 'The current settings (timings, traffic, pedestrians, vehicles) are simulated for {n} minutes with each control strategy, from the same random seed.',
  },
  'bench.run': { hr: 'Pokreni usporedbu', en: 'Run comparison' },
  'bench.running': { hr: 'Simuliram…', en: 'Simulating…' },
  'bench.strategy': { hr: 'Upravljanje', en: 'Control' },
  'bench.avgWait': { hr: 'Prosj. čekanje', en: 'Avg wait' },
  'bench.maxWait': { hr: 'Najdulje', en: 'Longest' },
  'bench.throughput': { hr: 'voz/min', en: 'cars/min' },
  'bench.maxQueue': { hr: 'Najdulja kolona', en: 'Longest queue' },
  'bench.pedWait': { hr: 'Pješaci čekaju', en: 'Ped. wait' },
  'bench.los': {
    hr: 'Razina usluge (A–F) prema prosječnom kašnjenju od {delay} s po sudioniku',
    en: 'Level of service (A–F) from the average delay of {delay} s per road user',
  },
  'bench.best': { hr: 'najbolje', en: 'best' },
  'bench.use': { hr: 'Koristi', en: 'Use' },
  'bench.minutes': { hr: 'Trajanje (min)', en: 'Length (min)' },
  'dialog.close': { hr: 'Zatvori', en: 'Close' },
  'bench.csv': { hr: 'Preuzmi rezultate (CSV)', en: 'Download results (CSV)' },

  // Analysis dialog: best timings
  'analysis.title': { hr: 'Analiza raskrižja', en: 'Intersection analysis' },
  'opt.title': { hr: 'Najbolja vremena', en: 'Best timings' },
  'opt.intro': {
    hr: 'Traži podjelu zelenog i duljinu ciklusa s najkraćim prosječnim čekanjem za trenutni promet (vozila, pješaci, vrijeme). Radi u pozadini; traje od desetak sekundi do minute, ovisno o uređaju.',
    en: 'Searches for the green split and cycle length with the shortest average delay for the current traffic (cars, pedestrians, weather). It runs in the background and takes ten seconds to a minute, depending on your device.',
  },
  'opt.run': { hr: 'Pronađi najbolja vremena', en: 'Find best timings' },
  'opt.cancel': { hr: 'Odustani', en: 'Cancel' },
  'opt.stage.coarse': { hr: 'Isprobavam duljine ciklusa i podjele', en: 'Trying cycle lengths and splits' },
  'opt.stage.fine': { hr: 'Fino podešavam najbolje', en: 'Fine-tuning the best few' },
  'opt.stage.verify': { hr: 'Provjeravam pobjednika na novim simulacijama', en: 'Checking the winner on fresh runs' },
  'opt.step': { hr: 'korak {i} od 3 · {p} %', en: 'step {i} of 3 · {p}%' },
  'opt.current': { hr: 'Trenutno', en: 'Current' },
  'opt.best': { hr: 'Najbolje', en: 'Best found' },
  'opt.col.main': { hr: 'Zeleno glavna', en: 'Main green' },
  'opt.col.side': { hr: 'Zeleno sporedna', en: 'Side green' },
  'opt.col.cycle': { hr: 'Ciklus', en: 'Cycle' },
  'opt.col.delay': { hr: 'Prosj. čekanje', en: 'Avg delay' },
  'opt.verdict.better': {
    hr: 'Prosječno čekanje pada s {a} s na {b} s ({p} % manje), potvrđeno na zasebnim simulacijama.',
    en: 'Average delay falls from {a} s to {b} s ({p}% less), confirmed on separate runs.',
  },
  'opt.verdict.same': {
    hr: 'Trenutna vremena su već blizu najboljih (razlika {p} %). Promjena nije potrebna.',
    en: 'The current timings are already close to the best found (within {p}%). No change needed.',
  },
  'opt.verdict.worse': { hr: 'Nijedna isprobana kombinacija nije bolja od trenutnih vremena.', en: 'None of the combinations tried beat the current timings.' },
  'opt.apply': { hr: 'Primijeni ova vremena', en: 'Apply these timings' },
  'opt.applied': { hr: 'Primijenjeno', en: 'Applied' },
  'opt.error': { hr: 'Pretraga nije uspjela. Pokušajte ponovno.', en: 'The search failed. Please try again.' },

  // Help
  'help.title': { hr: 'Pomoć i prečaci', en: 'Help and shortcuts' },
  'help.click': {
    hr: 'Klikni vozilo da ga pratiš (vidi brzinu i zašto stoji), klikni semafor 1-5 za njegova vremena. Prijeđi mišem preko semafora za stanje i odbrojavanje.',
    en: 'Click a car to follow it (see its speed and why it stops), click signal 1-5 for its timings. Hover a signal for its state and countdown.',
  },
  'key.space': { hr: 'Pauza / nastavak', en: 'Pause / resume' },
  'key.speed': { hr: 'Brzina 0,5× / 1× / 2× / 4×', en: 'Speed 0.5× / 1× / 2× / 4×' },
  'key.step': { hr: 'Jedan korak (u pauzi)', en: 'Step one frame (while paused)' },
  'key.fullscreen': { hr: 'Cijeli zaslon', en: 'Full screen' },
  'key.night': { hr: 'Noć', en: 'Night' },
  'key.rain': { hr: 'Kiša', en: 'Rain' },
  'key.sound': { hr: 'Zvuk', en: 'Sound' },
  'key.debug': { hr: 'Putanje i zone (debug)', en: 'Routes and zones (debug)' },
  'key.stats': { hr: 'Statistika', en: 'Statistics' },
  'key.charts': { hr: 'Grafikoni i izvoz', en: 'Charts and export' },
  'key.analysis': { hr: 'Usporedba upravljanja i optimizacija', en: 'Control comparison and timing search' },
  'key.emergency': { hr: 'Hitna pomoć', en: 'Ambulance' },
  'key.breakdown': { hr: 'Kvar automobila', en: 'Breakdown' },
  'key.rush': { hr: 'Špica', en: 'Rush hour' },
  'key.walk': { hr: 'Tipkalo', en: 'Walk button' },
  'key.help': { hr: 'Ova pomoć', en: 'This help' },
  'key.escape': { hr: 'Zatvori / prestani pratiti vozilo', en: 'Close / stop following a car' },

  // Signals: tooltips and announcements
  'signal.vehicle': { hr: 'Semafor {n}', en: 'Signal {n}' },
  'signal.pedestrian': { hr: 'Pješački semafor {n}', en: 'Pedestrian signal {n}' },
  'signal.turn': { hr: 'Strelica {n}', en: 'Turn arrow {n}' },
  'lamp.R': { hr: 'crveno', en: 'red' },
  'lamp.Y': { hr: 'žuto', en: 'yellow' },
  'lamp.G': { hr: 'zeleno', en: 'green' },
  'lamp.RY': { hr: 'crveno-žuto', en: 'red+yellow' },
  'lamp.*': { hr: 'treperi žuto', en: 'flashing yellow' },
  'lamp.': { hr: 'isključeno', en: 'off' },
  'signal.change': { hr: 'promjena za {n} s', en: 'changes in {n} s' },
  'signal.held': { hr: 'čeka promet', en: 'waiting for traffic' },
  'signal.noChange': { hr: 'bez promjene', en: 'no change' },
  'announce.main': { hr: 'Glavna cesta: zeleno.', en: 'Main road: green.' },
  'announce.side': { hr: 'Sporedna cesta: zeleno.', en: 'Side road: green.' },
  'announce.allRed': { hr: 'Svi semafori: crveno.', en: 'All signals: red.' },
  'announce.flashing': { hr: 'Semafori trepću žuto.', en: 'Signals flashing yellow.' },
  'announce.pedMain': { hr: 'Pješaci preko glavne ceste: zeleno.', en: 'Pedestrians across the main road: green.' },
  'announce.pedSide': { hr: 'Pješaci preko sporedne ceste: zeleno.', en: 'Pedestrians across the side road: green.' },
  'announce.emergency': { hr: 'Hitna pomoć: semafori daju prednost.', en: 'Ambulance: signals give priority.' },

  // Followed car
  'car.kmh': { hr: 'km/h', en: 'km/h' },
  'kind.sedan': { hr: 'Automobil', en: 'Car' },
  'kind.hatch': { hr: 'Mali automobil', en: 'Small car' },
  'kind.van': { hr: 'Kombi', en: 'Van' },
  'kind.bus': { hr: 'Autobus', en: 'Bus' },
  'kind.truck': { hr: 'Kamion', en: 'Lorry' },
  'kind.moto': { hr: 'Motocikl', en: 'Motorbike' },
  'kind.bike': { hr: 'Bicikl', en: 'Bicycle' },
  'kind.ambulance': { hr: 'Hitna pomoć', en: 'Ambulance' },
  'status.free': { hr: 'vozi', en: 'driving' },
  'status.curve': { hr: 'usporava za zavoj', en: 'slowing for a bend' },
  'status.start': { hr: 'kreće', en: 'moving off' },
  'status.red': { hr: 'čeka na crvenom', en: 'stopped at red' },
  'status.yellow': { hr: 'staje na žuto', en: 'stopping for yellow' },
  'status.queue': { hr: 'u koloni', en: 'in a queue' },
  'status.yield': { hr: 'propušta vozila', en: 'giving way' },
  'status.blocked': { hr: 'raskrižje zauzeto', en: 'junction blocked' },
  'status.crosswalk': { hr: 'propušta pješake', en: 'waiting for pedestrians' },
  'status.stalled': { hr: 'kvar – hazard svjetla', en: 'broken down' },
  'status.merge': { hr: 'uključuje se', en: 'merging' },
  'route.nw-straight': { hr: 's istoka, ravno', en: 'from the east, straight on' },
  'route.nw-right-turn': { hr: 's istoka, desno', en: 'from the east, turning right' },
  'route.nw-left-lane': { hr: 's istoka, ravno (lijeva traka)', en: 'from the east, straight on (left lane)' },
  'route.se-straight': { hr: 'sa zapada, ravno', en: 'from the west, straight on' },
  'route.se-left-turn': { hr: 'sa zapada, lijevo', en: 'from the west, turning left' },
  'route.se-right-lane': { hr: 'sa zapada, ravno (desna traka)', en: 'from the west, straight on (right lane)' },
  'route.side-right-turn': { hr: 'sa sjevera, desno', en: 'from the north, turning right' },
  'route.side-left-turn': { hr: 'sa sjevera, lijevo', en: 'from the north, turning left' },
  'car.waited': { hr: 'čekao {n} s', en: 'waited {n} s' },

  'clock.label': { hr: 'Doba dana', en: 'Time of day' },
  'debug.fps': { hr: 'sl/s', en: 'fps' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

const STORAGE_KEY = 'raskrsce-lang';
let current: Lang = initialLang();
const listeners = new Set<(lang: Lang) => void>();

function initialLang(): Lang {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl === 'hr' || fromUrl === 'en') return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'hr' || saved === 'en') return saved;
  } catch {
    // Storage blocked (private mode etc.): fall back to the original language.
  }
  return 'hr';
}

export function lang(): Lang {
  return current;
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = STRINGS[key][current];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Look up a key built at runtime (e.g. `status.${car.status}`), falling back to the key. */
export function tk(key: string, vars?: Record<string, string | number>): string {
  return key in STRINGS ? t(key as StringKey, vars) : key;
}

/** Numbers in the page's language (decimal comma in Croatian). */
export function num(n: number, digits = 0): string {
  return n.toLocaleString(current === 'hr' ? 'hr-HR' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Switch language, update the page and remember the choice. */
export function setLang(next: Lang): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not remembered; still switches for this visit.
  }
  applyLanguage();
  for (const listener of listeners) listener(next);
}

export function onLangChange(listener: (lang: Lang) => void): void {
  listeners.add(listener);
}

/** Apply the current language to every annotated element (and the document itself). */
export function applyLanguage(root: ParentNode = document): void {
  document.documentElement.lang = current;
  document.title = t('page.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('page.description'));

  const tr = (keys: string) => keys.split(' ').map((k) => t(k as StringKey)).join(' ');
  for (const el of root.querySelectorAll<HTMLElement | SVGElement>('[data-i18n]')) el.textContent = tr(el.dataset.i18n!);
  for (const el of root.querySelectorAll<HTMLElement | SVGElement>('[data-i18n-title]')) el.setAttribute('title', tr(el.dataset.i18nTitle!));
  for (const el of root.querySelectorAll<HTMLElement | SVGElement>('[data-i18n-aria]')) el.setAttribute('aria-label', tr(el.dataset.i18nAria!));
}

/** The HR | EN switch. */
export function createLanguageSwitch(parent: HTMLElement): void {
  const box = document.createElement('div');
  box.className = 'lang-switch';
  box.setAttribute('role', 'group');
  box.dataset.i18nAria = 'lang.label';
  box.innerHTML = (['hr', 'en'] as const)
    .map((l) => `<button type="button" data-lang="${l}" lang="${l}">${l.toUpperCase()}</button>`)
    .join('');
  parent.appendChild(box);

  const sync = () => {
    for (const b of box.querySelectorAll<HTMLButtonElement>('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === current));
    }
  };
  box.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button[data-lang]');
    if (button) setLang(button.dataset.lang as Lang);
  });
  onLangChange(sync);
  sync();
}
