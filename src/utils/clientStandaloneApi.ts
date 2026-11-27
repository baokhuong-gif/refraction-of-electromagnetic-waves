import { GoogleGenAI, Type } from '@google/genai';
import {
  type AiWavePrediction,
  crossCheckAiPredictionWithSnell,
  normalizeAiWavePrediction,
  type PhysicsCrossCheck,
} from './aiWavePrediction';
import {
  extractRefractiveIndexFromText,
  type SafeGroundedSource,
  sanitizeGroundedSources,
  stripInternalIndexTag,
} from './searchUtils';

const GEMINI_KEY_STORAGE = 'emrefract_gemini_api_key';
const MEASUREMENTS_STORAGE = 'emrefract_local_measurements_v1';
const SEARCH_HISTORY_STORAGE = 'emrefract_local_search_history_v1';

export const STANDALONE_CLIENT_MODEL = 'gemini-2.5-flash';

export function getStoredGeminiApiKey(): string {
  try {
    return window.localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setStoredGeminiApiKey(apiKey: string): void {
  try {
    const trimmed = apiKey.trim();
    if (trimmed) {
      window.localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
    } else {
      window.localStorage.removeItem(GEMINI_KEY_STORAGE);
    }
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function clearStoredGeminiApiKey(): void {
  try {
    window.localStorage.removeItem(GEMINI_KEY_STORAGE);
  } catch {
    // Ignore
  }
}

export function isStaticHostResponse(res: Response): boolean {
  if (res.status === 404 || res.status === 405) return true;
  const contentType = res.headers.get('content-type') ?? '';
  return !contentType.includes('application/json');
}

export function loadLocalMeasurements<T>(fallback: T[]): T[] {
  try {
    const raw = window.localStorage.getItem(MEASUREMENTS_STORAGE);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function saveLocalMeasurements<T>(records: T[]): void {
  try {
    window.localStorage.setItem(MEASUREMENTS_STORAGE, JSON.stringify(records));
  } catch {
    // Ignore storage errors
  }
}

export interface LocalSearchLogItem {
  id: number;
  query: string;
  summary: string;
  suggestedN: number | null;
  wavelengthNm: number | null;
  sources: SafeGroundedSource[];
  createdAt: string;
}

export function loadLocalSearchHistory(): LocalSearchLogItem[] {
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalSearchLogItem[]) : [];
  } catch {
    return [];
  }
}

export function appendLocalSearchHistory(item: Omit<LocalSearchLogItem, 'id' | 'createdAt'>): LocalSearchLogItem[] {
  const existing = loadLocalSearchHistory();
  const nextItem: LocalSearchLogItem = {
    ...item,
    id: Date.now(),
    createdAt: new Date().toISOString(),
  };
  const updated = [nextItem, ...existing].slice(0, 20);
  try {
    window.localStorage.setItem(SEARCH_HISTORY_STORAGE, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
  return updated;
}

export class MissingClientApiKeyError extends Error {
  constructor() {
    super(
      'Ứng dụng đang chạy ở chế độ tĩnh (không có máy chủ Node.js). Vui lòng nhập Gemini API Key cá nhân bên dưới để chạy trực tiếp trên trình duyệt.'
    );
    this.name = 'MissingClientApiKeyError';
  }
}

function mapGeminiClientError(error: unknown): Error {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return new Error(
      'Gemini API Key hiện đã hết hạn mức (429 RESOURCE_EXHAUSTED). Vui lòng kiểm tra hạn mức trên Google AI Studio.'
    );
  }
  if (
    msg.includes('400') ||
    msg.includes('403') ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('PERMISSION_DENIED')
  ) {
    return new Error(
      'Gemini API Key chưa hợp lệ hoặc thiếu quyền truy cập. Vui lòng kiểm tra lại khóa API.'
    );
  }
  return error instanceof Error ? error : new Error('Không thể kết nối Gemini API từ trình duyệt.');
}

export async function predictWaveClientSide(params: {
  apiKey: string;
  scenarioPrompt: string;
  useCurrentLabContext?: boolean;
  currentN1?: number;
  currentN2?: number;
  currentIncidentAngleDeg?: number;
  currentWavelengthNm?: number;
  currentPolarization?: string;
  material1Label?: string;
  material2Label?: string;
}): Promise<{ prediction: AiWavePrediction; crossCheck: PhysicsCrossCheck }> {
  const cleanKey = params.apiKey.trim();
  if (!cleanKey) {
    throw new MissingClientApiKeyError();
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const labContext = params.useCurrentLabContext
    ? [
        `Trạng thái phòng thí nghiệm hiện tại:`,
        `- Môi trường 1: ${params.material1Label ?? 'Tùy chỉnh'} (n1 = ${params.currentN1?.toFixed(4) ?? '1.0003'})`,
        `- Môi trường 2: ${params.material2Label ?? 'Tùy chỉnh'} (n2 = ${params.currentN2?.toFixed(4) ?? '1.5170'})`,
        `- Góc tới θi = ${params.currentIncidentAngleDeg?.toFixed(2) ?? '45.00'}°`,
        `- Bước sóng chân không λ0 = ${params.currentWavelengthNm ?? 532} nm`,
        `- Phân cực: ${params.currentPolarization ?? 'UNPOLARIZED'}`,
      ].join('\n')
    : '';

  const prompt = [
    'Phân tích và dự đoán chính xác hướng truyền sóng điện từ (gồm tia phản xạ, tia khúc xạ hoặc phản xạ toàn phần) cho kịch bản sau:',
    `Yêu cầu người dùng: ${params.scenarioPrompt}`,
    labContext,
    'Hãy trích xuất/suy luận các tham số vật lý (n1, n2, góc tới θi theo độ, bước sóng λ0 theo nm, phân cực), tính toán góc khúc xạ θt (hoặc trả về null nếu phản xạ toàn phần), góc phản xạ θr, độ lệch tia Δθ, phân loại hướng truyền sóng, giải thích cơ chế vật lý ngắn gọn bằng tiếng Việt và đưa ra 2-3 khuyến nghị kỹ thuật thực tế.',
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const response = await ai.models.generateContent({
      model: STANDALONE_CLIENT_MODEL,
      contents: prompt,
      config: {
        systemInstruction:
          'Bạn là chuyên gia vật lý sóng điện từ và quang học tính toán. Luôn tuân thủ định luật Snell (n1 * sin(θi) = n2 * sin(θt)), định luật phản xạ (θr = θi), góc tới hạn θc = arcsin(n2/n1) khi n1 > n2, và phương trình Fresnel. Trả về JSON đúng lược đồ, diễn giải tiếng Việt chuẩn xác, cô đọng và khoa học.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scenarioSummary: { type: Type.STRING },
            inferredN1: { type: Type.NUMBER },
            inferredN2: { type: Type.NUMBER },
            inferredIncidentAngleDeg: { type: Type.NUMBER },
            inferredWavelengthNm: { type: Type.NUMBER },
            inferredPolarization: { type: Type.STRING },
            directionCategory: { type: Type.STRING },
            directionLabel: { type: Type.STRING },
            predictedRefractedAngleDeg: { type: Type.NUMBER, nullable: true },
            predictedReflectedAngleDeg: { type: Type.NUMBER },
            predictedDeviationDeg: { type: Type.NUMBER },
            confidenceLevel: { type: Type.STRING },
            physicalReasoning: { type: Type.STRING },
            engineeringRecommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'scenarioSummary',
            'inferredN1',
            'inferredN2',
            'inferredIncidentAngleDeg',
            'inferredWavelengthNm',
            'inferredPolarization',
            'directionCategory',
            'directionLabel',
            'predictedReflectedAngleDeg',
            'predictedDeviationDeg',
            'confidenceLevel',
            'physicalReasoning',
            'engineeringRecommendations',
          ],
        },
      },
    });

    const rawJsonText = (response.text ?? '').trim();
    if (!rawJsonText) {
      throw new Error('Mô hình AI không trả về dữ liệu dự đoán.');
    }
    const parsed = JSON.parse(rawJsonText);
    const prediction = normalizeAiWavePrediction(parsed);
    const crossCheck = crossCheckAiPredictionWithSnell(prediction);
    return { prediction, crossCheck };
  } catch (err) {
    throw mapGeminiClientError(err);
  }
}

export async function searchMaterialClientSide(params: {
  apiKey: string;
  query: string;
  wavelengthNm?: number;
  currentN1?: number;
  currentN2?: number;
}): Promise<{
  answer: string;
  suggestedN: number | null;
  sources: SafeGroundedSource[];
  searchQueries: string[];
}> {
  const cleanKey = params.apiKey.trim();
  if (!cleanKey) {
    throw new MissingClientApiKeyError();
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const contextParts: string[] = [];
  if (typeof params.wavelengthNm === 'number' && Number.isFinite(params.wavelengthNm)) {
    contextParts.push(`Bước sóng hiện tại trong phòng lab: ${params.wavelengthNm} nm`);
  }
  if (
    typeof params.currentN1 === 'number' &&
    typeof params.currentN2 === 'number' &&
    Number.isFinite(params.currentN1) &&
    Number.isFinite(params.currentN2)
  ) {
    contextParts.push(
      `Cấu hình hai môi trường đang mô phỏng: n1 = ${params.currentN1.toFixed(4)}, n2 = ${params.currentN2.toFixed(4)}`
    );
  }

  const prompt = [
    `Câu hỏi nghiên cứu quang học / sóng điện từ: ${params.query}`,
    contextParts.length > 0 ? `Bối cảnh mô phỏng hiện tại: ${contextParts.join('; ')}.` : '',
    'Hãy dùng dữ liệu mới và chính xác từ Google Search để trả lời ngắn gọn, khoa học bằng tiếng Việt (tối đa 220 từ): nêu rõ giá trị chiết suất n (nếu có theo bước sóng), hằng số điện môi tương đối εr, tính tán sắc hoặc ứng dụng quang học/RF liên quan.',
    'Nếu xác định được một giá trị chiết suất đại diện duy nhất trong khoảng 1.000 đến 4.000 phù hợp để nạp vào mô phỏng môi trường 2, hãy thêm duy nhất một thẻ ở dòng cuối cùng theo định dạng chính xác: [N_INDEX: 1.xxxx]. Nếu không có giá trị đơn lẻ rõ ràng, không thêm thẻ này.',
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const response = await ai.models.generateContent({
      model: STANDALONE_CLIENT_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction:
          'Bạn là trợ lý tra cứu dữ liệu vật lý quang học và truyền sóng điện từ. Luôn dựa trên nguồn web xác thực từ Google Search, trình bày tiếng Việt mạch lạc, chính xác đơn vị vật lý (nm, GHz, độ, Ω), không bịa số liệu.',
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new Error('Không nhận được nội dung phản hồi từ công cụ tra cứu.');
    }

    const suggestedN = extractRefractiveIndexFromText(rawText);
    const answer = stripInternalIndexTag(rawText);

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const sources = sanitizeGroundedSources(
      groundingMetadata?.groundingChunks as
        | Array<{ web?: { uri?: string; title?: string } }>
        | undefined
    );
    const searchQueries = Array.isArray(groundingMetadata?.webSearchQueries)
      ? groundingMetadata.webSearchQueries.filter((q): q is string => typeof q === 'string')
      : [];

    return { answer, suggestedN, sources, searchQueries };
  } catch (err) {
    throw mapGeminiClientError(err);
  }
}
