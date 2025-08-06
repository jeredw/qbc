import { html, Component } from 'htm/preact'

export interface ProgramEntry {
  name: string;
  archivePath: string;
  title: string;
  author?: string;
  date: string;
  screenshot: string;
  tags: string[];
  specs: string;
  usage: string;
  notes: string;
}

export class ProgramCard extends Component {
  launch(archive: string, program: string) {
    const channel = new BroadcastChannel('catalog');
    channel.postMessage(
      JSON.stringify({
        command: 'run',
        archive,
        program
      })
    );
  }

  render(props) {
    return html`
<article class="program-card">
  <div class="stamp"
       onClick=${() => this.launch(props.entry.archivePath, props.entry.name)}>
    <div class="name">${props.entry.name.toUpperCase()}</div>
    <div class="screenshot">
      <img class="screenshot-image" src="${props.entry.screenshot}" />
    </div>
  </div>
  <div class="metadata">
    <div class="title">${props.entry.title} by ${props.entry.author}</div>
    <div class="date">${props.entry.date}</div>
    <div class="tags">${props.entry.tags.join(', ')}</div>
    <div class="specs">
Specs
  ${props.entry.specs}
    </div>
    <div class="controls">
Controls
  ${props.entry.usage}
    </div>
    <div class="notes">
Notes
  ${props.entry.notes}
    </div>
  </div>
</article>
`;
  }
}