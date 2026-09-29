# Ghi chú: Luồng audit vật lý & toán học (physics-audit pipeline)

- **Ngày ghi:** 2026-09-29
- **Trạng thái:** cam kết định hướng — chưa triển khai; dựng plan khi module wave-dynamics hoàn thiện
- **Nguồn:** yêu cầu của người duyệt thiết kế trong phiên làm việc ngày 2026-09-29

## Cam kết

Psiforge có một luồng kiểm tra chuyên trách cho **vật lý và toán học**, tách bạch với code review thường. Lý do: tính đúng đắn là tính năng bán hàng (spec mục 1, 8), nhưng reviewer code tổng quát không đủ thẩm quyền để phát hiện "đúng code, sai vật lý" — công thức triệu chứng đúng, luật vật lý sai.

1. **Module wave-dynamics (Schrodinger — plan M0 đang chạy)** là module đầu tiên được audit bằng luồng này, theo kiểu **hồi tố** khi module hoàn thiện.
2. Sau đó luồng này là **quy trình thường trực**: mọi topic module vật lý tiếp theo (M4: spin & entanglement; hệ mở Lindblad; mạch qubit — spec mục 5, 9) đi qua audit trong khi phát triển, không chỉ ở cuối.

## Mốc kích hoạt

Khi wave-dynamics hoàn thiện về tính năng (kết thúc M2, theo roadmap spec mục 9). Lý tưởng: audit xong **trước** khi đăng Show HN / Reddit — sai vật lý bị cộng đồng bắt trên Hacker News là tổn hại uy tín đúng cái Psiforge đang dùng để gây tiếng vang.

Lưu ý: việc này KHÔNG thay thế các cổng đã có — trong M0, mỗi task có reviewer độc lập và golden test so nghiệm giải tích; audit này là lượt soi sâu hơn, hệ thống hơn, theo góc nhìn "giáo sư vật lý duyệt bài".

## Phác thảo nội dung audit (để lần sau dựng plan khỏi suy lại)

Auditor là subagent/skill chuyên trách, phát báo cáo viết với phán quyết theo từng tuyên bố vật lý. Việc kiểm tra:

- **Tái suy luận độc lập:** mỗi công thức trong code/test phải được auditor suy luận lại từ nguyên lý đầu (từ phương trình, không đọc code trước rồi nghĩ sau) — sai số dễ trốn ở chỗ "hai bên cùng copy một nguồn sai".
- **Nhất quán đơn vị & quy ước:** hệ đơn vị không chiều (docs/units.md), quy ước lưới k của FFT (fftfreq), biên lưới nửa mở, tích trong rời rạc có nhân dx — mọi quy ước đặt ra ở module trước phải được module sau dùng lại y hệt.
- **Golden test đo đúng thứ nó tuyên bố:** dung sai không vô tình lỏng đến mức test pass vì lý do sai; giá trị đo thực tế phải in ra và đối chiếu, không chỉ assert.
- **Chế độ "sai âm thầm":** unitary-nhưng-sai-độ-chính-xác (dt lớn), wrap biên tuần hoàn của FFT, aliasing khi gói sóng hẹp hơn lưới động lượng chứa được, trôi chuẩn dưới ngưỡng guard nhưng tích lũy.
- **Phạm vi hiệu lực của mỗi xấp xỉ:** Strang splitting giả định V tĩnh (thời gian thực), chuẩn-hóa lại mỗi bước của imaginary time — mỗi giả định phải được ghi nhận nơi nó được dùng, kèm điều kiện nó vỡ.
- **Khớp interface vật lý giữa các module:** đại lượngobservables định nghĩa cùng một tích trong, cùng quy ước dấu, cùng ý nghĩa tham số (width là toàn phần hay nửa rộng?).

Định dạng đầu ra: báo cáo audit trong `docs/superpowers/audits/<ngày>-<module>.md`, mỗi mục: tuyên bố vật lý → suy luận độc lập → phán quyết (KHỚP / LỆCH / KHÔNG CHỨNG MINH ĐƯỢC) → bằng chứng. Mục LỆCH phải được xử lý xong trước khi coi module đạt.

## Liên kết

- Spec: `docs/superpowers/specs/2026-09-29-psiforge-design.md` (mục 1, 5, 8, 9)
- Plan M0: `docs/superpowers/plans/2026-09-29-psiforge-m0-foundation.md` (golden tests là tiền đề cho audit hồi tố)
