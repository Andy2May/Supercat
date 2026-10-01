<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { LANDING_ORDER, type PresetId } from '../presets/index.js'

  // Local mirror of the language store (same pattern as App.svelte): the
  // derived block below re-translates the moment `setLang` fires. The
  // subscription lives in an $effect cleanup because this component mounts
  // on every landing visit — without the unsubscribe, each navigation would
  // leak a subscriber pinning a dead component's closure.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const title = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return t('app.title')
  })
  const tagline = $derived.by(() => {
    active
    return t('app.tagline')
  })

  // One tile per LANDING_ORDER slot (registry order is the product decision).
  const tiles = $derived.by(() => {
    active
    return LANDING_ORDER.map((id: PresetId) => ({
      id,
      title: t(`preset.${id}.title`),
      teaser: t(`preset.${id}.teaser`),
    }))
  })

  // Thumbnails shipped with Task 10 (public/thumbs/<id>.png). The onerror
  // fallback stays as a defensive net: if an image ever 404s or fails to
  // decode, the img hides itself and the styled aspect-ratio placeholder
  // underneath takes over — the grid still reads intentional.
  function hideThumb(event: Event): void {
    const img = event.currentTarget
    if (img instanceof HTMLImageElement) img.style.display = 'none'
  }
</script>

<main class="landing">
  <header>
    <h1>{title}</h1>
  </header>
  <p>{tagline}</p>
  <div class="tiles">
    {#each tiles as tile (tile.id)}
      <a
        class="tile"
        data-testid="preset-tile"
        data-preset={tile.id}
        href={`#/sim/${tile.id}`}
      >
        <span class="thumb" aria-hidden="true">
          <img src={`thumbs/${tile.id}.png`} alt="" onerror={hideThumb} />
        </span>
        <span class="tile-title">{tile.title}</span>
        <span class="tile-teaser">{tile.teaser}</span>
      </a>
    {/each}
  </div>
</main>

<style>
  /* Wider than the sim's 42rem main: a 5-tile grid needs the room. */
  .landing {
    max-width: 46rem;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem;
    text-align: left;
    text-decoration: none;
    color: inherit;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 0.5rem;
  }

  .tile:hover {
    border-color: currentColor;
  }

  /* Fixed-aspect thumbnail frame: the placeholder is the styled box itself,
     so a missing image still reads as a deliberate slot. */
  .thumb {
    display: block;
    aspect-ratio: 16 / 10;
    border-radius: 0.35rem;
    overflow: hidden;
    background:
      linear-gradient(
        160deg,
        color-mix(in srgb, currentColor 12%, transparent),
        color-mix(in srgb, currentColor 4%, transparent)
      );
  }

  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .tile-title {
    font-weight: 600;
  }

  .tile-teaser {
    font-size: 0.88rem;
    color: color-mix(in srgb, currentColor 75%, transparent);
  }
</style>
