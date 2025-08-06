import { html, render } from 'htm/preact'
import { useState, useEffect } from 'preact/hooks'
import { ProgramCard } from './ProgramCard.ts'

function App() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    async function fetchEntries() {
      const response = await fetch('/catalog/db.json');
      const entries = await response.json();
      setEntries(entries)
    }

    fetchEntries();
  }, []);

  return html`
    ${entries.map((entry) => html`<${ProgramCard} entry=${entry} />`)}
  `;
}

render(html`<${App} />`, document.querySelector('#app')!);