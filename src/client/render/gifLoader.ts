import { CanvasSource, Texture } from "pixi.js";
import { GifSource } from "pixi.js/gif";
import { parseGIF, decompressFrames, type ParsedFrame } from "gifuct-js";

/**
 * In-house GIF → GifSource decoder.
 *
 * Why not just `Assets.load(url)` (pixi.js/gif's built-in loader)? That decoder
 * clears the WHOLE canvas between frames on disposal method 2 ("restore to
 * background"). Showdown's animated sprites store frame 1 full-size and every
 * later frame as a sub-rect patch with disposal 2 — so clearing the whole
 * canvas drops the pixels outside each shrinking patch (e.g. bulbasaur's left
 * column), making the sprite flicker. The GIF spec only restores the FRAME's
 * own rect; native <img> decoding (what Showdown uses) does exactly that and
 * doesn't flicker. We replicate pixi's loop verbatim except for that one line.
 *
 * We also keep our own cache instead of going through Assets, so the corrected
 * decode path is the only one used and synchronous cache hits stay simple.
 */
const resolved = new Map<string, GifSource>();
const inflight = new Map<string, Promise<GifSource>>();

/** Synchronously returns an already-decoded GifSource, or undefined if not loaded yet. */
export function getCachedGif(url: string): GifSource | undefined {
  return resolved.get(url);
}

/** Loads + decodes a GIF (deduped + cached). Resolves to a reusable GifSource. */
export function loadGif(url: string): Promise<GifSource> {
  const cached = resolved.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;

  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`GIF ${url} -> HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      const source = decodeGifSource(buffer);
      resolved.set(url, source);
      inflight.delete(url);
      return source;
    })
    .catch((error: unknown) => {
      inflight.delete(url);
      throw error;
    });

  inflight.set(url, promise);
  return promise;
}

function decodeGifSource(buffer: ArrayBuffer): GifSource {
  const gif = parseGIF(buffer) as { lsd: { width: number; height: number } };
  const gifFrames = decompressFrames(gif, true);

  const animWidth = gif.lsd.width;
  const animHeight = gif.lsd.height;
  const canvas = document.createElement("canvas");
  canvas.width = animWidth;
  canvas.height = animHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const patchCanvas = document.createElement("canvas");
  const patchContext = patchCanvas.getContext("2d");
  if (!context || !patchContext) throw new Error("Failed to acquire 2D context for GIF decode");

  const frames: { texture: Texture<CanvasSource>; start: number; end: number }[] = [];
  const defaultDelay = 1000 / 30;
  let time = 0;
  let previousFrame: ImageData | null = null;

  for (const frame of gifFrames as ParsedFrame[]) {
    const disposalType = frame.disposalType ?? 2;
    const delay = frame.delay || defaultDelay;
    const { width, height, left, top } = frame.dims;

    patchCanvas.width = width;
    patchCanvas.height = height;
    patchContext.clearRect(0, 0, width, height);
    const patchData = patchContext.createImageData(width, height);
    patchData.data.set(frame.patch);
    patchContext.putImageData(patchData, 0, 0);

    if (disposalType === 3) {
      previousFrame = context.getImageData(0, 0, animWidth, animHeight);
    }

    context.drawImage(patchCanvas, left, top);
    const imageData = context.getImageData(0, 0, animWidth, animHeight);

    if (disposalType === 2) {
      // FIX vs pixi.js/gif: restore only THIS frame's rect to background, not the
      // whole canvas — otherwise sub-rect patches drop the persistent pixels.
      context.clearRect(left, top, width, height);
    } else if (disposalType === 3 && previousFrame) {
      context.putImageData(previousFrame, 0, 0);
    }

    const resource = document.createElement("canvas");
    resource.width = imageData.width;
    resource.height = imageData.height;
    resource.getContext("2d")?.putImageData(imageData, 0, 0);

    frames.push({
      start: time,
      end: time + delay,
      texture: new Texture({ source: new CanvasSource({ resource }) })
    });
    time += delay;
  }

  canvas.width = canvas.height = 0;
  patchCanvas.width = patchCanvas.height = 0;
  return new GifSource(frames);
}
