/** Vietnamese dictionary. Key set must stay identical to `en.ts`. */
export const vi: Record<string, string> = {
  'app.title': 'Supercat · mô phỏng lượng tử 2D',
  'app.tagline': 'Tất cả chỉ là xác suất. Giờ bạn nhìn thấy được.',
  'app.lang.switchToEn': 'English',
  'app.lang.switchToVi': 'Tiếng Việt',
  'app.noWebgl': 'Không có WebGL2 nên trình mô phỏng không thể hiển thị trên thiết bị này.',
  'app.renderFailed': 'Lỗi khởi tạo đồ họa.',
  'app.canvasLabel': 'Bản đồ nhiệt mật độ xác suất |ψ|²',
  'app.play': 'Chạy',
  'app.pause': 'Tạm dừng',
  'app.fatal': 'Lỗi mô phỏng:',
  'playback.step': 'Bước',
  'playback.reset': 'Đặt lại',
  'playback.restorePotential': 'Khôi phục thế gốc',
  'playback.barLabel': 'Điều khiển mô phỏng',
  'playback.speed': 'Tốc độ',
  'error.resetAndRun': 'Reset & chạy lại',
  'webgl.missingTitle': 'Không hỗ trợ WebGL2',
  'perf.fps': 'FPS',
  'perf.substeps': 'bước phụ/khung',
  'perf.workerMs': 'ms worker',
  'tool.brush': 'Bút',
  'tool.barrier': 'Rào chắn',
  'tool.well': 'Giếng thế',
  'tool.eraser': 'Tẩy',
  'tool.packet': 'Gói sóng',
  'tool.height': 'Độ cao',
  'tool.kMag': 'Động lượng |k|',
  // V-overlay legend (Task 18, spec 7.1): chip labels over the canvas naming
  // the potential overlay's colors, plus the live scale template ('{v}' is
  // the max |V| — not a single named V₀: hand-painted scenes mix barrier and
  // well heights). Explore-friendly wording — no glossary jargon. The note
  // lines (user ruling 2026-10-02) say what each shape IS and what it DOES
  // to the wave — the chip is pointer-transparent, so no tooltip can carry
  // this; it must be readable in place.
  'legend.barrier': 'Rào',
  'legend.barrierNote': 'Tường năng lượng: sóng yếu hơn bị bật lại',
  'legend.well': 'Giếng',
  'legend.wellNote': 'Hố năng lượng: hút sóng vào và giữ lại',
  'legend.v0': 'max|V| ≈ {v}',
  // Field colormap legend (on-canvas chip, bottom-right): captions say the
  // plain word (user ruling 2026-10-02: "ghi hẳn xác suất", not |ψ|² — the
  // chip is for people who haven't met psi yet) + inferno ramp endpoint
  // words (relative scale — auto-exposure normalizes every frame to its
  // peak, so words, not numbers) + the phase variant's note that
  // brightness still carries the density under the hue wheel.
  'legend.densityCaption': 'Xác suất',
  'legend.momentumCaption': 'Xác suất động lượng',
  'legend.low': 'Thấp',
  'legend.high': 'Cao',
  'legend.phaseNote': 'độ sáng = xác suất',
  // Measurement (Task 14): toolbar trigger + momentum-view button + the
  // outcome toast. The result templates carry '{x}'/'{y}' placeholders
  // (physical coordinates / kx,ky wavenumbers) filled in SimCanvas.
  'measure.positionTool': 'Đo vị trí',
  'measure.momentumTool': 'Đo động lượng',
  'measure.resultPosition': 'Đo tại ({x}, {y})',
  'measure.resultMomentum': 'Đo k = ({x}, {y})',
  'mode.explore': 'Khám phá',
  'mode.advanced': 'Nâng cao',
  // Position/momentum view toggle (Task 12, advanced only): which space the
  // canvas displays; the caption explains the k-space axes. Phase color
  // (Task 13) is the HSV colormap toggle next to the segmented control.
  'view.position': 'Vị trí',
  'view.momentum': 'Động lượng',
  'view.momentumCaption': 'Không gian động lượng kx, ky (k = 0 ở giữa)',
  'view.toggleLabel': 'Không gian hiển thị',
  'view.phaseColor': 'Màu pha',
  // Contrast slider (Task 18, advanced mode only): scales the canvas
  // tonemap's gamma. Default 2.5 EVERYWHERE (user ruling 2026-10-01 —
  // fringes/tunneling blob clearly visible); the slider edits that global
  // value, lower crushes dim structure.
  'view.contrast': 'Tương phản',
  // Header toggle hint; '{mode}' is replaced with the target mode's name.
  'mode.switchHint': 'Chuyển sang {mode}',
  // Observables strip (Task 11, advanced mode): sparkline labels are math
  // notation (identical across languages by design), the note explains that
  // a post-measurement energy jump is real physics (glossary wires the
  // terms in Task 15).
  'obs.barLabel': 'Bảng quan sát được theo thời gian',
  'obs.xMean': '⟨x⟩',
  'obs.yMean': '⟨y⟩',
  'obs.sigmaProduct': 'σx·σpx',
  'obs.sigmaProductY': 'σy·σpy',
  'obs.energy': 'E',
  'obs.energyJumpNote': 'E có thể nhảy vọt sau phép đo. Đó là đúng vật lý.',
  'obs.chart.means': 'Đồ thị ⟨x⟩ và ⟨y⟩ theo thời gian',
  'obs.chart.sigma': 'Đồ thị σx·σpx và σy·σpy theo thời gian',
  'obs.chart.energy': 'Đồ thị năng lượng E theo thời gian',
  // Landing/routing (Task 9): back-link out of a simulation, narration card
  // buttons, and the five preset tiles' copy. Card strings are 3-5 lines
  // separated by '\n' (one <p> per line) and must stay parallel with en.ts.
  'app.backToLanding': '← Trang chủ',
  'preset.card.collapse': 'Thu gọn',
  'preset.card.show': 'Xem lời dẫn',
  'preset.double-slit.title': 'Khe kép',
  'preset.double-slit.teaser': 'Một hạt đi qua hai khe và tự giao thoa với chính nó.',
  'preset.double-slit.card':
    'Gói sóng lao vào tường có hai khe hở.\n' +
    'Sau tường các vạch sáng tối xếp đều: dấu vết sóng giao thoa của một HẠT.\n' +
    'Hãy Reset xem lại từ đầu, thử vẽ tẩy bịt một khe để giao thoa biến mất.\n' +
    'Hộp mô phỏng tuần hoàn: sóng chạm mép sẽ quay lại từ mép đối diện, và gói sóng tự giãn ra theo thời gian, không mất đi đâu.',
  'preset.tunneling.title': 'Xuyên hầm',
  'preset.tunneling.teaser': 'Hạt lọt qua bức rào cao hơn năng lượng của nó, chỉ để lại vệt mờ.',
  'preset.tunneling.card':
    'Vật lý cổ điển nói hạt năng lượng E≈18 không thể vượt rào cao 24. Hãy nhìn kỹ PHÍA SAU rào.\n' +
    'Vệt mờ xuyên qua suy giảm theo độ dày.\n' +
    'Hãy vẽ thêm một lớp rào nữa xem vệt mờ đi đâu.',
  'preset.free-packet.title': 'Gói sóng tự do',
  'preset.free-packet.teaser': 'Gói sóng vừa bay vừa tự giãn ra: hệ quả của bất định động lượng.',
  'preset.free-packet.card':
    'Gói sóng bay xuyên hộp và tự giãn ra, dần phủ kín không gian.\n' +
    'Không có ma sát, chỉ là bất định động lượng.\n' +
    'Để chạy lâu sẽ thấy mật độ phẳng đều.\n' +
    'Hộp mô phỏng tuần hoàn: sóng chạm mép sẽ quay lại từ mép đối diện, và gói sóng tự giãn ra theo thời gian, không mất đi đâu.',
  'preset.harmonic.title': 'Dao động điều hòa',
  'preset.harmonic.teaser': "Gói sóng chạy theo quỹ đạo elip trong 'bát' thế, đúng dự đoán cổ điển.",
  'preset.harmonic.card':
    'Gói bị "bát" giữ lại, tâm nó chạy theo quỹ đạo elip như quả bóng lăn trong chậu.\n' +
    'Đúng dự đoán cổ điển (định lý Ehrenfest).\n' +
    'Để ý gói gần như không giãn.',
  'preset.sandbox.title': 'Tự do khám phá',
  'preset.sandbox.teaser': 'Vẽ rào, thả gói sóng, và xem |ψ|² phản ứng theo ý bạn.',
  'preset.sandbox.card':
    'Vùng chơi tự do.\n' +
    'Chọn công cụ vẽ rào/giếng, thả gói sóng bằng cách kéo trên nền.\n' +
    'Xem |ψ|² phản ứng.',
  // UI redesign (2026-10-01): section labels for the workspace side rails and
  // the scene tab bar, plus the landing hero copy. Hero values are the
  // Supercat rebrand draft (2026-10-02) — these pins are the parity baseline.
  // 'landing.title' is ONE key with
  // a literal '\n' between the two hero lines (the component renders it via
  // split('\n'), like the preset cards); 'landing.schrodinger' is decorative
  // math (aria-hidden at the call site) and identical across languages.
  'rail.tools': 'CÔNG CỤ',
  'rail.briefing': 'THUYẾT MINH',
  'rail.readouts': 'ĐỌC SỐ',
  'rail.view': 'HIỂN THỊ',
  'rail.export': 'XUẤT',
  'scene.label': 'THÍ NGHIỆM · {name}',
  'landing.kicker': 'CON MÈO NỔI TIẾNG NHẤT VẬT LÝ CHƯA TỪNG TỒN TẠI',
  'landing.title': 'Đừng hỏi mèo sống hay chết.\nHỏi xác suất.',
  'landing.desc':
    'Chúa có chơi xúc xắc không? Có, và ngài chơi liên tục, từng attosecond một. Vẽ rào, bắn gói sóng và xem từng lần gieo của thực tại.',
  'landing.ctaPrimary': 'Mở hộp →',
  'landing.ctaFree': 'Tự do khám phá',
  'landing.status': 'ĐANG CHIẾU · {name}',
  'landing.schrodinger': 'i·ħ ∂ψ/∂t = −ħ²/2m ∇²ψ + Vψ',
  // Uses overlay (spec 2026-10-02): the equation at work in the real world,
  // opened from the top-bar chip and the briefing hook. Two-tier copy per
  // card: an easy sentence plus a mono PHYSICS line; card structure (groups,
  // watch presets) lives in ui/usesData.ts keyed by the same ids. Copy is
  // verbatim from the spec's section 5 tables.
  'uses.open': 'Ứng dụng',
  'uses.hook': 'Phương trình này ngoài kia →',
  'uses.title': 'Phương trình này làm gì cho bạn',
  'uses.intro':
    'Phương trình Schrödinger không nằm mãi trong phòng thí nghiệm. Nó chạy trong túi bạn, giữ GPS đúng giờ, và đang dựng những cỗ máy của ngày mai.',
  'uses.groupToday': 'ĐANG DÙNG HÔM NAY',
  'uses.groupTomorrow': 'TƯƠNG LAI',
  'uses.physicsLabel': 'VẬT LÝ',
  'uses.watch': 'Xem thử: {name} →',
  'uses.close': 'Đóng',
  'uses.flash.title': 'Bộ nhớ flash',
  'uses.flash.easy':
    'Mỗi tấm ảnh bạn lưu trên điện thoại, SSD hay thẻ nhớ đều được ghi bằng xuyên hầm: electron lọt qua lớp oxit cách điện, đỗ lên cổng nổi và nằm đó nhiều năm.',
  'uses.flash.physics':
    'Fowler-Nordheim: dòng ghi đi qua đúng cái đuôi mờ sau rào chắn, ~ e^(−2κd).',
  'uses.stm.title': 'Kính hiển vi quét tunneling',
  'uses.stm.easy':
    'STM vẽ bề mặt từng nguyên tử một. Dòng tunneling giữa mũi dò và bề mặt giảm dốc theo khoảng cách: chỉ dịch 0,1 nm là tín hiệu đổi chừng mười lần.',
  'uses.stm.physics':
    'I ∝ e^(−2κz): độ nhạy theo hàm mũ biến thước đo khoảng cách thành kính soi nguyên tử.',
  'uses.chips.title': 'Chip, LED, laser',
  'uses.chips.easy':
    'Giải phương trình cho electron trong mạng tinh thể ra các dải năng lượng xen khoảng cấm. Transistor đóng mở nhờ thiết kế dải, màu LED là một khoảng cấm được chọn, laser khuếch đại đúng một bước chuyển được chọn.',
  'uses.chips.physics':
    'Định lý Bloch: V(x) tuần hoàn cho cấu trúc dải; khoảng cấm định năng lượng photon, ħω = E_gap.',
  'uses.gps.title': 'Đồng hồ nguyên tử và GPS',
  'uses.gps.easy':
    'Chính đơn vị giây được định nghĩa bằng một bước nhảy lượng tử giữa hai mức năng lượng của nguyên tử cesi. Vệ tinh GPS mang theo những đồng hồ đó; thiếu chúng, vị trí của bạn sẽ trôi hàng cây số mỗi ngày.',
  'uses.gps.physics':
    '1 giây = 9 192 631 770 chu kỳ của bước chuyển siêu tinh tế giữa hai mức nền của Cs-133.',
  'uses.chemistry.title': 'Hóa học tính toán',
  'uses.chemistry.easy':
    'Phần lớn hóa học tính toán là giải gần đúng chính phương trình này cho electron trong phân tử: sàng lọc ứng viên thuốc và thiết kế vật liệu trước khi phòng thí nghiệm bắt đầu.',
  'uses.chemistry.physics':
    'Lý thuyết phi hàm mật độ DFT (Nobel Hóa học 1998) làm lời giải gần đủ rẻ để chạy đại trà.',
  'uses.sun.title': 'Mặt Trời và phóng xạ',
  'uses.sun.easy':
    'Mặt Trời sáng vì proton xuyên hầm qua lực đẩy điện cùng dấu để hợp hạch; lõi Mặt Trời chưa đủ nóng để vượt rào theo vật lý cổ điển. Hạt alpha thoát khỏi hạt nhân không bền cũng bằng con đường đó.',
  'uses.sun.physics':
    'Hệ số Gamow: tốc độ hợp hạch và phân rã alpha nằm trong e^(−2κd), nhạy theo hàm mũ với bề rộng và độ cao rào.',
  'uses.qcompute.title': 'Máy tính lượng tử',
  'uses.qcompute.easy':
    'Qubit mang một hàm sóng, và mỗi cổng lượng tử là một bước tiến hóa unita: máy tính lượng tử vận hành theo đúng phương trình này như định luật chuyển động của nó. Kết quả được đọc bằng đúng quy tắc Born mà sandbox này dùng để đo.',
  'uses.qcompute.physics':
    'Chồng chập cộng giao thoa: khe đôi được mở rộng thành mạch.',
  'uses.qsensing.title': 'Truyền tin và cảm biến lượng tử',
  'uses.qsensing.easy':
    'Phân phối khóa lượng tử bắt được người nghe lén vì phép đo làm xáo trộn trạng thái. Cảm biến sóng vật chất biến giao thoa thành phép đo trọng trường và từ trường vượt giới hạn cổ điển.',
  'uses.qsensing.physics':
    'An toàn đến từ tiên đề về phép đo; độ nhạy đến từ giao thoa giữa các đường chồng chập.',
}
