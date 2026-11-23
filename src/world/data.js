// The map of Soest, taken from the original 2D game (leonardran/driving-in-soest)
// and re-used here so the 3D town has the same streets and landmarks.
//
// Map units are the original game's units. We scale them into metres with
// WORLD.scale (1 map unit = 0.2 m), and centre the playable area on the
// Soest / Soesterberg core.

export const MAP_W = 15600;
export const MAP_H = 10000;

export const WORLD = {
  minX: 120,
  maxX: 9680,
  minZ: 80,
  maxZ: 6740,
  scale: 0.2,
  cx: 4900,
  cz: 3410
};
WORLD.w = (WORLD.maxX - WORLD.minX) * WORLD.scale; // ~1912 m
WORLD.h = (WORLD.maxZ - WORLD.minZ) * WORLD.scale; // ~1332 m
WORLD.halfW = WORLD.w * 0.5;
WORLD.halfH = WORLD.h * 0.5;

/** Map (x, z) -> world metres. */
export const wx = (mx) => (mx - WORLD.cx) * WORLD.scale;
export const wz = (mz) => (mz - WORLD.cz) * WORLD.scale;
/** World metres -> map units. */
export const mx = (x) => x / WORLD.scale + WORLD.cx;
export const mz = (z) => z / WORLD.scale + WORLD.cz;

// --- the road grid -------------------------------------------------------

export const ROAD_X = [
  250, 825, 1400, 1975, 2550, 6000, 6600, 7200, 7800, 8400, 9000, 9600, 10200,
  10800, 11400, 12000, 12600, 13200, 13800, 14400, 15000
];

export const ROAD_Z = [
  190, 630, 1070, 1510, 1950, 3710, 4150, 4600, 5050, 5500, 6000, 6600, 7200,
  7800, 8400, 9000, 9600
];

export const GRID_X_NAMES = [
  'Beetzlaan', 'Birkstraat', 'Steenhoffstraat', 'Soestdijkseweg Zuid',
  'Rademakerstraat', 'Pijnenburgerlaan', 'De Birktweg', 'Eemrand · Parklaan',
  'Eemrand · Esdoornweg', 'Eemrand · Waterlinie', 'Eemrand · Veldweg',
  'Eemrand · Ringweg', 'Kampweg', 'Laanstraat', 'Nieuwe Weg', 'Oude Utrechtseweg',
  'Paltzerweg', 'Koningsweg', 'Sint Annastraat', 'Vondellaan', 'Zonnebloemstraat'
];

export const GRID_Z_NAMES = [
  'Dorpsstraat Soestdijk', 'Paleisallee', 'Van Weedestraat', 'Nijverheidsweg',
  'Duinweg', 'A28 · Soest–Amersfoort', 'Lange Duinenweg', 'Eemrand · Noordlaan',
  'Eemrand · Beukenlaan', 'Eemrand · Parkweg', 'Eemrand · Zuidlaan',
  'Soestdijkseweg Zuid', 'Dierenriem', 'Jan Steenlaan', 'Planetenlaan',
  'Leyenseweg', 'Bilthovenseweg'
];

/** How far each grid road runs (map units), straight from the original. */
export function roadSpan(axis, index) {
  if (axis === 'v' && index >= 10) return [3350, 6000];
  if (axis === 'v' && (index === 5 || index === 6)) return [630, MAP_H - 120];
  if (axis === 'v' && index >= 7) return [630, 6200];
  if (axis === 'h' && index >= 11) return [2500, 6800];
  if (axis === 'h' && index >= 5) return [5480, MAP_W];
  return [0, axis === 'v' ? MAP_H : MAP_W];
}

/** Extra streets that do not sit on the grid. */
export const LOCAL_ROADS = [
  { axis: 'v', fixed: 1100, start: 650, end: 930, name: 'Beetzlaan' },
  { axis: 'v', fixed: 3260, start: 630, end: 850, name: 'Birkstraat' },
  { axis: 'h', fixed: 820, start: 1400, end: 1740, name: 'Van Weedestraat' },
  { axis: 'v', fixed: 2180, start: 1510, end: 1815, name: 'Stationsweg' },
  { axis: 'h', fixed: 2110, start: 2550, end: 2910, name: 'Nijverheidsweg' },
  { axis: 'h', fixed: 850, start: 2550, end: 4700, name: 'Soesterbergsestraat' },
  { axis: 'v', fixed: 3380, start: 1390, end: 1785, name: 'Industrieweg' },
  { axis: 'h', fixed: 2440, start: 2550, end: 4700, name: 'Duinweg' },
  { axis: 'v', fixed: 2940, start: 1950, end: 2215, name: 'Vliegbasislaan' },
  { axis: 'v', fixed: 4480, start: 850, end: 2440, name: 'Bioscooplaan' },
  { axis: 'h', fixed: 1240, start: 4480, end: 4700, name: 'Bioscoopstraat' },
  { axis: 'h', fixed: 2010, start: 4480, end: 4800, name: 'Koningsweg' },
  { axis: 'v', fixed: 5050, start: 850, end: 2390, name: 'Woonwijklaan' },
  { axis: 'v', fixed: 5480, start: 850, end: 2390, name: 'Boomgaardstraat' },
  { axis: 'h', fixed: 2390, start: 4800, end: 6800, name: 'Lindelaan' },
  { axis: 'h', fixed: 2950, start: 4800, end: 7200, name: 'Boomgaardlaan' },
  { axis: 'h', fixed: 3710, start: 5480, end: 7000, name: 'Pijnenburgerweg' },
  { axis: 'h', fixed: 4150, start: 5480, end: 6800, name: 'Lange Duinenweg' },
  { axis: 'h', fixed: 725, start: 6000, end: 6600, name: 'Watertorenweg' },
  { axis: 'h', fixed: 1120, start: 6000, end: 6600, name: 'De Birktstraat' },
  { axis: 'h', fixed: 2020, start: 6000, end: 6600, name: 'Dorpsstraat Soesterberg' },
  { axis: 'h', fixed: 2460, start: 6000, end: 6600, name: 'Engweg' },
  { axis: 'h', fixed: 3110, start: 6000, end: 6600, name: 'Pijnenburgerlaan · toegang' },
  { axis: 'h', fixed: 3780, start: 6000, end: 6600, name: 'Duinweg · Lange Duinen' },
  { axis: 'v', fixed: 3150, start: 6000, end: 9640, name: 'Soestdijkseweg Zuid' },
  { axis: 'v', fixed: 3850, start: 6000, end: 9640, name: 'Planetenlaan' },
  { axis: 'v', fixed: 4550, start: 6000, end: 9640, name: 'Jan Steenlaan' },
  { axis: 'v', fixed: 5250, start: 6000, end: 9640, name: 'Leyenseweg' },
  { axis: 'v', fixed: 12900, start: 3710, end: 6000, name: 'Eemrand-Oost · Parklaan' },
  { axis: 'v', fixed: 13500, start: 3710, end: 6000, name: 'Eemrand-Oost · Esdoornweg' },
  { axis: 'h', fixed: 3930, start: 12000, end: 15600, name: 'Eemrand-Oost · Noordlaan' },
  { axis: 'h', fixed: 4375, start: 12000, end: 15600, name: 'Eemrand-Oost · Beukenlaan' },
  { axis: 'h', fixed: 4825, start: 12000, end: 15600, name: 'Eemrand-Oost · Parkweg' },
  { axis: 'h', fixed: 5275, start: 12000, end: 15600, name: 'Eemrand-Oost · Zuidlaan' },
  { axis: 'h', fixed: 5750, start: 12000, end: 15600, name: 'Eemrand-Oost · Ringweg' }
];

// --- land use ------------------------------------------------------------

export const ZONES = [
  { x: 3800, y: 410, w: 1000, h: 220, name: 'POLDER EEMLAND', kind: 'fields' },
  { x: 4500, y: 2750, w: 550, h: 460, name: 'SOESTERDUINEN OOST', kind: 'dunes' },
  { x: 3500, y: 3000, w: 1100, h: 560, name: 'VLIEGBASIS SOESTERBERG', kind: 'airbase' },
  { x: 3690, y: 1730, w: 400, h: 230, name: 'SPORTPARK HEES', kind: 'sports' },
  { x: 3650, y: 1260, w: 430, h: 220, name: 'SPORTPARK SOESTERBERG', kind: 'sports' },
  { x: 4160, y: 1730, w: 420, h: 250, name: 'BEDRIJVENTERREIN NIJVERHEID', kind: 'industrial' },
  { x: 520, y: 2450, w: 330, h: 560, name: 'BOSGEBIED DE ZOOM', kind: 'woodland' },
  { x: 1115, y: 2290, w: 390, h: 390, name: 'SOESTERMEER', kind: 'lake' },
  { x: 3050, y: 1260, w: 430, h: 220, name: 'KINDERBOERDERIJ DE POLDER', kind: 'farm' },
  { x: 1675, y: 1730, w: 310, h: 270, name: 'SPEELTUIN', kind: 'playground' },
  { x: 1675, y: 2135, w: 360, h: 250, name: 'CASINO SOEST', kind: 'casino' },
  { x: 1687, y: 410, w: 320, h: 220, name: 'WINKELCENTRUM SOEST', kind: 'mall' },
  { x: 2820, y: 410, w: 320, h: 220, name: 'VAN DER VALK HOTEL', kind: 'hotel' },
  { x: 2262, y: 2470, w: 340, h: 470, name: 'STATION SOEST-ZUID', kind: 'station' },
  { x: 4580, y: 1640, w: 440, h: 1400, name: 'SOEST-OOST', kind: 'suburb' },
  { x: 4770, y: 410, w: 300, h: 220, name: 'CINEMA SOEST', kind: 'cinema' },
  { x: 5200, y: 410, w: 250, h: 170, name: 'BURGER QUEEN', kind: 'fastfood' },
  { x: 5250, y: 3330, w: 900, h: 520, name: 'WOONWIJK DE GROENE BOOMGAARD', kind: 'residential' },
  { x: 6300, y: 1270, w: 460, h: 300, name: 'DE BIRKT', kind: 'fields' },
  { x: 6300, y: 2160, w: 460, h: 280, name: 'SOESTERBERG · DORPSKERN', kind: 'suburb' },
  { x: 6300, y: 2660, w: 460, h: 400, name: 'DE ENG', kind: 'residential' },
  { x: 6300, y: 3370, w: 500, h: 520, name: 'LANDGOED PIJNENBURG', kind: 'woodland' },
  { x: 6300, y: 3930, w: 500, h: 300, name: 'LANGE DUINEN', kind: 'dunes' },
  { x: 6300, y: 820, w: 340, h: 190, name: 'WATERTOREN SOEST', kind: 'watertower' },
  { x: 2320, y: 1650, w: 260, h: 180, name: 'CARWASH SOEST', kind: 'carwash' },
  { x: 8200, y: 1980, w: 460, h: 260, name: 'STATION EEMRAND', kind: 'station' },
  { x: 7400, y: 4400, w: 690, h: 420, name: 'BEDRIJVENTERREIN EEMRAND', kind: 'industrial' },
  { x: 8300, y: 4260, w: 650, h: 520, name: 'BOERDERIJ DE EEMHOEVE', kind: 'farm' },
  { x: 7350, y: 5000, w: 700, h: 520, name: 'WOONWIJK EEMRAND', kind: 'residential' },
  { x: 8250, y: 5250, w: 1000, h: 900, name: 'BOSGEBIED OOSTRAND', kind: 'woodland' },
  { x: 7200, y: 5700, w: 760, h: 450, name: 'ZANDVLAKTE OOSTDUINEN', kind: 'dunes' },
  { x: 7450, y: 3500, w: 580, h: 340, name: 'SPORTPARK EEMRAND', kind: 'sports' },
  { x: 8400, y: 3320, w: 460, h: 320, name: 'AKKERS VAN DE BIRKT', kind: 'fields' },
  { x: 500, y: 865, w: 315, h: 250, name: 'OUDE KERK · MOLEN DE WINDHOND', kind: 'landmark' },
  { x: 1980, y: 190, w: 560, h: 420, name: 'PALEIS SOESTDIJK', kind: 'palace' },
  { x: 520, y: 3000, w: 400, h: 420, name: 'SOESTERDUINEN', kind: 'dunes' }
];

const BUILDABLE = new Set([
  'residential', 'suburb', 'industrial', 'mall', 'casino', 'cinema', 'hotel',
  'station', 'fastfood', 'carwash', 'school', 'landmark', 'sports'
]);

/** Land use at a map position. */
export function zoneAtMap(mapX, mapZ) {
  for (let i = ZONES.length - 1; i >= 0; i--) {
    const z = ZONES[i];
    if (mapX >= z.x && mapX <= z.x + z.w && mapZ >= z.y && mapZ <= z.y + z.h) return z;
  }
  return null;
}

export function isBuildableZone(zone) {
  return !!zone && BUILDABLE.has(zone.kind);
}

// --- points of interest --------------------------------------------------

const RAW_POIS = [
  ['Casino Soest', 1675, 2045, 'casino'],
  ['Speeltuin De Kleine Soester', 1675, 1730, 'park'],
  ['Kinderboerderij De Polder', 3050, 1260, 'farm'],
  ['Kapsalon Soest Stijl', 1500, 482, 'shop'],
  ['Winkelcentrum Soest', 1687, 410, 'shop'],
  ['Van der Valk Hotel', 2820, 410, 'hotel'],
  ['Station Soest-Zuid', 2220, 2470, 'station'],
  ['Station Soest-Oost', 6150, 2150, 'station'],
  ['Station Eemrand', 8200, 1980, 'station'],
  ['Woonwijk Eemrand', 7350, 5000, 'home'],
  ['Bosgebied Oostrand', 8250, 5250, 'park'],
  ['Oostduinen', 7200, 5700, 'nature'],
  ['Boerderij De Eemhoeve', 8300, 4260, 'farm'],
  ['Sportpark Eemrand', 7450, 3500, 'sport'],
  ['Paleis Soestdijk', 2250, 410, 'palace'],
  ['Oude Kerk', 615, 960, 'church'],
  ['Molenaarswoning', 760, 990, 'home'],
  ['VV Hees · Sportpark', 3690, 1730, 'sport'],
  ['Soestermeer', 1115, 2290, 'nature'],
  ['Bosgebied De Zoom', 520, 2450, 'park'],
  ['Soesterduinen', 620, 3080, 'nature'],
  ['Soesterduinen Oost', 4500, 2750, 'nature'],
  ['Cinema Soest', 4770, 410, 'cinema'],
  ['Burger Queen', 5200, 410, 'fastfood'],
  ['Bedrijventerrein Nijverheid', 4160, 1730, 'work'],
  ['Vliegbasis Soesterberg', 3500, 3000, 'nature'],
  ['Soest-Oost', 5250, 3330, 'home'],
  ['Watertoren Soest', 6300, 790, 'watertower'],
  ['De Birkt · boerderijen', 6300, 1185, 'farm'],
  ['Soesterberg · dorpskern', 6300, 2085, 'home'],
  ['De Eng', 6300, 2525, 'home'],
  ['Landgoed Pijnenburg', 6300, 3175, 'park'],
  ['Lange Duinen', 6300, 3845, 'nature'],
  ['Carwash Soest', 2180, 1690, 'carwash'],
  ['Garage Soest', 3185, 1874, 'garage'],
  ['Politie Soest', 390, 790, 'police'],
  ['Brandweer Soest', 2400, 1325, 'fire'],
  ['Startpunt · Centrum', 825, 1070, 'start'],
  ['Tankstation Centrum', 1687, 1290, 'fuel'],
  ['Tankstation Soesterberg', 3380, 2160, 'fuel'],
  ['Snellader Soest-Zuid', 2275, 2690, 'fuel'],
  ['Tankstation Eemrand', 8100, 4825, 'fuel'],
  ['Snellader Eemrand', 8700, 5275, 'fuel'],
  ['A28 oprit Soest', 2580, 3710, 'road'],
  ['Ziekenhuis Soest', 3120, 960, 'hospital'],
  ['Bibliotheek Soest', 1180, 1120, 'shop'],
  ['Marktplein Soest', 1500, 1200, 'market']
];

export const POIS = RAW_POIS.map(([name, mX, mZ, kind]) => ({
  name,
  kind,
  x: wx(mX),
  z: wz(mZ),
  mapX: mX,
  mapZ: mZ
})).filter(
  (p) =>
    p.mapX > WORLD.minX &&
    p.mapX < WORLD.maxX &&
    p.mapZ > WORLD.minZ &&
    p.mapZ < WORLD.maxZ
);

// Landmark anchors in world metres.
export const ANCHORS = {
  church: { x: wx(615), z: wz(960) },
  windmill: { x: wx(790), z: wz(1000) },
  palace: { x: wx(2250), z: wz(410) },
  waterTower: { x: wx(6470), z: wz(915) },
  stationZuid: { x: wx(2432), z: wz(2705) },
  stationOost: { x: wx(6150), z: wz(2150) },
  stationEemrand: { x: wx(8200), z: wz(1980) },
  garage: { x: wx(3185), z: wz(1874) },
  police: { x: wx(390), z: wz(790) },
  fire: { x: wx(2400), z: wz(1325) },
  hospital: { x: wx(3120), z: wz(960) },
  spawn: { x: wx(825), z: wz(1720) }
};

// --- radio ---------------------------------------------------------------

export const RADIO_STATIONS = [
  {
    id: 'soestfm', name: 'Soest FM', genre: 'Warme popmuziek', color: '#f4c74f',
    playlist: ['radio/channel-1.mp3', 'radio/intro-1.mp3', 'radio/talk-1.mp3', 'radio/intro-4.mp3', 'radio/talk-5.mp3']
  },
  {
    id: 'duinen', name: 'Duinen Radio', genre: 'Chill & akoestisch', color: '#8fd0a8',
    playlist: ['radio/channel-2.mp3', 'radio/intro-2.mp3', 'radio/talk-2.mp3', 'radio/intro-6.mp3', 'radio/talk-6.mp3']
  },
  {
    id: 'eemland', name: 'Eemland Hits', genre: 'Pop van nu', color: '#7ab8f5',
    playlist: ['radio/channel-3.mp3', 'radio/intro-3.mp3', 'radio/talk-3.mp3', 'radio/intro-5.mp3', 'radio/talk-7.mp3']
  },
  {
    id: 'nachtrit', name: 'Nachtrit Radio', genre: 'Synth & neon', color: '#c39cf0',
    playlist: ['radio/channel-4.mp3', 'radio/intro-4.mp3', 'radio/talk-4.mp3', 'radio/intro-1.mp3', 'radio/talk-8.mp3']
  }
];

export const RADIO_TALK = [
  'radio/talk-1.mp3', 'radio/talk-2.mp3', 'radio/talk-3.mp3', 'radio/talk-4.mp3',
  'radio/talk-5.mp3', 'radio/talk-6.mp3', 'radio/talk-7.mp3', 'radio/talk-8.mp3'
];

export const RADIO_JINGLES = [
  'radio/intro-1.mp3', 'radio/intro-2.mp3', 'radio/intro-3.mp3',
  'radio/intro-4.mp3', 'radio/intro-5.mp3', 'radio/intro-6.mp3'
];

// --- cars ----------------------------------------------------------------

export const CAR_TYPES = {
  taxi: {
    id: 'taxi',
    name: 'Soest Taxi',
    body: 'sedan',
    color: '#f2c230',
    accent: '#1d2229',
    mass: 1400,
    power: 5200,
    brake: 12000,
    maxSpeed: 44,
    steer: 0.62,
    grip: 1.02,
    seats: 4,
    price: 0,
    desc: 'De trouwe Mercedes van de zaak. Geel, dus je valt op.'
  },
  compact: {
    id: 'compact',
    name: 'Soest Compact',
    body: 'hatch',
    color: '#7fa8c9',
    accent: '#1d2229',
    mass: 1050,
    power: 4200,
    brake: 10000,
    maxSpeed: 42,
    steer: 0.7,
    grip: 1.05,
    seats: 4,
    price: 0,
    desc: 'Klein, zuinig en overal tussen te parkeren.'
  },
  estate: {
    id: 'estate',
    name: 'Comfort Estate',
    body: 'wagon',
    color: '#3f5d52',
    accent: '#1d2229',
    mass: 1550,
    power: 5600,
    brake: 12500,
    maxSpeed: 46,
    steer: 0.6,
    grip: 1.0,
    seats: 5,
    price: 4200,
    desc: 'Ruimte voor koffers, honden en de hele familie.'
  },
  van: {
    id: 'van',
    name: 'Bestelbus',
    body: 'van',
    color: '#e8e6e1',
    accent: '#33414a',
    mass: 2200,
    power: 5800,
    brake: 13500,
    maxSpeed: 38,
    steer: 0.55,
    grip: 0.92,
    seats: 2,
    price: 5600,
    desc: 'Traag maar onverwoestbaar. Past bijna overal in.'
  },
  sport: {
    id: 'sport',
    name: 'GTI Soest',
    body: 'sport',
    color: '#c0392b',
    accent: '#171a1f',
    mass: 1280,
    power: 8200,
    brake: 14500,
    maxSpeed: 58,
    steer: 0.74,
    grip: 1.12,
    seats: 2,
    price: 14500,
    desc: 'Snel, fel en een beetje aso. Precies goed.'
  },
  classic: {
    id: 'classic',
    name: 'Klassieker',
    body: 'classic',
    color: '#d8cbb0',
    accent: '#4a3b2a',
    mass: 1150,
    power: 3800,
    brake: 8500,
    maxSpeed: 36,
    steer: 0.66,
    grip: 0.88,
    seats: 4,
    price: 9800,
    desc: 'Rijdt als een boot, klinkt als een orkest.'
  },
  police: {
    id: 'police',
    name: 'Politie Soest',
    body: 'sedan',
    color: '#eef1f4',
    accent: '#1b4fa0',
    mass: 1600,
    power: 7600,
    brake: 14000,
    maxSpeed: 52,
    steer: 0.7,
    grip: 1.08,
    seats: 4,
    price: 0,
    desc: 'Alleen voor de dienst.'
  },
  ambulance: {
    id: 'ambulance',
    name: 'Ambulance',
    body: 'van',
    color: '#f5f7f2',
    accent: '#d02a2a',
    mass: 2600,
    power: 6400,
    brake: 14000,
    maxSpeed: 44,
    steer: 0.56,
    grip: 0.95,
    seats: 3,
    price: 0,
    desc: 'Spoed!'
  },
  fire: {
    id: 'fire',
    name: 'Brandweer',
    body: 'truck',
    color: '#c62222',
    accent: '#f0f0ea',
    mass: 5200,
    power: 9000,
    brake: 18000,
    maxSpeed: 32,
    steer: 0.5,
    grip: 0.9,
    seats: 3,
    price: 0,
    desc: 'Zwaar, rood en luid.'
  }
};

export const TRAFFIC_COLORS = [
  '#c9ccd1', '#8b929a', '#2b3138', '#e9ede8', '#3a5b7d',
  '#7d3c3c', '#28503f', '#b8b2a4', '#5d6bd6', '#d9d2c2'
];

export const PED_SHIRTS = [
  '#38506b', '#8c3b3b', '#2f6b52', '#c9a227', '#6b4a7d',
  '#b8574c', '#d8d5cc', '#3f7d8c', '#2b2f36', '#a8b0a0'
];
