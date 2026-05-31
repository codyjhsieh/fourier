import { Game } from "./game/Game";

const mount = document.getElementById("app")!;
const game = new Game();
game.init(mount).catch((err) => {
  console.error("Failed to start A Line Remembered:", err);
  const el = document.getElementById("loading");
  if (el) el.textContent = "failed to load — see console";
});
