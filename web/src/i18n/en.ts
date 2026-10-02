/** English dictionary. Key set must stay identical to `vi.ts`. */
export const en: Record<string, string> = {
  'app.title': 'Supercat · 2D quantum simulator',
  'app.tagline': "It's all just probability, and now you can watch it.",
  'app.lang.switchToEn': 'English',
  'app.lang.switchToVi': 'Tiếng Việt',
  'app.noWebgl': 'WebGL2 is not available, so the simulator cannot render on this device.',
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
  // V-overlay legend (Task 18, spec 7.1): chip labels over the canvas naming
  // the potential overlay's colors, plus the live scale template ('{v}' is
  // the max |V| — not a single named V₀: hand-painted scenes mix barrier and
  // well heights). Explore-friendly wording — no glossary jargon. The note
  // lines (user ruling 2026-10-02) say what each shape IS and what it DOES
  // to the wave — the chip is pointer-transparent, so no tooltip can carry
  // this; it must be readable in place.
  'legend.barrier': 'Barrier',
  'legend.barrierNote': 'Energy wall: weaker waves bounce back',
  'legend.well': 'Well',
  'legend.wellNote': 'Energy dip: pulls the wave in and traps it',
  'legend.v0': 'max|V| ≈ {v}',
  // Field colormap legend (on-canvas chip, bottom-right): captions say the
  // plain word (user ruling 2026-10-02: say "probability", not |ψ|² — the
  // chip is for people who haven't met psi yet) + inferno ramp endpoint
  // words (relative scale — auto-exposure normalizes every frame to its
  // peak, so words, not numbers) + the phase variant's note that
  // brightness still carries the density under the hue wheel.
  'legend.densityCaption': 'Probability',
  'legend.momentumCaption': 'Momentum probability',
  'legend.low': 'Low',
  'legend.high': 'High',
  'legend.phaseNote': 'brightness = probability',
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
  'view.momentumCaption': 'Momentum space kx, ky (k = 0 at the center)',
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
  'obs.energyJumpNote': 'E can jump after a measurement. That is correct physics.',
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
  'preset.double-slit.teaser': 'One particle, two slits, and it interferes with itself.',
  'preset.double-slit.card':
    'A wave packet races into a wall with two open slits.\n' +
    'Beyond the wall, bright and dark bands line up evenly: the interference fingerprint of a single PARTICLE.\n' +
    'Press Reset to watch again, or erase one slit shut and watch the interference vanish.\n' +
    'The box wraps around: waves reaching an edge re-enter from the opposite side, and the packet spreads on its own, nothing is lost.',
  'preset.tunneling.title': 'Tunneling',
  'preset.tunneling.teaser': 'A faint tail behind the barrier: crossing where classical physics forbids.',
  'preset.tunneling.card':
    'Classical physics says a particle with energy E≈18 can never cross a barrier 24 high. Look closely BEHIND the barrier.\n' +
    'The faint tail that leaks through decays with the barrier thickness.\n' +
    'Draw one more barrier layer and see where the faint tail ends up.',
  'preset.free-packet.title': 'Free wave packet',
  'preset.free-packet.teaser': 'A moving packet still spreads out: momentum uncertainty at work.',
  'preset.free-packet.card':
    'A wave packet races across the box and spreads out until it fills the whole space.\n' +
    'There is no friction, only momentum uncertainty.\n' +
    'Let it run long enough and the density flattens out evenly.\n' +
    'The box wraps around: waves reaching an edge re-enter from the opposite side, and the packet spreads on its own, nothing is lost.',
  'preset.harmonic.title': 'Harmonic oscillator',
  'preset.harmonic.teaser': 'The packet orbits inside the potential bowl, as classical physics predicts.',
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
  // UI redesign (2026-10-01): section labels for the workspace side rails and
  // the scene tab bar, plus the landing hero copy. Hero values are the
  // Supercat rebrand draft (2026-10-02) — these pins are the parity baseline.
  // 'landing.title' is ONE key with
  // a literal '\n' between the two hero lines (the component renders it via
  // split('\n'), like the preset cards); 'landing.schrodinger' is decorative
  // math (aria-hidden at the call site) and identical across languages.
  'rail.tools': 'TOOLS',
  'rail.briefing': 'BRIEFING',
  'rail.readouts': 'READOUTS',
  'rail.view': 'VIEW',
  'rail.export': 'EXPORT',
  'scene.label': 'EXPERIMENT · {name}',
  'landing.kicker': 'THE MOST FAMOUS CAT IN PHYSICS NEVER EXISTED',
  'landing.title': "Don't ask if the cat's alive.\nAsk for the probability.",
  'landing.desc':
    'Does God play dice? Yes, every single attosecond. Draw barriers, fire wave packets and watch reality roll.',
  'landing.ctaPrimary': 'Open the box →',
  'landing.ctaFree': 'Free exploration',
  'landing.status': 'NOW SHOWING · {name}',
  'landing.schrodinger': 'i·ħ ∂ψ/∂t = −ħ²/2m ∇²ψ + Vψ',
  // Uses overlay (spec 2026-10-02): the equation at work in the real world,
  // opened from the top-bar chip and the briefing hook. Two-tier copy per
  // card: an easy sentence plus a mono PHYSICS line; card structure (groups,
  // watch presets) lives in ui/usesData.ts keyed by the same ids. Copy is
  // verbatim from the spec's section 5 tables.
  'uses.open': 'Uses',
  'uses.hook': 'This equation out in the world →',
  'uses.title': 'What this equation does for you',
  'uses.intro':
    "Schrödinger's equation is not locked in a lab. It runs in your pocket, keeps GPS on time, and is busy building tomorrow's machines.",
  'uses.groupToday': 'IN USE TODAY',
  'uses.groupTomorrow': 'TOMORROW',
  'uses.physicsLabel': 'PHYSICS',
  'uses.watch': 'See it: {name} →',
  'uses.close': 'Close',
  'uses.flash.title': 'Flash memory',
  'uses.flash.easy':
    'Every photo you save on a phone, SSD or memory card is written by tunneling: electrons slip through an insulating oxide layer onto a floating gate, and stay there for years.',
  'uses.flash.physics':
    'Fowler-Nordheim tunneling: the write current rides the same tail you see behind the barrier, ~ e^(−2κd).',
  'uses.stm.title': 'Scanning tunneling microscope',
  'uses.stm.easy':
    'The STM maps surfaces atom by atom. The tunneling current between its tip and the surface decays so steeply with distance that a shift of 0.1 nm changes the signal roughly tenfold.',
  'uses.stm.physics':
    'I ∝ e^(−2κz): exponential sensitivity turns a distance probe into an atom viewer.',
  'uses.chips.title': 'Chips, LEDs, lasers',
  'uses.chips.easy':
    "Solving the equation for electrons in a crystal lattice yields energy bands with forbidden gaps. Transistors switch by band design, an LED's color is a chosen gap, a laser amplifies a chosen transition.",
  'uses.chips.physics':
    'Bloch theorem: a periodic V(x) produces band structure; the gap sets the photon energy, ħω = E_gap.',
  'uses.gps.title': 'Atomic clocks and GPS',
  'uses.gps.easy':
    'The second itself is defined by a quantum jump between two energy levels of the cesium atom. GPS satellites carry such clocks; without them your position would drift by kilometers each day.',
  'uses.gps.physics':
    '1 s = 9 192 631 770 cycles of the Cs-133 hyperfine ground-state transition.',
  'uses.chemistry.title': 'Computational chemistry',
  'uses.chemistry.easy':
    'Most of computational chemistry is this equation solved approximately for electrons in molecules: screening drug candidates and designing materials before any lab work begins.',
  'uses.chemistry.physics':
    'Density functional theory (Nobel Prize in Chemistry 1998) makes approximate solutions cheap enough to run at scale.',
  'uses.sun.title': 'The sun and radioactivity',
  'uses.sun.easy':
    'The sun shines because protons tunnel through their mutual electric repulsion to fuse; the core is not hot enough to cross that barrier classically. Alpha particles escape unstable nuclei the same way.',
  'uses.sun.physics':
    'Gamow factor: fusion and alpha-decay rates lie inside e^(−2κd), exponentially sensitive to barrier width and height.',
  'uses.qcompute.title': 'Quantum computers',
  'uses.qcompute.easy':
    'A qubit carries a wavefunction, and every gate is unitary evolution: a quantum computer runs this equation as its law of motion. Results are read out with the same Born rule this sandbox uses to measure.',
  'uses.qcompute.physics':
    'Superposition plus interference: the double slit, scaled up into circuits.',
  'uses.qsensing.title': 'Quantum communication and sensing',
  'uses.qsensing.easy':
    'Quantum key distribution catches eavesdroppers because measuring disturbs the state. Matter-wave sensors turn interference into measurements of gravity and magnetic fields beyond classical limits.',
  'uses.qsensing.physics':
    'Security from the measurement postulate; sensitivity from interference between superposed paths.',
}
