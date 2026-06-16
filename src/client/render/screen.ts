export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export function fitCanvasToWindow(canvas: HTMLCanvasElement): void {
  const scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
  canvas.style.width = `${Math.floor(GAME_WIDTH * scale)}px`;
  canvas.style.height = `${Math.floor(GAME_HEIGHT * scale)}px`;
}
