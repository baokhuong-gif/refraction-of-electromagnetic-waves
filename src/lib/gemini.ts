import { GoogleGenAI, Type } from '@google/genai';
import {
  type AiWavePrediction,
  crossCheckAiPredictionWithSnell,
  normalizeAiWavePrediction,
  type PhysicsCrossCheck,
} from '../utils/aiWavePrediction.ts';
import {
  extractRefractiveIndexFromText,
  type SafeGroundedSource,
  sanitizeGroundedSources,
  stripInternalIndexTag,
} from '../utils/searchUtils.ts';

let sharedClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trên máy chủ.');
  }
  if (!sharedClient) {
    sharedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return sharedClient;
}

export interface MaterialSearchRequest {
  query: string;
  wavelengthNm?: number;
  currentN1?: number;
  currentN2?: number;
}

export interface MaterialSearchResponse {
  answer: string;
  suggestedN: number | null;
  sources: SafeGroundedSource[];
  searchQueries: string[];
}

export async function searchElectromagneticMaterialData(
  params: MaterialSearchRequest
): Promise<MaterialSearchResponse> {
  const ai = getGeminiClient();

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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
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

  return {
    answer,
    suggestedN,
    sources,
    searchQueries,
  };
}

export interface WaveDirectionPredictionRequest {
  scenarioPrompt: string;
  useCurrentLabContext?: boolean;
  currentN1?: number;
  currentN2?: number;
  currentIncidentAngleDeg?: number;
  currentWavelengthNm?: number;
  currentPolarization?: string;
  material1Label?: string;
  material2Label?: string;
}

export interface WaveDirectionPredictionResult {
  prediction: AiWavePrediction;
  crossCheck: PhysicsCrossCheck;
}

export async function predictWavePropagationDirection(
  params: WaveDirectionPredictionRequest
): Promise<WaveDirectionPredictionResult> {
  const ai = getGeminiClient();

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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Bạn là chuyên gia vật lý sóng điện từ và quang học tính toán. Luôn tuân thủ định luật Snell (n1 * sin(θi) = n2 * sin(θt)), định luật phản xạ (θr = θi), góc tới hạn θc = arcsin(n2/n1) khi n1 > n2, và phương trình Fresnel. Trả về JSON đúng lược đồ, diễn giải tiếng Việt chuẩn xác, cô đọng và khoa học.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scenarioSummary: {
            type: Type.STRING,
            description: 'Tóm tắt 1 câu về kịch bản truyền sóng đang dự đoán bằng tiếng Việt.',
          },
          inferredN1: {
            type: Type.NUMBER,
            description: 'Chiết suất môi trường 1 (trong khoảng 1.0 đến 4.0).',
          },
          inferredN2: {
            type: Type.NUMBER,
            description: 'Chiết suất môi trường 2 (trong khoảng 1.0 đến 4.0).',
          },
          inferredIncidentAngleDeg: {
            type: Type.NUMBER,
            description: 'Góc tới θi tính bằng độ (từ 0 đến 89.5).',
          },
          inferredWavelengthNm: {
            type: Type.NUMBER,
            description: 'Bước sóng trong chân không tính bằng nm (mặc định 532 nếu không nêu rõ).',
          },
          inferredPolarization: {
            type: Type.STRING,
            description: 'Một trong các giá trị: TE, TM, UNPOLARIZED.',
          },
          directionCategory: {
            type: Type.STRING,
            description:
              'Một trong các giá trị: TOWARD_NORMAL, AWAY_FROM_NORMAL, STRAIGHT_THROUGH, TOTAL_INTERNAL_REFLECTION, GRAZING_REFRACTION.',
          },
          directionLabel: {
            type: Type.STRING,
            description: 'Nhận định ngắn gọn về hướng truyền sóng bằng tiếng Việt.',
          },
          predictedRefractedAngleDeg: {
            type: Type.NUMBER,
            nullable: true,
            description: 'Góc khúc xạ θt tính bằng độ, hoặc null nếu xảy ra phản xạ toàn phần.',
          },
          predictedReflectedAngleDeg: {
            type: Type.NUMBER,
            description: 'Góc phản xạ θr tính bằng độ (= θi).',
          },
          predictedDeviationDeg: {
            type: Type.NUMBER,
            description: 'Độ lệch tia sáng Δθ tính bằng độ.',
          },
          confidenceLevel: {
            type: Type.STRING,
            description: 'Một trong các giá trị: HIGH, MEDIUM, LOW.',
          },
          physicalReasoning: {
            type: Type.STRING,
            description:
              'Giải thích vật lý cô đọng (2-3 câu) về lý do sóng bẻ hướng, vận tốc pha và năng lượng Fresnel.',
          },
          engineeringRecommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 đến 3 gợi ý kỹ thuật/thí nghiệm thực tế bằng tiếng Việt.',
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    throw new Error('Không thể phân tích cấu trúc dự đoán từ mô hình AI.');
  }

  const prediction = normalizeAiWavePrediction(parsed);
  const crossCheck = crossCheckAiPredictionWithSnell(prediction);

  return { prediction, crossCheck };
}
