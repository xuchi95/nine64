/**
 * Nine64 AI Player Network — public roster (client-safe).
 *
 * Contains ONLY information a player may legitimately see: the AI's display
 * name, its target rating band, its playing style and an avatar seed.
 * Engine level, search budget and any other strength mapping live in
 * `src/lib/rankedAi/strength.server.ts` and are never bundled into the browser.
 *
 * Every name here is synthetic. No real person, titled player or celebrity is
 * referenced, and every AI is surfaced in the UI with an explicit "AI" badge.
 */

export const RANKED_AI_STYLES = [
  "atlas",
  "viper",
  "fortress",
  "gambit",
  "nova",
  "oracle",
  "chaos",
  "positional",
  "tactical",
  "attacking",
  "defensive",
  "endgame",
  "solid",
  "dynamic",
  "counterattacker",
] as const;

export type RankedAiStyle = (typeof RANKED_AI_STYLES)[number];

export interface AiRosterEntry {
  /** Stable identity key; the seed script is idempotent on this value. */
  key: string;
  /** Synthetic display name (unique across the roster). */
  name: string;
  /** Rating the AI is seeded at and calibrated towards. */
  targetRating: number;
  personality: RankedAiStyle;
  /** Deterministic seed for the generated geometric avatar. */
  avatarSeed: string;
}

export const AI_ROSTER: readonly AiRosterEntry[] = [
  { key: "nine64_ai_001", name: "Nova Ashen", targetRating: 700, personality: "fortress", avatarSeed: "n64ai001" },
  { key: "nine64_ai_002", name: "Orin Caldis", targetRating: 743, personality: "positional", avatarSeed: "n64ai002" },
  { key: "nine64_ai_003", name: "Vela Merrin", targetRating: 785, personality: "solid", avatarSeed: "n64ai003" },
  { key: "nine64_ai_004", name: "Kestrel Sandell", targetRating: 828, personality: "fortress", avatarSeed: "n64ai004" },
  { key: "nine64_ai_005", name: "Juno Stanovic", targetRating: 871, personality: "positional", avatarSeed: "n64ai005" },
  { key: "nine64_ai_006", name: "Rune Petram", targetRating: 914, personality: "solid", avatarSeed: "n64ai006" },
  { key: "nine64_ai_007", name: "Solen Verlaine", targetRating: 956, personality: "fortress", avatarSeed: "n64ai007" },
  { key: "nine64_ai_008", name: "Marek Delacroix", targetRating: 999, personality: "positional", avatarSeed: "n64ai008" },
  { key: "nine64_ai_009", name: "Ilya Kellerman", targetRating: 1000, personality: "solid", avatarSeed: "n64ai009" },
  { key: "nine64_ai_010", name: "Tavi Rasmussen", targetRating: 1022, personality: "fortress", avatarSeed: "n64ai010" },
  { key: "nine64_ai_011", name: "Bruno Zielinski", targetRating: 1044, personality: "positional", avatarSeed: "n64ai011" },
  { key: "nine64_ai_012", name: "Selka Galanis", targetRating: 1066, personality: "solid", avatarSeed: "n64ai012" },
  { key: "nine64_ai_013", name: "Kaido Nordheim", targetRating: 1088, personality: "fortress", avatarSeed: "n64ai013" },
  { key: "nine64_ai_014", name: "Perrin Vindral", targetRating: 1111, personality: "positional", avatarSeed: "n64ai014" },
  { key: "nine64_ai_015", name: "Odalys Vestry", targetRating: 1133, personality: "solid", avatarSeed: "n64ai015" },
  { key: "nine64_ai_016", name: "Ferro Sable", targetRating: 1155, personality: "fortress", avatarSeed: "n64ai016" },
  { key: "nine64_ai_017", name: "Lumen Larkspur", targetRating: 1177, personality: "positional", avatarSeed: "n64ai017" },
  { key: "nine64_ai_018", name: "Aster Vireo", targetRating: 1199, personality: "solid", avatarSeed: "n64ai018" },
  { key: "nine64_ai_019", name: "Corvin Havelock", targetRating: 1200, personality: "fortress", avatarSeed: "n64ai019" },
  { key: "nine64_ai_020", name: "Miren Solberg", targetRating: 1218, personality: "positional", avatarSeed: "n64ai020" },
  { key: "nine64_ai_021", name: "Talia Marek", targetRating: 1236, personality: "solid", avatarSeed: "n64ai021" },
  { key: "nine64_ai_022", name: "Osric Brandt", targetRating: 1254, personality: "fortress", avatarSeed: "n64ai022" },
  { key: "nine64_ai_023", name: "Vinter Ingram", targetRating: 1272, personality: "positional", avatarSeed: "n64ai023" },
  { key: "nine64_ai_024", name: "Elara Palmiro", targetRating: 1290, personality: "solid", avatarSeed: "n64ai024" },
  { key: "nine64_ai_025", name: "Ryn Wolstan", targetRating: 1309, personality: "fortress", avatarSeed: "n64ai025" },
  { key: "nine64_ai_026", name: "Sabra Elmgren", targetRating: 1327, personality: "positional", avatarSeed: "n64ai026" },
  { key: "nine64_ai_027", name: "Halden Lemaitre", targetRating: 1345, personality: "solid", avatarSeed: "n64ai027" },
  { key: "nine64_ai_028", name: "Ivo Trevallion", targetRating: 1363, personality: "fortress", avatarSeed: "n64ai028" },
  { key: "nine64_ai_029", name: "Nerida Aldritch", targetRating: 1381, personality: "positional", avatarSeed: "n64ai029" },
  { key: "nine64_ai_030", name: "Quill Verrick", targetRating: 1399, personality: "solid", avatarSeed: "n64ai030" },
  { key: "nine64_ai_031", name: "Bastien Ostrand", targetRating: 1400, personality: "fortress", avatarSeed: "n64ai031" },
  { key: "nine64_ai_032", name: "Yara Rosch", targetRating: 1415, personality: "positional", avatarSeed: "n64ai032" },
  { key: "nine64_ai_033", name: "Kelvar Terran", targetRating: 1431, personality: "solid", avatarSeed: "n64ai033" },
  { key: "nine64_ai_034", name: "Mirko Calder", targetRating: 1446, personality: "fortress", avatarSeed: "n64ai034" },
  { key: "nine64_ai_035", name: "Solveig Duval", targetRating: 1461, personality: "positional", avatarSeed: "n64ai035" },
  { key: "nine64_ai_036", name: "Ander Renholt", targetRating: 1477, personality: "solid", avatarSeed: "n64ai036" },
  { key: "nine64_ai_037", name: "Ravel Grimsby", targetRating: 1492, personality: "fortress", avatarSeed: "n64ai037" },
  { key: "nine64_ai_038", name: "Ceres Nystrom", targetRating: 1507, personality: "positional", avatarSeed: "n64ai038" },
  { key: "nine64_ai_039", name: "Dorian Ulriksen", targetRating: 1522, personality: "solid", avatarSeed: "n64ai039" },
  { key: "nine64_ai_040", name: "Fenna Cormier", targetRating: 1538, personality: "fortress", avatarSeed: "n64ai040" },
  { key: "nine64_ai_041", name: "Garrik Jankowski", targetRating: 1553, personality: "positional", avatarSeed: "n64ai041" },
  { key: "nine64_ai_042", name: "Hestia Rimbaud", targetRating: 1568, personality: "solid", avatarSeed: "n64ai042" },
  { key: "nine64_ai_043", name: "Ines Ysander", targetRating: 1584, personality: "fortress", avatarSeed: "n64ai043" },
  { key: "nine64_ai_044", name: "Jorvik Quintrell", targetRating: 1599, personality: "positional", avatarSeed: "n64ai044" },
  { key: "nine64_ai_045", name: "Kiran Brightwater", targetRating: 1600, personality: "solid", avatarSeed: "n64ai045" },
  { key: "nine64_ai_046", name: "Liora Falkenrath", targetRating: 1615, personality: "fortress", avatarSeed: "n64ai046" },
  { key: "nine64_ai_047", name: "Mattis Bright", targetRating: 1631, personality: "positional", avatarSeed: "n64ai047" },
  { key: "nine64_ai_048", name: "Nils Wexley", targetRating: 1646, personality: "solid", avatarSeed: "n64ai048" },
  { key: "nine64_ai_049", name: "Ondra Ilves", targetRating: 1661, personality: "fortress", avatarSeed: "n64ai049" },
  { key: "nine64_ai_050", name: "Petra Ostmark", targetRating: 1677, personality: "positional", avatarSeed: "n64ai050" },
  { key: "nine64_ai_051", name: "Quintus Eberhard", targetRating: 1692, personality: "solid", avatarSeed: "n64ai051" },
  { key: "nine64_ai_052", name: "Rasmus Lindqvist", targetRating: 1707, personality: "fortress", avatarSeed: "n64ai052" },
  { key: "nine64_ai_053", name: "Sonja Steinbach", targetRating: 1722, personality: "positional", avatarSeed: "n64ai053" },
  { key: "nine64_ai_054", name: "Torin Aberdene", targetRating: 1738, personality: "solid", avatarSeed: "n64ai054" },
  { key: "nine64_ai_055", name: "Ulla Hjelm", targetRating: 1753, personality: "fortress", avatarSeed: "n64ai055" },
  { key: "nine64_ai_056", name: "Varek Orsini", targetRating: 1768, personality: "positional", avatarSeed: "n64ai056" },
  { key: "nine64_ai_057", name: "Wren Westergaard", targetRating: 1784, personality: "solid", avatarSeed: "n64ai057" },
  { key: "nine64_ai_058", name: "Xanthe Marlow", targetRating: 1799, personality: "fortress", avatarSeed: "n64ai058" },
  { key: "nine64_ai_059", name: "Ysolde Ferrow", targetRating: 1800, personality: "positional", avatarSeed: "n64ai059" },
  { key: "nine64_ai_060", name: "Zeno Thorne", targetRating: 1818, personality: "solid", avatarSeed: "n64ai060" },
  { key: "nine64_ai_061", name: "Alcott Corvid", targetRating: 1836, personality: "fortress", avatarSeed: "n64ai061" },
  { key: "nine64_ai_062", name: "Brann Bellamy", targetRating: 1854, personality: "positional", avatarSeed: "n64ai062" },
  { key: "nine64_ai_063", name: "Cyra Ravensby", targetRating: 1872, personality: "solid", avatarSeed: "n64ai063" },
  { key: "nine64_ai_064", name: "Delph Sundqvist", targetRating: 1890, personality: "fortress", avatarSeed: "n64ai064" },
  { key: "nine64_ai_065", name: "Emrik Cavell", targetRating: 1909, personality: "positional", avatarSeed: "n64ai065" },
  { key: "nine64_ai_066", name: "Faelan Jorstad", targetRating: 1927, personality: "solid", avatarSeed: "n64ai066" },
  { key: "nine64_ai_067", name: "Gilda Quirke", targetRating: 1945, personality: "fortress", avatarSeed: "n64ai067" },
  { key: "nine64_ai_068", name: "Hollis Yarrow", targetRating: 1963, personality: "positional", avatarSeed: "n64ai068" },
  { key: "nine64_ai_069", name: "Isolt Fairholt", targetRating: 1981, personality: "solid", avatarSeed: "n64ai069" },
  { key: "nine64_ai_070", name: "Janek Mirandola", targetRating: 1999, personality: "fortress", avatarSeed: "n64ai070" },
  { key: "nine64_ai_071", name: "Kaspar Ussher", targetRating: 2000, personality: "positional", avatarSeed: "n64ai071" },
  { key: "nine64_ai_072", name: "Lune Lane", targetRating: 2022, personality: "solid", avatarSeed: "n64ai072" },
  { key: "nine64_ai_073", name: "Merrow Dunmore", targetRating: 2044, personality: "fortress", avatarSeed: "n64ai073" },
  { key: "nine64_ai_074", name: "Nadia Vance", targetRating: 2066, personality: "positional", avatarSeed: "n64ai074" },
  { key: "nine64_ai_075", name: "Oren Penhale", targetRating: 2088, personality: "solid", avatarSeed: "n64ai075" },
  { key: "nine64_ai_076", name: "Pell Mistral", targetRating: 2111, personality: "fortress", avatarSeed: "n64ai076" },
  { key: "nine64_ai_077", name: "Rivka Idris", targetRating: 2133, personality: "positional", avatarSeed: "n64ai077" },
  { key: "nine64_ai_078", name: "Sedric Ashcombe", targetRating: 2155, personality: "solid", avatarSeed: "n64ai078" },
  { key: "nine64_ai_079", name: "Thalia Tamsin", targetRating: 2177, personality: "fortress", avatarSeed: "n64ai079" },
  { key: "nine64_ai_080", name: "Ulric Hartvig", targetRating: 2199, personality: "positional", avatarSeed: "n64ai080" },
  { key: "nine64_ai_081", name: "Verity Okonkwo", targetRating: 2200, personality: "solid", avatarSeed: "n64ai081" },
  { key: "nine64_ai_082", name: "Wilder Vasquez", targetRating: 2228, personality: "fortress", avatarSeed: "n64ai082" },
  { key: "nine64_ai_083", name: "Yusra Drakos", targetRating: 2257, personality: "positional", avatarSeed: "n64ai083" },
  { key: "nine64_ai_084", name: "Zoran Kovac", targetRating: 2285, personality: "solid", avatarSeed: "n64ai084" },
  { key: "nine64_ai_085", name: "Anouk Svensk", targetRating: 2314, personality: "fortress", avatarSeed: "n64ai085" },
  { key: "nine64_ai_086", name: "Brecht Zaharov", targetRating: 2342, personality: "positional", avatarSeed: "n64ai086" },
  { key: "nine64_ai_087", name: "Cirel Halloway", targetRating: 2371, personality: "solid", avatarSeed: "n64ai087" },
  { key: "nine64_ai_088", name: "Dax Kestrelin", targetRating: 2399, personality: "fortress", avatarSeed: "n64ai088" },
  { key: "nine64_ai_089", name: "Eira Aldwin", targetRating: 2400, personality: "positional", avatarSeed: "n64ai089" },
  { key: "nine64_ai_090", name: "Fintan Orlov", targetRating: 2450, personality: "solid", avatarSeed: "n64ai090" },
  { key: "nine64_ai_091", name: "Greta Norvald", targetRating: 2500, personality: "fortress", avatarSeed: "n64ai091" },
  { key: "nine64_ai_092", name: "Hakon Norrsken", targetRating: 2549, personality: "positional", avatarSeed: "n64ai092" },
  { key: "nine64_ai_093", name: "Idris Kildare", targetRating: 2599, personality: "solid", avatarSeed: "n64ai093" },
  { key: "nine64_ai_094", name: "Joss Fyrlund", targetRating: 2600, personality: "fortress", avatarSeed: "n64ai094" },
  { key: "nine64_ai_095", name: "Kalev Morvan", targetRating: 2666, personality: "positional", avatarSeed: "n64ai095" },
  { key: "nine64_ai_096", name: "Lior Torvald", targetRating: 2733, personality: "solid", avatarSeed: "n64ai096" },
  { key: "nine64_ai_097", name: "Maja Blackwood", targetRating: 2799, personality: "fortress", avatarSeed: "n64ai097" },
  { key: "nine64_ai_098", name: "Nero Ivarsen", targetRating: 2800, personality: "positional", avatarSeed: "n64ai098" },
  { key: "nine64_ai_099", name: "Ottil Pyrrhus", targetRating: 2999, personality: "solid", avatarSeed: "n64ai099" },
  { key: "nine64_ai_100", name: "Pavel Xiomar", targetRating: 3000, personality: "fortress", avatarSeed: "n64ai100" },
];

export const AI_ROSTER_SIZE = 100;

export function aiRosterByKey(key: string): AiRosterEntry | undefined {
  return AI_ROSTER.find((entry) => entry.key === key);
}
