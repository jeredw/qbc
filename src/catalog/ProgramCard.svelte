<script lang="ts">
  let props = $props();

  function launch(archive: string, program: string) {
    const channel = new BroadcastChannel('catalog');
    channel.postMessage(
      JSON.stringify({
        command: 'run',
        archive,
        program
      })
    );
  }

  function indentLines(lines: string): string {
    return lines.split('\n').map((line) => `    ${line}`).join('\n');
  }
</script>

<article class="program-card">
  <div class="stamp"
       onclick={() => launch(props.archivePath, props.name)}>
    <div class="name">{props.name.toUpperCase()}</div>
    <div class="screenshot">
      <img class="screenshot-image" src="{props.screenshot}" />
    </div>
  </div>
  <div class="metadata">
    <div class="title">{props.title} by {props.author}</div>
    <div class="date">{props.date}</div>
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
  display: inline-flex;
  padding: 20px;
  border: 1px solid var(--qbc-brown);
  width: 700px;
}

.stamp {
  cursor: pointer;
}

.tags {
  font-size: 16px;
  margin-bottom: 22px;
}

.name, .title {
  color: var(--qbc-white);
}

.screenshot {
  width: 320px;
}

.screenshot-image {
  object-fit: cover;
  width: 320px;
}

.controls, .specs, .notes {
  white-space: pre;
}
</style>