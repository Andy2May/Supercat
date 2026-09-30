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
  'mode.explore': 'Khám phá',
  'mode.advanced': 'Nâng cao',
  // Header toggle hint; '{mode}' is replaced with the target mode's name.
  'mode.switchHint': 'Chuyển sang {mode}',
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
    'Hãy Reset xem lại từ đầu, thử vẽ tẩy bịt một khe để giao thoa biến mất.',
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
    'Để chạy lâu sẽ thấy mật độ phẳng đều.',
  'preset.harmonic.title': 'Dao động điều hòa',
  'preset.harmonic.teaser': "Gói sóng chạy tròn trong 'bát' thế — đúng dự đoán cổ điển.",
  'preset.harmonic.card':
    'Gói bị "bát" giữ lại, tâm nó chạy theo quỹ đạo tròn như quả bóng lăn trong chậu.\n' +
    'Đúng dự đoán cổ điển (định lý Ehrenfest).\n' +
    'Để ý gói gần như không giãn.',
  'preset.sandbox.title': 'Tự do khám phá',
  'preset.sandbox.teaser': 'Vẽ rào, thả gói sóng, và xem |ψ|² phản ứng theo ý bạn.',
  'preset.sandbox.card':
    'Vùng chơi tự do.\n' +
    'Chọn công cụ vẽ rào/giếng, thả gói sóng bằng cách kéo trên nền.\n' +
    'Xem |ψ|² phản ứng.',
}
