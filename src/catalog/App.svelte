<script lang="ts">
  import ProgramCard from './ProgramCard.svelte';

  let programs = $state([]);

  async function fetchData() {
    const response = await fetch('/catalog/db.json');
    programs = await response.json();
  }

  fetchData();
</script>

{#each programs as program}
  <ProgramCard {...program} />
{/each}