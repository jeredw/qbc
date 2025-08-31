<script lang="ts">
  import ProgramCard from './ProgramCard.svelte';
  let { programs } = $props();
</script>

<section class="scroller">
{#each programs as program}
  <ProgramCard {...program} />
{/each}
</section>

<style>
.scroller {
  position: relative;
  overflow: scroll;
  scroll-snap-type: y mandatory;
  display: flex;
  flex-direction: column;
  height: 100vh;
  gap: 60px;
  align-items: center;
}
</style>