/** English dictionary. Key set must stay identical to `vi.ts`. */
export const en: Record<string, string> = {
  'app.title': 'Psiforge — 2D quantum simulator',
  'app.tagline': 'Quantum wave physics running right in your browser',
  'app.lang.switchToEn': 'English',
  'app.lang.switchToVi': 'Tiếng Việt',
  'app.noWebgl': 'WebGL2 is not available — the simulator cannot render on this device.',
  'app.renderFailed': 'Graphics initialization failed.',
  'app.canvasLabel': '|ψ|² probability density heatmap',
  'app.play': 'Play',
  'app.pause': 'Pause',
  'app.fatal': 'Simulation error:',
  'playback.step': 'Step',
  'playback.reset': 'Reset',
  'playback.restorePotential': 'Restore original potential',
  'playback.barLabel': 'Playback controls',
  'playback.speed': 'Speed',
  'error.resetAndRun': 'Reset & run again',
  'webgl.missingTitle': 'WebGL2 not supported',
  'perf.fps': 'FPS',
  'perf.substeps': 'substeps/frame',
  'perf.workerMs': 'worker ms',
  'tool.brush': 'Brush',
  'tool.barrier': 'Barrier',
  'tool.well': 'Well',
  'tool.eraser': 'Eraser',
  'tool.packet': 'Packet',
  'tool.height': 'Height',
  'tool.kMag': 'Momentum |k|',
  'mode.explore': 'Explore',
  'mode.advanced': 'Advanced',
  // Header toggle hint; '{mode}' is replaced with the target mode's name.
  'mode.switchHint': 'Switch to {mode}',
  // Landing/routing (Task 9): back-link out of a simulation, narration card
  // buttons, and the five preset tiles' copy. Card strings are 3-5 lines
  // separated by '\n' (one <p> per line) and must stay parallel with vi.ts.
  'app.backToLanding': '← Home',
  'preset.card.collapse': 'Collapse',
  'preset.card.show': 'Show narration',
  'preset.double-slit.title': 'Double slit',
  'preset.double-slit.teaser': 'One particle, two slits — and it interferes with itself.',
  'preset.double-slit.card':
    'A wave packet races into a wall with two open slits.\n' +
    'Beyond the wall, bright and dark bands line up evenly — the interference fingerprint of a single PARTICLE.\n' +
    'Press Reset to watch again, or erase one slit shut and watch the interference vanish.',
  'preset.tunneling.title': 'Tunneling',
  'preset.tunneling.teaser': 'A faint tail behind the barrier: crossing where classical physics forbids.',
  'preset.tunneling.card':
    'Classical physics says a particle with energy E≈18 can never cross a barrier 24 high — look closely BEHIND the barrier.\n' +
    'The faint tail that leaks through decays with the barrier thickness.\n' +
    'Draw one more barrier layer and see where the faint tail ends up.',
  'preset.free-packet.title': 'Free wave packet',
  'preset.free-packet.teaser': 'A packet at rest still spreads out — momentum uncertainty at work.',
  'preset.free-packet.card':
    'A wave packet that "sits still" spreads out on its own until it fills the whole box.\n' +
    'There is no friction — only momentum uncertainty.\n' +
    'Let it run long enough and the density flattens out evenly.',
  'preset.harmonic.title': 'Harmonic oscillator',
  'preset.harmonic.teaser': 'The packet orbits inside the potential bowl — as classical physics predicts.',
  'preset.harmonic.card':
    'The "bowl" holds the packet: its center traces a circular orbit, like a ball rolling in a basin.\n' +
    "Exactly the classical prediction (Ehrenfest's theorem).\n" +
    'Notice how the packet barely spreads.',
  'preset.sandbox.title': 'Free play',
  'preset.sandbox.teaser': 'Draw barriers, drop wave packets, and watch |ψ|² respond.',
  'preset.sandbox.card':
    'A free-play space.\n' +
    'Pick a tool to draw barriers or wells, and drop a wave packet by dragging on the canvas.\n' +
    'Watch |ψ|² respond.',
}
