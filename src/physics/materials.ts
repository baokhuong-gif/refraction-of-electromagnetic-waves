export interface OpticalMaterial {
  id: string;
  name: string;
  category: 'Khí & Chân không' | 'Chất lỏng' | 'Thủy tinh & Quang học' | 'Bán dẫn & RF';
  refractiveIndex: number;
  relativePermittivity: number; // epsilon_r = n^2 (for non-magnetic dielectric mu_r = 1)
  relativePermeability: number; // mu_r
  abbeNumber?: number;
  notes: string;
  tintHex: string; // Subtle background tint for canvas visualization
}

export const OPTICAL_MATERIALS: OpticalMaterial[] = [
  {
    id: 'vacuum',
    name: 'Chân không',
    category: 'Khí & Chân không',
    refractiveIndex: 1.0,
    relativePermittivity: 1.0,
    relativePermeability: 1.0,
    notes: 'Môi trường chuẩn tuyệt đối, vận tốc truyền bằng c.',
    tintHex: '#f8fafc',
  },
  {
    id: 'air',
    name: 'Không khí (STP)',
    category: 'Khí & Chân không',
    refractiveIndex: 1.0003,
    relativePermittivity: 1.0006,
    relativePermeability: 1.0,
    notes: 'Chiết suất xấp xỉ chân không ở điều kiện tiêu chuẩn.',
    tintHex: '#f1f5f9',
  },
  {
    id: 'ice',
    name: 'Băng (Nước đá)',
    category: 'Chất lỏng',
    refractiveIndex: 1.309,
    relativePermittivity: 1.713,
    relativePermeability: 1.0,
    notes: 'Tinh thể lục giác, chiết suất thấp hơn nước lỏng.',
    tintHex: '#e0f2fe',
  },
  {
    id: 'water',
    name: 'Nước tinh khiết (20°C)',
    category: 'Chất lỏng',
    refractiveIndex: 1.333,
    relativePermittivity: 1.777,
    relativePermeability: 1.0,
    abbeNumber: 55.7,
    notes: 'Môi trường điện môi quang học phổ biến (λ = 589 nm).',
    tintHex: '#dbeafe',
  },
  {
    id: 'ptfe',
    name: 'Nhựa PTFE (Teflon)',
    category: 'Bán dẫn & RF',
    refractiveIndex: 1.38,
    relativePermittivity: 1.904,
    relativePermeability: 1.0,
    notes: 'Vật liệu tổn hao thấp trong thấu kính vi sóng và RF.',
    tintHex: '#e2e8f0',
  },
  {
    id: 'fused-silica',
    name: 'Thạch anh nóng chảy (SiO₂)',
    category: 'Thủy tinh & Quang học',
    refractiveIndex: 1.458,
    relativePermittivity: 2.126,
    relativePermeability: 1.0,
    abbeNumber: 67.8,
    notes: 'Vật liệu lõi sợi quang truyền dẫn viễn thông.',
    tintHex: '#e0e7ff',
  },
  {
    id: 'bk7',
    name: 'Kính Crown (BK7)',
    category: 'Thủy tinh & Quang học',
    refractiveIndex: 1.517,
    relativePermittivity: 2.301,
    relativePermeability: 1.0,
    abbeNumber: 64.2,
    notes: 'Thủy tinh quang học tiêu chuẩn cho lăng kính và thấu kính.',
    tintHex: '#dbeafe',
  },
  {
    id: 'flint',
    name: 'Kính Flint (SF11)',
    category: 'Thủy tinh & Quang học',
    refractiveIndex: 1.785,
    relativePermittivity: 3.186,
    relativePermeability: 1.0,
    abbeNumber: 25.8,
    notes: 'Chiết suất và độ tán sắc cao, dùng cho quang học tách phổ.',
    tintHex: '#cbd5e1',
  },
  {
    id: 'sapphire',
    name: 'Sapphire (Al₂O₃)',
    category: 'Thủy tinh & Quang học',
    refractiveIndex: 1.768,
    relativePermittivity: 3.126,
    relativePermeability: 1.0,
    notes: 'Cửa sổ quang học chịu nhiệt và áp suất cao.',
    tintHex: '#d8e3f0',
  },
  {
    id: 'diamond',
    name: 'Kim cương (C)',
    category: 'Thủy tinh & Quang học',
    refractiveIndex: 2.417,
    relativePermittivity: 5.842,
    relativePermeability: 1.0,
    abbeNumber: 55.3,
    notes: 'Chiết suất rất cao, góc tới hạn nhỏ (~24.4° trong không khí).',
    tintHex: '#cffafe',
  },
  {
    id: 'silicon',
    name: 'Silicon (IR / Vi sóng)',
    category: 'Bán dẫn & RF',
    refractiveIndex: 3.42,
    relativePermittivity: 11.696,
    relativePermeability: 1.0,
    notes: 'Chất bán dẫn điện môi cao cho hồng ngoại và mạch phẳng RF.',
    tintHex: '#cbd5e1',
  },
];

export type PolarizationMode = 'TE' | 'TM' | 'UNPOLARIZED';

export type SpectrumBand = 'VISIBLE' | 'INFRARED' | 'MICROWAVE';

export interface PresetScenario {
  id: string;
  title: string;
  subtitle: string;
  n1: number;
  n2: number;
  material1Id: string;
  material2Id: string;
  incidentAngleDeg: number;
  polarization: PolarizationMode;
  wavelengthNm: number;
  band: SpectrumBand;
}

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'air-bk7',
    title: 'Khúc xạ chuẩn (Không khí → Kính BK7)',
    subtitle: 'Tia lệch về pháp tuyến, bước sóng nén 1.52 lần',
    n1: 1.0003,
    n2: 1.517,
    material1Id: 'air',
    material2Id: 'bk7',
    incidentAngleDeg: 45,
    polarization: 'UNPOLARIZED',
    wavelengthNm: 532,
    band: 'VISIBLE',
  },
  {
    id: 'brewster-water',
    title: 'Góc Brewster (Không khí → Nước)',
    subtitle: 'Triệt tiêu sóng phản xạ TM (Rp = 0%)',
    n1: 1.0003,
    n2: 1.333,
    material1Id: 'air',
    material2Id: 'water',
    incidentAngleDeg: 53.12,
    polarization: 'TM',
    wavelengthNm: 589,
    band: 'VISIBLE',
  },
  {
    id: 'tir-glass-air',
    title: 'Phản xạ toàn phần (Kính BK7 → Không khí)',
    subtitle: 'θi > θc, R = 100%, xuất hiện sóng suy giảm bề mặt',
    n1: 1.517,
    n2: 1.0003,
    material1Id: 'bk7',
    material2Id: 'air',
    incidentAngleDeg: 54,
    polarization: 'TE',
    wavelengthNm: 633,
    band: 'VISIBLE',
  },
  {
    id: 'fiber-core',
    title: 'Dẫn sóng sợi quang (Thạch anh → Không khí)',
    subtitle: 'Góc tới hạn θc ≈ 43.3°, khảo sát độ sâu xuyên thấu',
    n1: 1.458,
    n2: 1.0003,
    material1Id: 'fused-silica',
    material2Id: 'air',
    incidentAngleDeg: 48,
    polarization: 'TE',
    wavelengthNm: 1550,
    band: 'INFRARED',
  },
  {
    id: 'rf-silicon',
    title: 'Vi sóng RF 10 GHz (Không khí → Silicon)',
    subtitle: 'Phản xạ điện môi mạnh do chênh lệch trở kháng sóng',
    n1: 1.0003,
    n2: 3.42,
    material1Id: 'air',
    material2Id: 'silicon',
    incidentAngleDeg: 35,
    polarization: 'TM',
    wavelengthNm: 30_000_000, // 30 mm = 10 GHz
    band: 'MICROWAVE',
  },
];

export function findMaterialById(id: string): OpticalMaterial | undefined {
  return OPTICAL_MATERIALS.find((m) => m.id === id);
}

export function findMaterialLabel(n: number, selectedId: string): string {
  if (selectedId !== 'custom') {
    const mat = findMaterialById(selectedId);
    if (mat && Math.abs(mat.refractiveIndex - n) < 0.002) {
      return mat.name;
    }
  }
  return `Môi trường tùy chỉnh (n = ${n.toFixed(3)})`;
}
