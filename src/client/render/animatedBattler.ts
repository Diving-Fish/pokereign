import { type Container, type Sprite } from "pixi.js";
import { GifSprite, type GifSource } from "pixi.js/gif";
import { getCachedGif, loadGif } from "./gifLoader";

/**
 * Drives one battler's animated (GIF) sprite. The static PNG (`fallback`) is
 * kept current but stays hidden — it is shown ONLY if the GIF genuinely fails
 * to load, never as a loading placeholder, so the low-res Gen5 still never
 * flashes in at battle start.
 *
 * When the `GifSource` is already cached (preloaded), it attaches synchronously
 * within the same frame — zero async gap. GifSprite can't swap its source after
 * construction, so changing species tears the old one down and rebuilds —
 * infrequent (battle start / switch), so the churn is fine.
 */
export type AnimatedBattler = {
  /** Request an animated sprite by URL; attaches from cache synchronously, else loads. */
  request: (gifUrl: string) => void;
  /** The node currently on screen: the GifSprite once loaded, else the fallback. */
  active: () => Sprite;
  /** Source pixel size of the active node (GIF frame size, or the PNG texture). */
  naturalSize: () => { width: number; height: number };
};

export function createAnimatedBattler(parent: Container, fallback: Sprite): AnimatedBattler {
  let gif: GifSprite | null = null;
  let gifSize = { width: 0, height: 0 };
  let loadedUrl = "";
  let pendingUrl = "";

  // Hidden by default: only revealed on a genuine GIF load failure.
  fallback.visible = false;

  function attach(source: GifSource, gifUrl: string): void {
    if (gif) gif.destroy();
    const next = new GifSprite({ source, autoPlay: true, loop: true });
    next.anchor.set(0.5, 1);
    const index = parent.getChildIndex(fallback);
    parent.addChildAt(next, index + 1);
    gif = next;
    gifSize = { width: source.width, height: source.height };
    loadedUrl = gifUrl;
    pendingUrl = "";
    fallback.visible = false;
  }

  function request(gifUrl: string): void {
    if (gifUrl === loadedUrl || gifUrl === pendingUrl) return;

    // Species changed: drop the old GIF so it never lingers on the wrong mon.
    if (gif) {
      gif.destroy();
      gif = null;
    }
    loadedUrl = "";

    const cached = getCachedGif(gifUrl);
    if (cached) {
      attach(cached, gifUrl); // synchronous — no Gen5 frame
      return;
    }

    // Not preloaded yet: load async, keep the fallback hidden meanwhile (the
    // intro fade covers the gap), and reveal the static PNG only on failure.
    pendingUrl = gifUrl;
    fallback.visible = false;
    void loadGif(gifUrl)
      .then((source) => {
        if (pendingUrl === gifUrl) attach(source, gifUrl);
      })
      .catch(() => {
        if (pendingUrl === gifUrl) {
          pendingUrl = "";
          fallback.visible = true;
        }
      });
  }

  function active(): Sprite {
    return gif ?? fallback;
  }

  function naturalSize(): { width: number; height: number } {
    if (gif) return gifSize;
    const frame = fallback.texture.frame;
    return { width: frame.width || 96, height: frame.height || 96 };
  }

  return { request, active, naturalSize };
}
