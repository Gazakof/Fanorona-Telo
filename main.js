import "./game.js";
import { startGame, showDifficultyMenu } from "./game.js";

// ici tu connectes au HTML
document
  .getElementById("btnSGhvh")
  .addEventListener("click", () => startGame("hvh"));
btnSGava;

document
  .getElementById("btnSGava")
  .addEventListener("click", () => startGame("ava"));

document
  .getElementById("btnDM")
  .addEventListener("click", () => showDifficultyMenu());
