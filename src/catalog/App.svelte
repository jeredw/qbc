<script lang="ts">
  import Gallery from './Gallery.svelte';
  import type {ProgramEntry} from './Schema.ts';

  let programs: ProgramEntry[] = $state([]);

  async function fetchData() {
    const response = await fetch('/catalog/db.json');
    programs = await response.json();
  }

  fetchData();
</script>

<Gallery {programs} />