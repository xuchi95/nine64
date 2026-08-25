export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
  /** highlight for last move */
  lastMove: string;
  /** selected square */
  selected: string;
  /** move dot / capture ring color */
  hint: string;
  coord: string;
  frame: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: "walnut",
    name: "Walnut",
    light: "#e6d3b3",
    dark: "#9b6b43",
    lastMove: "rgba(247, 199, 90, 0.42)",
    selected: "rgba(247, 199, 90, 0.55)",
    hint: "rgba(38, 26, 16, 0.32)",
    coord: "rgba(30, 20, 12, 0.55)",
    frame: "#3a2618",
  },
  {
    id: "green",
    name: "Green",
    light: "#eeeed2",
    dark: "#769656",
    lastMove: "rgba(255, 236, 122, 0.45)",
    selected: "rgba(255, 236, 122, 0.6)",
    hint: "rgba(20, 40, 20, 0.3)",
    coord: "rgba(20, 40, 20, 0.55)",
    frame: "#3d5233",
  },
  {
    id: "blue",
    name: "Blue",
    light: "#dee3e6",
    dark: "#788ca8",
    lastMove: "rgba(120, 190, 255, 0.42)",
    selected: "rgba(120, 190, 255, 0.55)",
    hint: "rgba(18, 30, 44, 0.3)",
    coord: "rgba(18, 30, 44, 0.55)",
    frame: "#33445c",
  },
  {
    id: "slate",
    name: "Slate",
    light: "#cfd3d8",
    dark: "#6b7280",
    lastMove: "rgba(250, 220, 130, 0.4)",
    selected: "rgba(250, 220, 130, 0.55)",
    hint: "rgba(20, 22, 26, 0.32)",
    coord: "rgba(20, 22, 26, 0.55)",
    frame: "#31353b",
  },
  {
    id: "marble",
    name: "Marble",
    light: "#f2efe9",
    dark: "#b0a99f",
    lastMove: "rgba(224, 186, 118, 0.45)",
    selected: "rgba(224, 186, 118, 0.6)",
    hint: "rgba(40, 36, 30, 0.28)",
    coord: "rgba(40, 36, 30, 0.5)",
    frame: "#4b463f",
  },
  {
    id: "midnight",
    name: "Midnight",
    light: "#5b6c8a",
    dark: "#2b3245",
    lastMove: "rgba(120, 170, 255, 0.35)",
    selected: "rgba(140, 185, 255, 0.5)",
    hint: "rgba(230, 238, 255, 0.3)",
    coord: "rgba(226, 234, 250, 0.6)",
    frame: "#151a26",
  },
  {
    id: "night",
    name: "Night",
    light: "#3c4250",
    dark: "#1b1f27",
    lastMove: "rgba(247, 199, 90, 0.3)",
    selected: "rgba(247, 199, 90, 0.44)",
    hint: "rgba(236, 240, 248, 0.34)",
    coord: "rgba(226, 232, 244, 0.55)",
    frame: "#0d1015",
  },
  {
    id: "heritage",
    name: "Heritage",
    light: "#f0e2c4",
    dark: "#8a5a34",
    lastMove: "rgba(226, 170, 74, 0.45)",
    selected: "rgba(226, 170, 74, 0.6)",
    hint: "rgba(52, 33, 16, 0.34)",
    coord: "rgba(52, 33, 16, 0.6)",
    frame: "#4a3018",
  },
  {
    id: "amber",
    name: "Amber",
    light: "#f6e0b0",
    dark: "#b07a2c",
    lastMove: "rgba(255, 226, 150, 0.5)",
    selected: "rgba(255, 226, 150, 0.62)",
    hint: "rgba(60, 38, 10, 0.3)",
    coord: "rgba(60, 38, 10, 0.6)",
    frame: "#5c3d12",
  },
  {
    id: "ember",
    name: "Ember",
    light: "#4a3b34",
    dark: "#26191a",
    lastMove: "rgba(255, 140, 80, 0.34)",
    selected: "rgba(255, 160, 100, 0.5)",
    hint: "rgba(255, 224, 200, 0.32)",
    coord: "rgba(255, 226, 206, 0.6)",
    frame: "#170f10",
  },
];


export interface PieceSet {
  id: string;
  name: string;
  /** glyph stroke width relative to square */
  stroke: number;
  /** relative glyph size */
  scale: number;
  weight: number;
  shadow: boolean;
  lightFill: string;
  lightStroke: string;
  darkFill: string;
  darkStroke: string;
}

export const PIECE_SETS: PieceSet[] = [
  {
    id: "classic",
    name: "Classic",
    stroke: 0.022,
    scale: 0.82,
    weight: 400,
    shadow: true,
    lightFill: "#fdfdfb",
    lightStroke: "#26201a",
    darkFill: "#2a2622",
    darkStroke: "#efeae2",
  },
  {
    id: "modern",
    name: "Modern",
    stroke: 0.016,
    scale: 0.8,
    weight: 500,
    shadow: true,
    lightFill: "#ffffff",
    lightStroke: "#1d2430",
    darkFill: "#1f2733",
    darkStroke: "#dfe6f0",
  },
  {
    id: "minimal",
    name: "Minimal",
    stroke: 0,
    scale: 0.74,
    weight: 400,
    shadow: false,
    lightFill: "#f7f7f5",
    lightStroke: "transparent",
    darkFill: "#232323",
    darkStroke: "transparent",
  },
  {
    id: "tournament",
    name: "Tournament",
    stroke: 0.026,
    scale: 0.85,
    weight: 600,
    shadow: true,
    lightFill: "#f6efe1",
    lightStroke: "#2f2517",
    darkFill: "#20190f",
    darkStroke: "#e9dcc3",
  },
  {
    id: "neo",
    name: "Neo",
    stroke: 0.014,
    scale: 0.78,
    weight: 500,
    shadow: false,
    lightFill: "#f2f6ff",
    lightStroke: "#0f2033",
    darkFill: "#14202e",
    darkStroke: "#9fd0ff",
  },
  {
    id: "nocturne",
    name: "Nocturne",
    stroke: 0.02,
    scale: 0.82,
    weight: 600,
    shadow: true,
    lightFill: "#f4f1ea",
    lightStroke: "#141821",
    darkFill: "#14181f",
    darkStroke: "#f3c96b",
  },
  {
    id: "heritage",
    name: "Heritage",
    stroke: 0.024,
    scale: 0.84,
    weight: 500,
    shadow: true,
    lightFill: "#fbf1dc",
    lightStroke: "#3b2a15",
    darkFill: "#2b1d10",
    darkStroke: "#e2c48b",
  },
];


export function getBoardTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0]!;
}

export function getPieceSet(id: string): PieceSet {
  return PIECE_SETS.find((p) => p.id === id) ?? PIECE_SETS[0]!;
}
