import type { TextStyleFontWeight } from "pixi.js";

/**
 * Shared visual language for the "golden-hour handheld" battle aesthetic.
 * One palette + a small set of text styles so every panel reads as one design.
 */

// Pixel CJK font with graceful fallback to the platform monospace.
// Loaded via @font-face in styles.css; existing Text objects use this family
// and fall back gracefully until the browser finishes loading it.
export const FONT_PIXEL = '"Zpix", "DotGothic16", "Courier New", monospace';

export const PALETTE = {
  // Atmosphere
  skyTop: "#33406f",
  skyMid: "#8a6f97",
  skyHorizon: "#f3b16a",
  hillFar: "#6a6d96",
  hillNear: "#7c8a64",
  field: "#8aa856",
  fieldStripe: "#789843",
  sun: "#ffe6a8",

  // Panels (dark slate glass + warm ink)
  panelBack: "#221f33",
  panelFace: "#2e2a44",
  panelEdgeLight: "#5b5378",
  panelEdgeDark: "#15131f",
  ink: "#f6edcf",
  inkSoft: "#c8bfa2",
  gold: "#e9c065",

  // Command box (warm parchment)
  boxFace: "#f7f0d8",
  boxFaceLow: "#e7dcba",
  boxEdge: "#2c2740",
  boxInk: "#3a3450",
  boxInkSoft: "#8a8068",
  select: "#2f63b8",
  selectGlow: "#cf9d3a",

  // HP states
  hpHigh: "#5fd36b",
  hpHighLow: "#2f9a45",
  hpMid: "#f2cf3b",
  hpMidLow: "#c79420",
  hpLow: "#ec5a48",
  hpLowLow: "#b32f2f",
  hpTrack: "#13111c",

  // Interactive buttons (dark slate gem on the parchment command bar)
  btnEdge: "#15131f",
  btnBorder: "#0c0a14",
  btnFaceTop: "#3c3858",
  btnFaceBottom: "#2a2740",
  btnInk: "#f6edcf",
  btnInkSoft: "#c8bfa2",
  btnDisabledInk: "#8a8270"
} as const;

/** Per-element accent colors for move buttons and type pills. */
export const TYPE_COLORS: Record<string, string> = {
  normal: "#b8b393",
  fire: "#f1683b",
  water: "#4f9fe8",
  grass: "#5fb44e",
  electric: "#f4cd44",
  flying: "#9bb6e8",
  rock: "#c1a460",
  ground: "#dcb45a"
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? "#cccccc";
}

/** Damage-category accent colors (physical / special / status). */
export const CATEGORY_COLORS: Record<string, string> = {
  physical: "#e0683a",
  special: "#3f7fd0",
  status: "#7fae6a"
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#999999";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Shift a hex color toward white (amount > 0) or black (amount < 0). `amount`
 * is in [-1, 1]; used for button hover/press shading and type-tinted faces.
 */
export function adjustColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = amount >= 0 ? 255 : 0;
  const k = Math.abs(amount);
  const mix = (c: number) => c + (target - c) * k;
  return rgbToHex(mix(r), mix(g), mix(b));
}

export function hpColors(ratio: number): { hi: string; lo: string } {
  if (ratio > 0.5) return { hi: PALETTE.hpHigh, lo: PALETTE.hpHighLow };
  if (ratio > 0.2) return { hi: PALETTE.hpMid, lo: PALETTE.hpMidLow };
  return { hi: PALETTE.hpLow, lo: PALETTE.hpLowLow };
}

type TextStyleInput = {
  fill?: string;
  fontSize?: number;
  fontWeight?: TextStyleFontWeight;
  letterSpacing?: number;
  wordWrapWidth?: number;
  shadow?: boolean;
  shadowColor?: string;
};

export function pixelText(input: TextStyleInput) {
  const {
    fill = PALETTE.ink,
    fontSize = 18,
    fontWeight = "400",
    letterSpacing = 0,
    wordWrapWidth,
    shadow = false,
    shadowColor = "#00000088"
  } = input;

  return {
    fill,
    fontFamily: FONT_PIXEL,
    fontSize,
    fontWeight,
    letterSpacing,
    ...(wordWrapWidth ? { wordWrap: true as const, wordWrapWidth } : {}),
    ...(shadow
      ? {
          dropShadow: {
            color: shadowColor,
            blur: 0,
            distance: 2,
            angle: Math.PI / 2,
            alpha: 1
          }
        }
      : {})
  };
}
