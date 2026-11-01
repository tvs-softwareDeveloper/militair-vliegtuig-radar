//! vliegt een vliegtuig Nederland in? (de reden "vliegt Nederland in" in planeUtils.ts)
//! eerst keek de regel alleen naar de koers (0-20 of 160-360 graden), waar het vliegtuig ook was: dan telde ook een vliegtuig dat
//! Nederland uit vloog of er langs vloog. nu: het vliegtuig is nu buiten Nederland en zijn koers brengt hem binnen 10 minuten over de grens.
//! geen imports, zodat de tests dit bestand los kunnen laden

//! de grens van Nederland (het Europese deel) als veelhoeken van [breedte, lengte]. uit Natural Earth 1:10m (vrij te gebruiken),
//! vereenvoudigd tot op ±1 km (Douglas-Peucker, 0,01 graad). het IJsselmeer hoort bij het land, de Waddenzee en de Noordzee niet
export const NEDERLAND: [number, number][][] = [
  // vasteland (met IJsselmeer, Walcheren en Zuid-Beveland), 182 punten
  [
    [53.245, 7.195], [53.138, 7.172], [52.998, 7.193], [52.933, 7.162], [52.824, 7.062], [52.647, 7.037], [52.626, 7.018], [52.642, 6.865],
    [52.635, 6.737], [52.619, 6.702], [52.583, 6.704], [52.56, 6.744], [52.542, 6.672], [52.462, 6.715], [52.432, 6.9], [52.451, 6.973],
    [52.365, 7.048], [52.285, 7.012], [52.231, 7.026], [52.16, 6.885], [52.113, 6.831], [52.103, 6.75], [52.05, 6.673], [52.035, 6.675],
    [52.001, 6.778], [51.961, 6.811], [51.899, 6.717], [51.898, 6.628], [51.848, 6.463], [51.86, 6.378], [51.828, 6.382], [51.821, 6.345],
    [51.837, 6.342], [51.866, 6.265], [51.863, 6.225], [51.897, 6.127], [51.885, 6.093], [51.842, 6.156], [51.854, 6.084], [51.816, 5.931],
    [51.777, 5.964], [51.732, 5.939], [51.716, 6.012], [51.681, 6.009], [51.644, 6.099], [51.596, 6.086], [51.509, 6.193], [51.458, 6.205],
    [51.345, 6.194], [51.212, 6.057], [51.171, 6.061], [51.163, 6.084], [51.184, 6.134], [51.179, 6.157], [51.165, 6.126], [51.152, 6.147],
    [51.075, 5.983], [51.031, 5.938], [51.052, 5.88], [51.043, 5.852], [50.965, 5.875], [50.974, 6.004], [50.929, 6], [50.908, 6.064],
    [50.853, 6.057], [50.84, 6.009], [50.801, 5.998], [50.795, 5.969], [50.75, 5.995], [50.752, 5.793], [50.773, 5.752], [50.754, 5.707],
    [50.761, 5.688], [50.796, 5.7], [50.83, 5.624], [50.853, 5.622], [50.912, 5.722], [50.959, 5.764], [50.959, 5.722], [51.024, 5.778],
    [51.058, 5.771], [51.061, 5.799], [51.097, 5.805], [51.103, 5.846], [51.119, 5.823], [51.156, 5.829], [51.152, 5.781], [51.184, 5.731],
    [51.179, 5.659], [51.208, 5.568], [51.287, 5.493], [51.259, 5.389], [51.259, 5.215], [51.308, 5.197], [51.313, 5.123], [51.375, 5.068],
    [51.439, 5.08], [51.477, 5.028], [51.392, 4.91], [51.413, 4.762], [51.426, 4.779], [51.414, 4.823], [51.476, 4.824], [51.495, 4.779],
    [51.486, 4.731], [51.418, 4.63], [51.42, 4.541], [51.429, 4.522], [51.476, 4.525], [51.474, 4.483], [51.443, 4.377], [51.374, 4.416],
    [51.35, 4.392], [51.369, 4.261], [51.419, 4.235], [51.405, 4.201], [51.407, 4.111], [51.453, 3.999], [51.456, 3.957], [51.405, 3.902],
    [51.391, 3.827], [51.454, 3.69], [51.445, 3.61], [51.459, 3.535], [51.53, 3.451], [51.555, 3.458], [51.595, 3.56], [51.613, 3.829],
    [51.584, 3.896], [51.569, 3.906], [51.549, 3.872], [51.531, 4.016], [51.446, 4.105], [51.448, 4.283], [51.471, 4.297], [51.508, 4.268],
    [51.535, 4.091], [51.59, 3.988], [51.611, 4.068], [51.608, 4.157], [51.59, 4.207], [51.617, 4.19], [51.62, 4.136], [51.639, 4.113],
    [51.671, 4.113], [51.686, 4.177], [51.717, 4.072], [51.784, 4.034], [51.81, 3.981], [51.788, 3.872], [51.816, 3.862], [51.847, 3.963],
    [51.834, 4.048], [51.844, 4.078], [51.882, 4.032], [51.988, 4.016], [52.006, 4.142], [52.113, 4.285], [52.336, 4.508], [52.507, 4.597],
    [52.797, 4.669], [52.968, 4.745], [52.968, 4.817], [52.93, 4.809], [52.904, 4.874], [52.954, 5.078], [53.083, 5.313], [53.097, 5.379],
    [53.221, 5.447], [53.303, 5.592], [53.406, 5.981], [53.413, 6.274], [53.399, 6.312], [53.439, 6.494], [53.461, 6.73], [53.451, 6.829],
    [53.434, 6.867], [53.352, 6.901], [53.306, 7.02], [53.31, 7.085], [53.267, 7.081], [53.245, 7.195],
  ],
  // Zeeuws-Vlaanderen, 22 punten
  [
    [51.375, 3.349], [51.417, 3.541], [51.35, 3.756], [51.343, 3.834], [51.372, 3.956], [51.41, 3.984], [51.359, 4.122], [51.358, 4.157],
    [51.377, 4.18], [51.368, 4.221], [51.331, 4.208], [51.272, 4.119], [51.211, 3.949], [51.205, 3.809], [51.22, 3.781], [51.255, 3.776],
    [51.29, 3.61], [51.281, 3.514], [51.24, 3.501], [51.247, 3.392], [51.289, 3.353], [51.375, 3.349],
  ],
  // Schouwen-Duiveland, 11 punten
  [
    [51.686, 4.037], [51.67, 4.097], [51.644, 4.089], [51.624, 3.96], [51.7, 3.809], [51.678, 3.765], [51.681, 3.7], [51.725, 3.689],
    [51.748, 3.814], [51.741, 3.94], [51.686, 4.037],
  ],
  // Texel, 11 punten
  [
    [53.111, 4.893], [53.105, 4.913], [53.076, 4.893], [53, 4.796], [53.003, 4.727], [53.028, 4.708], [53.084, 4.734], [53.188, 4.854],
    [53.181, 4.89], [53.135, 4.91], [53.111, 4.893],
  ],
  // Vlieland, 7 punten
  [
    [53.221, 4.879], [53.29, 4.987], [53.314, 5.054], [53.31, 5.105], [53.292, 5.036], [53.212, 4.91], [53.221, 4.879],
  ],
  // Terschelling, 9 punten
  [
    [53.43, 5.424], [53.454, 5.585], [53.434, 5.562], [53.427, 5.475], [53.409, 5.469], [53.353, 5.208], [53.368, 5.168], [53.406, 5.25],
    [53.43, 5.424],
  ],
  // Ameland, 6 punten
  [
    [53.468, 5.674], [53.474, 5.914], [53.461, 5.955], [53.43, 5.679], [53.449, 5.636], [53.468, 5.674],
  ],
  // Schiermonnikoog, 6 punten
  [
    [53.509, 6.212], [53.514, 6.311], [53.502, 6.339], [53.454, 6.133], [53.482, 6.123], [53.509, 6.212],
  ],
];

export const HORIZON_S = 600; //! zo ver kijken we vooruit: 10 minuten vliegen op de huidige koers en snelheid
const M_PER_GRAAD = 111320;
//! rekenen op een plat vlak: x = lengte × cos(52,2°), y = breedte. voor een land zo klein als Nederland is dat ruim nauwkeurig genoeg
const K = Math.cos((52.2 * Math.PI) / 180);

//! de grens één keer vooraf omgerekend: per ring de x en y van elk punt en het vak eromheen.
//! zo rekent elke controle alleen nog met getallen (gemeten: met arrays per vergelijking kostte 5.000 vliegtuigen ±50 ms per pakket)
const RINGEN = NEDERLAND.map((ring) => {
  const x = ring.map((p) => p[1] * K);
  const y = ring.map((p) => p[0]);
  return { x, y, xMin: Math.min(...x), xMax: Math.max(...x), yMin: Math.min(...y), yMax: Math.max(...y) };
});
//! het vak om heel Nederland: alles daarbuiten (en een lijn die er niet doorheen kan) hoeft niet langs alle randen
const VAK = {
  xMin: Math.min(...RINGEN.map((r) => r.xMin)),
  xMax: Math.max(...RINGEN.map((r) => r.xMax)),
  yMin: Math.min(...RINGEN.map((r) => r.yMin)),
  yMax: Math.max(...RINGEN.map((r) => r.yMax)),
};

// OUD: const VAK = { latMin, latMax, lonMin, lonMax } uit NEDERLAND.flat(), en inNederland / snijdt met [lat, lon]-arrays per vergelijking

//! ligt dit punt in Nederland? (straalmethode: tel hoe vaak een lijn naar het oosten de grens kruist, oneven = binnen)
const binnenPlat = (px: number, py: number): boolean => {
  if (px < VAK.xMin || px > VAK.xMax || py < VAK.yMin || py > VAK.yMax) return false;
  for (const r of RINGEN) {
    if (px < r.xMin || px > r.xMax || py < r.yMin || py > r.yMax) continue;
    let binnen = false;
    for (let i = 0, j = r.x.length - 1; i < r.x.length; j = i++) {
      if (r.y[i] > py !== r.y[j] > py && px < ((r.x[j] - r.x[i]) * (py - r.y[i])) / (r.y[j] - r.y[i]) + r.x[i]) binnen = !binnen;
    }
    if (binnen) return true;
  }
  return false;
};

export const inNederland = (lat: number, lon: number): boolean => binnenPlat(lon * K, lat);

//! snijdt het lijnstuk a-b (de koers) een rand van Nederland?
const kruistGrens = (ax: number, ay: number, bx: number, by: number): boolean => {
  const xMin = Math.min(ax, bx);
  const xMax = Math.max(ax, bx);
  const yMin = Math.min(ay, by);
  const yMax = Math.max(ay, by);
  for (const r of RINGEN) {
    if (xMax < r.xMin || xMin > r.xMax || yMax < r.yMin || yMin > r.yMax) continue;
    for (let i = 0; i < r.x.length - 1; i++) {
      const cx = r.x[i];
      const cy = r.y[i];
      const dx = r.x[i + 1];
      const dy = r.y[i + 1];
      //! aan welke kant van de ene lijn liggen de uiteinden van de andere (en andersom): tegengesteld = ze snijden
      const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
      const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
      if (d1 * d2 >= 0) continue;
      const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
      if (d3 * d4 < 0) return true;
    }
  }
  return false;
};

//! vliegt hij Nederland in? alleen als hij nu buiten Nederland is en zijn koers hem binnen HORIZON_S over de grens brengt.
//! koers in graden (met de klok mee vanaf noord), snelheid in m/s. al boven Nederland, er langs of er vandaan: nee
export const vliegtNederlandIn = (lat: number, lon: number, koers: number, snelheid: number, seconden = HORIZON_S): boolean => {
  if (![lat, lon, koers, snelheid].every((x) => typeof x === "number" && Number.isFinite(x)) || snelheid < 5) return false;
  const ax = lon * K;
  const ay = lat;
  //! de koers als lijnstuk: zo ver als hij in HORIZON_S komt
  const afstand = snelheid * seconden;
  const r = (koers * Math.PI) / 180;
  const by = lat + (Math.cos(r) * afstand) / M_PER_GRAAD;
  const bx = (lon + (Math.sin(r) * afstand) / (M_PER_GRAAD * Math.cos((lat * Math.PI) / 180))) * K;
  //! het hele stuk ligt naast het vak om Nederland: dan kan hij er niet in komen
  if (Math.max(ax, bx) < VAK.xMin || Math.min(ax, bx) > VAK.xMax || Math.max(ay, by) < VAK.yMin || Math.min(ay, by) > VAK.yMax) return false;
  if (binnenPlat(ax, ay)) return false; //! al boven Nederland
  return binnenPlat(bx, by) || kruistGrens(ax, ay, bx, by);
};
