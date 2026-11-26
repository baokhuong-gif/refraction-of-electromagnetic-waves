import { jsPDF } from 'jspdf';
import {
  formatFrequency,
  formatWavelength,
  WavePhysicsResult,
} from '../physics/emPhysics';
import { PolarizationMode } from '../physics/materials';

export interface PdfReportParams {
  physics: WavePhysicsResult;
  polarization: PolarizationMode;
  wavelengthVacuumNm: number;
  material1Label: string;
  material2Label: string;
  canvasElement: HTMLCanvasElement | null;
}

export interface PdfReportSummaryData {
  filename: string;
  generatedAt: string;
  incidentAngleText: string;
  refractedAngleText: string;
  deviationAngleText: string;
  n1Text: string;
  n2Text: string;
}

/**
 * Formats deterministic structured summary strings for PDF report generation and unit testing.
 */
export function buildPdfReportMetadata(
  physics: WavePhysicsResult,
  now: Date = new Date()
): PdfReportSummaryData {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}`;

  return {
    filename: `EMRefract-Bao-cao-Khuc-xa-${stamp}.pdf`,
    generatedAt: now.toLocaleString('vi-VN'),
    incidentAngleText: `${physics.incidentAngleDeg.toFixed(2)}°`,
    refractedAngleText: physics.isTotalInternalReflection
      ? 'Phản xạ toàn phần (TIR)'
      : `${physics.refractedAngleDeg!.toFixed(2)}°`,
    deviationAngleText: physics.isTotalInternalReflection
      ? 'Không truyền xa (100% phản xạ)'
      : `${physics.deviationAngleDeg!.toFixed(2)}°`,
    n1Text: physics.n1.toFixed(4),
    n2Text: physics.n2.toFixed(4),
  };
}

/**
 * Renders a crisp A4 Vietnamese scientific report onto a high-DPI offscreen canvas
 * (preserving full Vietnamese diacritics and mathematical notation) and exports it as a real PDF.
 */
export function exportRefractionPdfReport(params: PdfReportParams): PdfReportSummaryData {
  const {
    physics,
    polarization,
    wavelengthVacuumNm,
    material1Label,
    material2Label,
    canvasElement,
  } = params;

  const meta = buildPdfReportMetadata(physics);

  // High-DPI A4 page canvas (1240 x 1754 px ≈ 150 DPI A4)
  const W = 1240;
  const H = 1754;
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = W;
  pageCanvas.height = H;
  const ctx = pageCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Không thể khởi tạo ngữ cảnh đồ họa để xuất báo cáo PDF.');
  }

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const margin = 76;
  const contentW = W - margin * 2;
  let y = 78;

  // Header band
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 32px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('EMRefract Lab', margin, y);

  ctx.fillStyle = '#0284c7';
  ctx.font = '600 18px "IBM Plex Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`Thời điểm xuất: ${meta.generatedAt}`, W - margin, y);
  ctx.textAlign = 'left';

  y += 34;
  ctx.fillStyle = '#475569';
  ctx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    'Báo cáo Mô phỏng & Nhận dạng Đặc tính Truyền sóng Khúc xạ Điện từ',
    margin,
    y
  );

  y += 22;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(W - margin, y);
  ctx.stroke();

  // Section 1: Embedded Live Simulation Diagram
  y += 38;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 21px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('01. Sơ đồ truyền sóng điện từ qua mặt phân cách', margin, y);
  y += 18;

  const diagramH = 420;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin, y, contentW, diagramH);

  if (canvasElement && canvasElement.width > 0 && canvasElement.height > 0) {
    // Aspect-preserving fit inside diagram box
    const srcAspect = canvasElement.width / canvasElement.height;
    const dstAspect = contentW / diagramH;
    let drawW = contentW;
    let drawH = diagramH;
    let drawX = margin;
    let drawY = y;
    if (srcAspect > dstAspect) {
      drawH = contentW / srcAspect;
      drawY = y + (diagramH - drawH) / 2;
    } else {
      drawW = diagramH * srcAspect;
      drawX = margin + (contentW - drawW) / 2;
    }
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(margin + 1, y + 1, contentW - 2, diagramH - 2);
    ctx.drawImage(canvasElement, drawX, drawY, drawW, drawH);
  }
  y += diagramH + 46;

  // Section 2: Key Calculated Results (Primary Highlight Row)
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 21px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('02. Kết quả tính toán khúc xạ & độ lệch tia sáng', margin, y);
  y += 20;

  const kpis = [
    { label: 'Góc tới (θi)', value: meta.incidentAngleText, accent: '#0f172a' },
    { label: 'Góc khúc xạ (θt)', value: meta.refractedAngleText, accent: '#047857' },
    { label: 'Độ lệch tia (Δθ)', value: meta.deviationAngleText, accent: '#0284c7' },
    {
      label: 'Phản xạ / Truyền qua',
      value: `${(physics.reflectanceEffective * 100).toFixed(1)}% / ${(
        physics.transmittanceEffective * 100
      ).toFixed(1)}%`,
      accent: '#b91c1c',
    },
  ];

  const colW = contentW / 4;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(margin, y, contentW, 110);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin, y, contentW, 110);

  kpis.forEach((kpi, idx) => {
    const kx = margin + idx * colW;
    if (idx > 0) {
      ctx.beginPath();
      ctx.moveTo(kx, y);
      ctx.lineTo(kx, y + 110);
      ctx.stroke();
    }
    ctx.fillStyle = '#64748b';
    ctx.font = '500 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(kpi.label, kx + 18, y + 36);

    ctx.fillStyle = kpi.accent;
    ctx.font = '700 23px "IBM Plex Mono", monospace';
    ctx.fillText(kpi.value, kx + 18, y + 80);
  });
  y += 148;

  // Section 3: Automatic Propagation Regime Classification
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 21px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('03. Nhận dạng chế độ truyền sóng điện từ', margin, y);
  y += 20;

  const boxFill =
    physics.classification.severity === 'critical'
      ? '#fff1f2'
      : physics.classification.severity === 'transition'
      ? '#fffbeb'
      : '#f0f9ff';
  const boxBorder =
    physics.classification.severity === 'critical'
      ? '#fecdd3'
      : physics.classification.severity === 'transition'
      ? '#fde68a'
      : '#bae6fd';

  ctx.fillStyle = boxFill;
  ctx.fillRect(margin, y, contentW, 196);
  ctx.strokeStyle = boxBorder;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin, y, contentW, 196);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 20px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(physics.classification.label, margin + 22, y + 38);

  ctx.fillStyle = '#334155';
  ctx.font = '400 16px "Plus Jakarta Sans", system-ui, sans-serif';
  const summaryLines = wrapText(ctx, physics.classification.summary, contentW - 44);
  summaryLines.slice(0, 2).forEach((line, i) => {
    ctx.fillText(line, margin + 22, y + 70 + i * 24);
  });

  ctx.font = '500 15px "Plus Jakarta Sans", system-ui, sans-serif';
  physics.classification.keyCharacteristics.forEach((char, idx) => {
    ctx.fillStyle = '#475569';
    ctx.fillText(`0${idx + 1}. ${char}`, margin + 22, y + 128 + idx * 24);
  });
  y += 236;

  // Section 4: Detailed Input & Electromagnetic Parameters Table
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 21px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('04. Bảng thông số đầu vào và đặc trưng điện môi', margin, y);
  y += 22;

  const polLabel =
    polarization === 'TE'
      ? 'TE (phân cực s — vuông góc mặt phẳng tới)'
      : polarization === 'TM'
      ? 'TM (phân cực p — song song mặt phẳng tới)'
      : 'Không phân cực (trung bình TE & TM)';

  const tableRows: [string, string][] = [
    ['Môi trường 1 (Sóng tới)', `${material1Label} · n₁ = ${meta.n1Text} · εr₁ = ${physics.permittivity1.toFixed(3)}`],
    ['Môi trường 2 (Khúc xạ)', `${material2Label} · n₂ = ${meta.n2Text} · εr₂ = ${physics.permittivity2.toFixed(3)}`],
    ['Nguồn sóng điện từ', `λ₀ = ${formatWavelength(wavelengthVacuumNm)} · f = ${formatFrequency(physics.frequencyHz)} · ${polLabel}`],
    ['Góc đặc trưng (Brewster / Tới hạn)', `θB = ${physics.brewsterAngleDeg.toFixed(2)}° · ${physics.criticalAngleDeg !== null ? `θc = ${physics.criticalAngleDeg.toFixed(2)}°` : 'Không tồn tại θc (n₂ ≥ n₁)'}`],
    ['Hệ số phản xạ Fresnel (TE / TM)', `Rs = ${(physics.reflectanceS * 100).toFixed(2)}% · Rp = ${(physics.reflectanceP * 100).toFixed(2)}% · R_eff = ${(physics.reflectanceEffective * 100).toFixed(2)}%`],
    ['Độ dịch pha phản xạ (Δφs / Δφp)', `Δφs = ${physics.phaseShiftSDeg.toFixed(1)}° · Δφp = ${physics.phaseShiftPDeg.toFixed(1)}°`],
    ['Trở kháng sóng nội tại (Z₁ / Z₂)', `Z₁ = ${physics.impedance1Ohm.toFixed(1)} Ω · Z₂ = ${physics.impedance2Ohm.toFixed(1)} Ω`],
    ['Vận tốc pha & Bước sóng MT2', `v₂ = ${(physics.phaseVelocity2 / 1e8).toFixed(3)}×10⁸ m/s · λ₂ = ${formatWavelength(physics.wavelength2Nm)} (λ₂/λ₁ = ${physics.wavelengthRatio.toFixed(3)})`],
  ];

  if (physics.isTotalInternalReflection && physics.evanescentPenetrationDepthNm !== null) {
    tableRows.push([
      'Độ sâu xuyên thấu sóng suy giảm (δe)',
      `${formatWavelength(physics.evanescentPenetrationDepthNm)} (biên độ giảm còn 1/e tại khoảng cách z = δe)`,
    ]);
  }

  const rowH = 42;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  tableRows.forEach(([key, val], idx) => {
    const ry = y + idx * rowH;
    if (idx % 2 === 0) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(margin, ry, contentW, rowH);
    }
    ctx.strokeRect(margin, ry, contentW, rowH);

    ctx.fillStyle = '#475569';
    ctx.font = '600 15px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(key, margin + 16, ry + 26);

    ctx.fillStyle = '#0f172a';
    ctx.font = '500 15px "IBM Plex Mono", monospace';
    ctx.fillText(val, margin + 350, ry + 26);
  });

  // Footer
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin, H - 76);
  ctx.lineTo(W - margin, H - 76);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '400 14px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    'EMRefract Lab · Định luật Snell (n₁ sin θi = n₂ sin θt) & Phương trình Fresnel (μr = 1)',
    margin,
    H - 46
  );

  // Assemble A4 PDF via jsPDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const imgData = pageCanvas.toDataURL('image/png');
  doc.addImage(imgData, 'PNG', 0, 0, 210, 297);
  doc.save(meta.filename);

  return meta;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
