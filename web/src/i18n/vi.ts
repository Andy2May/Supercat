/** Vietnamese dictionary. Key set must stay identical to `en.ts`. */
export const vi: Record<string, string> = {
  'app.title': 'Psiforge — mô phỏng lượng tử 2D',
  'app.tagline': 'Vật lý sóng lượng tử chạy ngay trong trình duyệt',
  'app.lang.switchToEn': 'English',
  'app.lang.switchToVi': 'Tiếng Việt',
  'app.noWebgl': 'Không có WebGL2 — trình mô phỏng không thể hiển thị trên thiết bị này.',
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
  // PNG canvas export (Task 16): playback-bar button, visible in both
  // experience modes; doubles as its aria-label.
  'export.png': 'Xuất ảnh PNG',
  // JSON state save/load (Task 17, advanced mode): the header Save/Load
  // state buttons, the non-fatal load-failure banner headline, and the
  // per-reason detail appended to it (StateFileError.reason).
  'export.json': 'Lưu trạng thái',
  'import.json': 'Mở trạng thái',
  'loadFailed': 'Không mở được file trạng thái',
  'loadFailed.version': 'phiên bản file không hỗ trợ',
  'loadFailed.shape': 'sai kích thước lưới',
  'loadFailed.corrupt': 'file hỏng',
  'loadFailed.dismiss': 'Đóng',
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
  // the max |V|). Explore-friendly wording — no glossary jargon; the V₀
  // symbol with its value is as technical as this gets.
  'legend.barrier': 'Rào',
  'legend.well': 'Giếng',
  'legend.v0': 'V₀ ≈ {v}',
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
  'view.momentumCaption': 'Không gian động lượng kx, ky — k = 0 ở giữa',
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
  'obs.energyJumpNote': 'E có thể nhảy vọt sau phép đo — điều đó đúng vật lý',
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
  'preset.double-slit.teaser': 'Một hạt đi qua hai khe — và tự giao thoa với chính nó.',
  'preset.double-slit.card':
    'Gói sóng lao vào tường có hai khe hở.\n' +
    'Sau tường các vạch sáng tối xếp đều — dấu vết sóng giao thoa của một HẠT.\n' +
    'Hãy Reset xem lại từ đầu, thử vẽ tẩy bịt một khe để giao thoa biến mất.\n' +
    'Hộp mô phỏng tuần hoàn: sóng chạm mép sẽ quay lại từ mép đối diện, và gói sóng tự giãn ra theo thời gian — không mất đi đâu.',
  'preset.tunneling.title': 'Xuyên hầm',
  'preset.tunneling.teaser': 'Hạt lọt qua bức rào cao hơn năng lượng của nó — bằng vệt mờ.',
  'preset.tunneling.card':
    'Vật lý cổ điển nói hạt năng lượng E≈18 không thể vượt rào cao 24 — hãy nhìn kỹ PHÍA SAU rào.\n' +
    'Vệt mờ xuyên qua suy giảm theo độ dày.\n' +
    'Hãy vẽ thêm một lớp rào nữa xem vệt mờ đi đâu.',
  'preset.free-packet.title': 'Gói sóng tự do',
  'preset.free-packet.teaser': 'Đứng yên vẫn tự giãn ra — hệ quả của bất định động lượng.',
  'preset.free-packet.card':
    'Gói sóng "ngồi yên" sẽ tự giãn ra và phủ kín hộp.\n' +
    'Không có ma sát — chỉ là bất định động lượng.\n' +
    'Để chạy lâu sẽ thấy mật độ phẳng đều.\n' +
    'Hộp mô phỏng tuần hoàn: sóng chạm mép sẽ quay lại từ mép đối diện, và gói sóng tự giãn ra theo thời gian — không mất đi đâu.',
  'preset.harmonic.title': 'Dao động điều hòa',
  'preset.harmonic.teaser': "Gói sóng chạy theo quỹ đạo elip trong 'bát' thế — đúng dự đoán cổ điển.",
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
}
