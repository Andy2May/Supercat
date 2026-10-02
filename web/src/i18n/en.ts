/** English dictionary. Key set must stay identical to `vi.ts`. */
export const en: Record<string, string> = {
  'app.title': 'Supercat · 2D Quantum Lab',
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
  'uses.hook': 'Beyond the Lab →',
  'uses.title': 'What Does This Equation Do for You?',
  'uses.intro':
    "The Schrödinger equation isn't trapped in a lab. It runs silently in your pocket, keeps GPS accurate to the second, and powers the technologies of tomorrow.",
  'uses.groupToday': 'IN USE TODAY',
  'uses.groupTomorrow': 'FUTURE TECH',
  'uses.watch': 'See it: {name} →',
  'uses.close': 'Close',
  'uses.flash.title': 'Flash Memory (SSDs, USBs, Smartphones)',
  'uses.flash.easy':
    'Every photo or file saved on your phone relies on quantum tunneling. Electrons "tunnel" through a thin oxide insulating barrier into a floating gate, where they stay trapped for years without power.',
  'uses.flash.physics': 'Fowler-Nordheim Tunneling: I ∝ e^(−2κd).',
  'uses.stm.title': 'Scanning Tunneling Microscope (STM)',
  'uses.stm.easy':
    'Allows scientists to map surfaces atom by atom. The tunneling current between the needle tip and the surface is extremely sensitive: shifting by just 0.1 nm changes the current tenfold.',
  'uses.stm.physics': 'Exponential Sensitivity: I ∝ e^(−2κz).',
  'uses.chips.title': 'Silicon Chips, LEDs & Lasers',
  'uses.chips.easy':
    'Solving the Schrödinger equation for electrons in a crystal lattice reveals band structures. Transistors switch using engineered bandgaps; LED colors are tailored energy gaps, and lasers amplify light at precise quantum transitions.',
  'uses.chips.physics':
    "Bloch's Theorem defines periodic band structures; bandgap width sets photon energy: ħω = E_gap.",
  'uses.gps.title': 'Atomic Clocks & GPS',
  'uses.gps.easy':
    'The standard "1 second" is defined by a quantum transition in Cesium atoms. GPS satellites carry these atomic clocks; without them, your location mapping would drift by kilometers every day.',
  'uses.gps.physics':
    '1 second = 9,192,631,770 radiation cycles between two hyperfine ground state energy levels of Cesium-133.',
  'uses.chemistry.title': 'Computational Chemistry',
  'uses.chemistry.easy':
    'Instead of trial-and-error in labs, scientists approximate this equation for molecular electrons to model drug candidates and design novel materials entirely on supercomputers.',
  'uses.chemistry.physics':
    'Density Functional Theory (DFT), 1998 Nobel Prize in Chemistry, made approximate quantum solutions computationally viable.',
  'uses.sun.title': 'Solar Power & Alpha Decay',
  'uses.sun.easy':
    'The Sun shines because protons tunnel through electrostatic repulsion to fuse (the core is not hot enough for classical fusion). Similarly, alpha particles escape unstable nuclei via the same quantum pathway.',
  'uses.sun.physics':
    'Gamow Factor: fusion and decay rates scale exponentially with barrier thickness and height, e^(−2κd).',
  'uses.qcompute.title': 'Quantum Computing',
  'uses.qcompute.easy':
    'Each qubit represents a wavefunction, and quantum logic gates perform unitary operations on it. A quantum computer operates with the Schrödinger equation as its fundamental law of motion.',
  'uses.qcompute.physics':
    'Superposition and Interference: scaling the double-slit concept into complex quantum circuits.',
  'uses.qsensing.title': 'Quantum Sensing & Communications',
  'uses.qsensing.easy':
    'Quantum Key Distribution (QKD) detects eavesdroppers instantly because measurement collapses the state. Matter-wave sensors leverage quantum interference to measure gravity and magnetic fields with unmatchable accuracy.',
  'uses.qsensing.physics':
    'Security stems from Measurement Axioms; sensitivity derives from Phase Interference.',
}
