declare module "gifuct-js" {
  export interface ParsedFrameDims {
    top: number;
    left: number;
    width: number;
    height: number;
  }
  export interface ParsedFrame {
    dims: ParsedFrameDims;
    /** RGBA pixels for the frame rect, present when decompressFrames is called with buildImagePatches=true. */
    patch: Uint8ClampedArray;
    /** Frame delay in milliseconds. */
    delay: number;
    /** GIF disposal method (1 = keep, 2 = restore background, 3 = restore previous). */
    disposalType: number;
  }
  export function parseGIF(buffer: ArrayBuffer | Uint8Array): unknown;
  export function decompressFrames(gif: unknown, buildImagePatches: boolean): ParsedFrame[];
  export function decompressFrame(frame: unknown, gct: unknown, buildImagePatch: boolean): ParsedFrame;
}
