/**
 * Glossary for inline term tooltips (Task 15). Two-level copy by design:
 * the first sentence is everyday language, the optional second sentence
 * adds the technical statement — explore mode shows plain labels only
 * (spec §2.1), so these entries back the Nâng cao (advanced) UI: the
 * ObservablesBar math labels, the view-toggle buttons and the note line.
 *
 * Every entry is physics-checked wording (audited again in Task 19):
 * - σx·σpx ≥ ħ/2 is Heisenberg's uncertainty principle;
 * - p = ħk is the de Broglie relation;
 * - the post-measurement energy jump is momentum broadening → kinetic
 *   energy gain, not an integration error.
 *
 * Term.svelte shows `entry[lang]`; a missing key degrades to the key
 * text (visible, never silent).
 */
export interface GlossaryEntry {
  vi: string
  en: string
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  density: {
    vi: '|ψ|² — mật độ xác suất: chỗ sáng là nơi khả năng tìm thấy hạt cao; sáng gấp đôi nghĩa là xác suất gấp đôi. Bản thân ψ không đo được, chỉ bình phương độ lớn của nó mới có ý nghĩa vật lý (quy tắc Born).',
    en: '|ψ|² is the probability density: bright areas are where the particle is likely to be found; twice as bright means twice the probability. ψ itself cannot be measured — only its squared magnitude has physical meaning (Born rule).',
  },
  phase: {
    vi: 'Pha là "kim đồng hồ" ẩn của sóng tại mỗi điểm, quay đều theo thời gian. Hai nơi có pha khác nhau giao thoa với nhau — đó là nguồn gốc của các vạch sáng và tối.',
    en: 'Phase is the wave\'s hidden "clock hand" at each point, rotating steadily in time. Places with different phases interfere with each other — that is where the bright and dark fringes come from.',
  },
  norm: {
    vi: 'Tổng xác suất tìm thấy hạt ở đâu đó phải bằng 1 (100%) — việc "chuẩn hóa" giữ cho hàm sóng luôn tuân theo quy tắc đó. Chuẩn hóa xong, |ψ|² chính là xác suất trên một đơn vị diện tích.',
    en: 'The total probability of finding the particle somewhere must equal 1 (100%) — normalization keeps the wave function honest about that rule. Once normalized, |ψ|² is exactly the probability per unit area.',
  },
  mx: {
    vi: '⟨x⟩ là vị trí trung bình: đo vị trí hạt rất nhiều lần rồi lấy trung bình, kết quả hội tụ về số này. Tâm của vệt sáng đi đúng theo giá trị đó.',
    en: '⟨x⟩ is the average position: measure the particle\'s position many times and the mean of the outcomes converges to this number. The center of the bright blob tracks exactly this value.',
  },
  my: {
    vi: '⟨y⟩ là vị trí trung bình theo trục đứng — trung bình của rất nhiều phép đo vị trí theo phương y. Trong preset dao động điều hòa, điểm này chạy theo quỹ đạo tròn như viên bi lăn trong chậu.',
    en: '⟨y⟩ is the average position along the vertical axis — the mean of many position measurements in y. In the harmonic preset this point follows a circular orbit like a ball rolling in a bowl.',
  },
  sigma: {
    vi: 'σ (độ lệch chuẩn) đo mức "phình ra" của một đại lượng: σx lớn nghĩa là vị trí hạt trải rộng, σpx lớn nghĩa là động lượng hay thay đổi. Nó là căn bậc hai của phương sai.',
    en: 'σ (standard deviation) measures how spread out a quantity is: a large σx means the particle\'s position is uncertain, a large σpx means its momentum is. It is the square root of the variance.',
  },
  sigmaProduct: {
    vi: 'Tích σx·σpx giới hạn việc biết cùng lúc vị trí và động lượng: không bao giờ xuống dưới ħ/2. Gói càng hẹp về vị trí thì càng phải phình về động lượng — nguyên lý bất định Heisenberg.',
    en: 'The product σx·σpx bounds how well position and momentum can be known at once: it never drops below ħ/2. Squeezing the packet narrower in position forces it to spread out in momentum — Heisenberg\'s uncertainty principle.',
  },
  momentumSpace: {
    vi: 'Không gian động lượng là "cửa sổ thứ hai" nhìn cùng một hạt: trục đo động lượng thay vì vị trí, động lượng 0 nằm ở tâm đồ thị. Cùng một hàm sóng, đưa qua lại bằng biến đổi Fourier giữa hai cửa sổ.',
    en: 'Momentum space is a second window onto the same particle: the axes measure momentum instead of position, with zero momentum at the center of the plot. It is the same wave function, carried back and forth by a Fourier transform.',
  },
  energy: {
    vi: 'E là năng lượng trung bình của hạt: động năng cộng thế năng (lấy trung bình theo |ψ|²). Đây là số mà đồ thị theo dõi theo thời gian — một phép đo vị trí có thể làm nó thay đổi.',
    en: 'E is the particle\'s average energy: kinetic plus potential (averaged against |ψ|²). This is the number the chart tracks over time — a position measurement can change it.',
  },
  energyJump: {
    vi: 'Phép đo vị trí làm hàm sóng co lại thành vệt nhỏ; động lượng bung rộng theo, nên động năng — và năng lượng — nhảy vọt. Không phải lỗi — đó là bất định lượng tử.',
    en: 'A position measurement squeezes the wave function into a small spot; its momentum spreads out in response, so the kinetic energy — and the total — jumps. Not a glitch — that is quantum uncertainty.',
  },
  k: {
    vi: 'k là số sóng: động lượng của hạt lượng tử là p = ħk, nên trục k của đồ thị động lượng chính là thước đo động lượng. |k| lớn nghĩa là sóng ngắn và hạt chuyển động nhanh.',
    en: 'k is the wavenumber: a quantum particle\'s momentum is p = ħk, so the k-axes of the momentum view are a momentum ruler. A large |k| means a short wavelength and a fast-moving particle.',
  },
  tunneling: {
    vi: 'Hạt xuyên qua rào cao hơn năng lượng của nó, điều vật lý cổ điển cấm; xác suất suy giảm theo cấp số nhân với độ dày rào. Bên trong rào hàm sóng không cắt đứt mà tắt dần — vệt mờ phía sau là phần còn sống sót.',
    en: 'A particle passes through a barrier taller than its own energy, which classical physics forbids; the probability decays exponentially with the barrier\'s width. Inside the barrier the wave function does not cut off but fades away — the faint glow behind it is what survives.',
  },
  collapse: {
    vi: 'Sụp đổ hàm sóng: trước phép đo hạt "ở khắp nơi" theo xác suất; phép đo buộc nó chọn một kết quả và hàm sóng co lại quanh kết quả đó. Ngay sau đó gói lại giãn ra và tiếp tục diễn tiến theo phương trình sóng.',
    en: 'Wave function collapse: before a measurement the particle is "everywhere" with some probability; the measurement forces one outcome and the wave function shrinks around it. Right after, the packet spreads out again and keeps evolving by the wave equation.',
  },
}
