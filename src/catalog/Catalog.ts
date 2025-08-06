import { html, render } from 'htm/preact'
import { ProgramCard, ProgramEntry } from './ProgramCard.ts'

const TEST_ENTRY: ProgramEntry = {
  name: "kalvi.bas",
  archivePath: "/catalog/assets/kalvi.zip",
  title: "Kamikaze Aliens VI",
  author: "Jester",
  date: "January 1997",
  screenshot: "/catalog/assets/kalvi.bas.png",
  tags: ["game", "shmup", "space"],
  specs: `
    Mode 12 graphics
    Keyboard, PC Speaker
    QBasic`,
  usage: `
    Up/Down/Left/Right - move
    Space - shoot
    Escape - exit`,
  notes: `
    Speed is messed up`,
}

function App() {
  return html`
    <${ProgramCard} entry=${TEST_ENTRY} />
    <${ProgramCard} entry=${TEST_ENTRY} />
    <${ProgramCard} entry=${TEST_ENTRY} />
  `;
}

render(
  html`<${App} />`,
  document.querySelector('#app')!
);