import "./game.js";
import {
  startGame,
  showDifficultyMenu,
  goHome,
  undoMove,
  restartGame,
} from "./game.js";

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

document
  .getElementById("btnSGFacile")
  .addEventListener("click", () => startGame("hva", "easy"));

document
  .getElementById("btnSGMoyen")
  .addEventListener("click", () => startGame("hva", "medium"));

document
  .getElementById("btnSGFDifficile")
  .addEventListener("click", () => startGame("hva", "hard"));

document.getElementById("btnGoHome").addEventListener("click", () => goHome());

document.getElementById("btn-undo").addEventListener("click", () => undoMove());

document
  .getElementById("btnRestart")
  .addEventListener("click", () => restartGame());

document
  .getElementById("modalBtnRestart")
  .addEventListener("click", () => restartGame());

document
  .getElementById("modalBtnGoHome")
  .addEventListener("click", () => goHome());
