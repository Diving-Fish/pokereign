import type { TextStyleFontWeight } from "pixi.js";

/**
 * Shared visual language for the "golden-hour handheld" battle aesthetic.
 * One palette + a small set of text styles so every panel reads as one design.
 */

// Pixel CJK font with graceful fallback to the platform monospace.
// Loaded via @font-face in styles.css; once the browser has it, every Text
// created after that frame picks it up automatically (we rebuild each frame).
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
  hpTrack: "#13111c"
} as const;

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
