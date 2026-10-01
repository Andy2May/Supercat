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
  // PNG canvas export (Task 16): playback-bar button, visible in both
  // experience modes; doubles as its aria-label.
  'export.png': 'Export PNG',
  // JSON state save/load (Task 17, advanced mode): the header Save/Load
  // state buttons, the non-fatal load-failure banner headline, and the
  // per-reason detail appended to it (StateFileError.reason).
  'export.json': 'Save state',
  'import.json': 'Load state',
  'loadFailed': 'Could not load state file',
  'loadFailed.version': 'unsupported file version',
  'loadFailed.shape': 'wrong grid dimensions',
  'loadFailed.corrupt': 'corrupt file',
  'loadFailed.dismiss': 'Dismiss',
  // 512² save-size notice (spec §5.7 + risk row "khi mở/lưu"): a 512²
  // state JSON weighs several MB — this is the transient banner shown by
  // BOTH directions (alongside the never-blocked Save download, and on
  // loading such a file), plus the dismiss control's name. Direction-
  // neutral wording by design.
  'export.sizeNote': 'Large-grid state files can weigh several megabytes',
  'export.sizeNote.dismiss': 'Dismiss',
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
  // V-overlay legend (Task 18, spec 7.1): chip labels over the canvas naming
  // the potential overlay's colors, plus the live scale template ('{v}' is
  // the max |V| — not a single named V₀: hand-painted scenes mix barrier and
  // well heights). Explore-friendly wording — no glossary jargon.
  'legend.barrier': 'Barrier',
  'legend.well': 'Well',
  'legend.v0': 'max|V| ≈ {v}',
  // Measurement (Task 14): toolbar trigger + momentum-view button + the
  // outcome toast. The result templates carry '{x}'/'{y}' placeholders
  // (physical coordinates / kx,ky wavenumbers) filled in SimCanvas.
  'measure.positionTool': 'Measure position',
  'measure.momentumTool': 'Measure momentum',
  'measure.resultPosition': 'Measured at ({x}, {y})',
  'measure.resultMomentum': 'Measured k = ({x}, {y})',
  'mode.explore': 'Explore',
  'mode.advanced': 'Advanced',
  // Position/momentum view toggle (Task 12, advanced only): which space the
  // canvas displays; the caption explains the k-space axes. Phase color
  // (Task 13) is the HSV colormap toggle next to the segmented control.
  'view.position': 'Position',
  'view.momentum': 'Momentum',
  'view.momentumCaption': 'Momentum space kx, ky — k = 0 at the center',
  'view.toggleLabel': 'Display space',
  'view.phaseColor': 'Phase color',
  // Contrast slider (Task 18, advanced mode only): scales the canvas
  // tonemap's gamma. Default 2.5 EVERYWHERE (user ruling 2026-10-01 —
  // fringes/tunneling blob clearly visible); the slider edits that global
  // value, lower crushes dim structure.
  'view.contrast': 'Contrast',
  // Header toggle hint; '{mode}' is replaced with the target mode's name.
  'mode.switchHint': 'Switch to {mode}',
  // Observables strip (Task 11, advanced mode): sparkline labels are math
  // notation (identical across languages by design), the note explains that
  // a post-measurement energy jump is real physics (glossary wires the
  // terms in Task 15).
  'obs.barLabel': 'Live observables readout',
  'obs.xMean': '⟨x⟩',
  'obs.yMean': '⟨y⟩',
  'obs.sigmaProduct': 'σx·σpx',
  'obs.sigmaProductY': 'σy·σpy',
  'obs.energy': 'E',
  'obs.energyJumpNote': 'E can jump after a measurement — that is correct physics',
  'obs.chart.means': '⟨x⟩ and ⟨y⟩ over time',
  'obs.chart.sigma': 'σx·σpx and σy·σpy over time',
  'obs.chart.energy': 'Energy E over time',
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
    'Press Reset to watch again, or erase one slit shut and watch the interference vanish.\n' +
    'The box wraps around: waves reaching an edge re-enter from the opposite side, and the packet spreads on its own — nothing is lost.',
  'preset.tunneling.title': 'Tunneling',
  'preset.tunneling.teaser': 'A faint tail behind the barrier: crossing where classical physics forbids.',
  'preset.tunneling.card':
    'Classical physics says a particle with energy E≈18 can never cross a barrier 24 high — look closely BEHIND the barrier.\n' +
    'The faint tail that leaks through decays with the barrier thickness.\n' +
    'Draw one more barrier layer and see where the faint tail ends up.',
  'preset.free-packet.title': 'Free wave packet',
  'preset.free-packet.teaser': 'A moving packet still spreads out — momentum uncertainty at work.',
  'preset.free-packet.card':
    'A wave packet races across the box and spreads out until it fills the whole space.\n' +
    'There is no friction — only momentum uncertainty.\n' +
    'Let it run long enough and the density flattens out evenly.\n' +
    'The box wraps around: waves reaching an edge re-enter from the opposite side, and the packet spreads on its own — nothing is lost.',
  'preset.harmonic.title': 'Harmonic oscillator',
  'preset.harmonic.teaser': 'The packet orbits inside the potential bowl — as classical physics predicts.',
  'preset.harmonic.card':
    'The "bowl" holds the packet: its center traces an elliptical orbit, like a ball rolling in a basin.\n' +
    "Exactly the classical prediction (Ehrenfest's theorem).\n" +
    'Notice how the packet barely spreads.',
  'preset.sandbox.title': 'Free play',
  'preset.sandbox.teaser': 'Draw barriers, drop wave packets, and watch |ψ|² respond.',
  'preset.sandbox.card':
    'A free-play space.\n' +
    'Pick a tool to draw barriers or wells, and drop a wave packet by dragging on the canvas.\n' +
    'Watch |ψ|² respond.',
}
