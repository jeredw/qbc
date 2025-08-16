<script lang="ts">
  import ProgramCard from './ProgramCard.svelte';
  import type {ProgramEntry} from './Schema.ts';

  let programs: ProgramEntry[] = $state([]);

  async function fetchData() {
    const response = await fetch('/catalog/db.json');
    programs = await response.json();
  }

  fetchData();
</script>

{#each programs as program}
  <ProgramCard {...program} />
{/each}