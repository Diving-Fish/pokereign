import { Container, Graphics, Rectangle } from "pixi.js";
import { adjustColor, PALETTE } from "./theme";

export type ButtonStyle = {
  /** Top of the face gradient. */
  faceTop?: string;
  /** Bottom of the face gradient. */
  faceBottom?: string;
  /** Left rail + hover border color. */
  accent?: string;
};

export type ButtonOptions = ButtonStyle & {
  width: number;
  height: number;
  onTap: () => void;
};

export type Button = {
  /** Root display object; add to the scene graph and toggle `visible`. */
  container: Container;
  /** Caller-owned layer for labels / icons, positioned inside the frame. */
  content: Container;
  setEnabled(enabled: boolean): void;
  setStyle(style: ButtonStyle): void;
  setSize(width: number, height: number): void;
};

type ResolvedStyle = Required<ButtonStyle>;

/**
 * A reusable pixel-handheld button: layered bevel frame with hover/press/disabled
 * states and a customizable accent + face gradient.
 *
 * Input is wired through PixiJS **pointer** events (`pointertap`, `pointerdown`,
 * ...), which the federated event system normalizes across mouse, touch, and pen.
 * The same component therefore works unchanged on desktop (click) and a future
 * mobile/touch build — callers never deal with `mousedown`/`touchstart` directly.
 */
export function createButton(options: ButtonOptions): Button {
  const container = new Container();
  container.eventMode = "static";
  container.cursor = "pointer";

  const bg = new Graphics();
  const content = new Container();
  container.addChild(bg, content);

  let width = options.width;
  let height = options.height;
  let style: ResolvedStyle = {
    faceTop: options.faceTop ?? PALETTE.btnFaceTop,
    faceBottom: options.faceBottom ?? PALETTE.btnFaceBottom,
    accent: options.accent ?? PALETTE.gold
  };
  let enabled = true;
  let hover = false;
  let pressed = false;

  function redraw(): void {
    const radius = 8;
    const faceTop = pressed ? adjustColor(style.faceTop, -0.14) : hover ? adjustColor(style.faceTop, 0.12) : style.faceTop;
    const faceBottom = pressed ? adjustColor(style.faceBottom, -0.14) : hover ? adjustColor(style.faceBottom, 0.1) : style.faceBottom;

    bg.clear();
    // Drop shadow.
    bg.roundRect(2, 3, width, height, radius).fill({ color: "#0a0911", alpha: enabled ? 0.34 : 0.18 });
    // Outer dark edge.
    bg.roundRect(0, 0, width, height, radius).fill(PALETTE.btnEdge);
    // Face: bottom tone first, then a top band to fake a vertical gradient.
    bg.roundRect(2, 2, width - 4, height - 4, radius - 1).fill(faceBottom);
    bg.roundRect(2, 2, width - 4, Math.round((height - 4) * 0.56), radius - 1).fill(faceTop);
    // Top sheen.
    bg.roundRect(5, 4, width - 10, 3, 2).fill({ color: "#ffffff", alpha: pressed ? 0.06 : 0.16 });
    // Accent rail.
    bg.roundRect(4, 6, 4, height - 12, 2).fill(style.accent);
    // Border (lights up on hover).
    bg.roundRect(2, 2, width - 4, height - 4, radius - 1).stroke({
      color: hover ? style.accent : PALETTE.btnBorder,
      width: hover ? 2 : 1.5,
      alpha: 0.85
    });

    bg.alpha = enabled ? 1 : 0.5;
    content.alpha = enabled ? 1 : 0.55;
    content.y = pressed ? 1 : 0;
    container.hitArea = new Rectangle(0, 0, width, height);
  }

  container.on("pointerover", () => {
    if (enabled) {
      hover = true;
      redraw();
    }
  });
  container.on("pointerout", () => {
    hover = false;
    pressed = false;
    redraw();
  });
  container.on("pointerdown", () => {
    if (enabled) {
      pressed = true;
      redraw();
    }
  });
  container.on("pointerup", () => {
    pressed = false;
    redraw();
  });
  container.on("pointerupoutside", () => {
    pressed = false;
    redraw();
  });
  // pointertap fires once for both a mouse click and a touch tap.
  container.on("pointertap", () => {
    if (enabled) {
      options.onTap();
    }
  });

  redraw();

  return {
    container,
    content,
    setEnabled(value: boolean): void {
      if (enabled === value) {
        return;
      }
      enabled = value;
      if (!value) {
        hover = false;
        pressed = false;
      }
      container.cursor = value ? "pointer" : "default";
      redraw();
    },
    setStyle(next: ButtonStyle): void {
      style = {
        faceTop: next.faceTop ?? style.faceTop,
        faceBottom: next.faceBottom ?? style.faceBottom,
        accent: next.accent ?? style.accent
      };
      redraw();
    },
    setSize(nextWidth: number, nextHeight: number): void {
      width = nextWidth;
      height = nextHeight;
      redraw();
    }
  };
}
