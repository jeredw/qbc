<script lang="ts">
  let props = $props();

  function launch(archive: string, program: string, frameLock: boolean, speed: number) {
    const channel = new BroadcastChannel('catalog');
    channel.postMessage(
      JSON.stringify({
        command: 'run',
        archive,
        program,
        frameLock,
        speed,
      })
    );
  }

  function indentLines(lines: string): string {
    return lines.split('\n').map((line) => `    ${line}`).join('\n');
  }
</script>

<article class="program-card">
  <button class="stamp"
          onclick={() => launch(props.archivePath, props.name, props.frameLock, props.speed)}>
    <div class="name">{props.name.toUpperCase()}</div>
    <div class="screenshot">
      <img class="screenshot-image" alt="{props.name} screenshot" src="{props.screenshot}" />
    </div>
  </button>
  <div class="metadata">
    <div class="title">{props.title}</div>
    <div class="byline">by {props.author} ({props.date})</div>
    <div class="tags">{props.tags.join(', ')}</div>
    <div class="specs">
Specs<br />
  {indentLines(props.specs)}
    </div>
    <div class="controls">
Controls<br />
  {indentLines(props.usage)}
    </div>
    <div class="notes">
Notes<br />
  {indentLines(props.notes)}
    </div>
  </div>
</article>

<style>
.program-card {
  background: var(--qbc-black);
  box-shadow: 16px 26px 2px 1px rgb(0 0 20 / 0.5);
  display: flex;
  min-width: 700px;
  width: 60vw;
  min-height: 50vh;
  scroll-snap-stop: normal;
  scroll-snap-align: center;
  gap: 50px;
  padding: 20px;
  border: 2px solid var(--qbc-green);
  outline-offset: 2px;
  outline: 2px solid var(--qbc-green);
  align-items: start;
  margin: 20px;
}

.stamp {
  background: none;
  border: none;
  font: inherit;
  text-align: inherit;
  cursor: pointer;
}

.tags {
  font-size: 16px;
  margin-bottom: 22px;
}

.name, .title {
  color: var(--qbc-white);
  font-size: 32px;
}

.screenshot {
  width: 320px;
}

.screenshot-image {
  width: 320px;
  aspect-ratio: 4 / 3;
}

.controls, .specs, .notes {
  white-space: pre;
}
</style>