import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  clearUserMeasurements,
  createUserMeasurement,
  deleteUserMeasurement,
  listUserMeasurements,
  listUserSearchLogs,
  saveUserSearchLog,
} from './src/db/repository.ts';
import {
  predictWavePropagationDirection,
  searchElectromagneticMaterialData,
} from './src/lib/gemini.ts';
import { type AuthRequest, optionalAuth, requireAuth } from './src/middleware/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const VALID_POLARIZATIONS = new Set(['TE', 'TM', 'UNPOLARIZED']);
const VALID_BANDS = new Set(['VISIBLE', 'INFRARED', 'MICROWAVE']);

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Authenticated Cloud SQL measurement routes
  app.get('/api/measurements', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user!.uid;
      const rows = await listUserMeasurements(uid);
      res.json({ measurements: rows });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể tải danh sách phép đo.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/measurements', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body ?? {};
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 160) : '';
      const regimeShort =
        typeof body.regimeShort === 'string' ? body.regimeShort.trim().slice(0, 80) : '';
      const material1Id =
        typeof body.material1Id === 'string' ? body.material1Id.trim().slice(0, 64) : 'custom';
      const material2Id =
        typeof body.material2Id === 'string' ? body.material2Id.trim().slice(0, 64) : 'custom';
      const polarization =
        typeof body.polarization === 'string' && VALID_POLARIZATIONS.has(body.polarization)
          ? body.polarization
          : null;
      const band =
        typeof body.band === 'string' && VALID_BANDS.has(body.band) ? body.band : null;

      const refractedValid =
        body.refractedAngleDeg === null ||
        body.refractedAngleDeg === undefined ||
        isFiniteInRange(body.refractedAngleDeg, 0, 90);

      if (
        !label ||
        !regimeShort ||
        !polarization ||
        !band ||
        !refractedValid ||
        !isFiniteInRange(body.n1, 1.0, 5.0) ||
        !isFiniteInRange(body.n2, 1.0, 5.0) ||
        !isFiniteInRange(body.incidentAngleDeg, 0, 90) ||
        !isFiniteInRange(body.reflectancePct, 0, 100.01) ||
        !isFiniteInRange(body.transmittancePct, 0, 100.01) ||
        !isFiniteInRange(body.wavelength2Nm, 1, 1_000_000_000) ||
        !isFiniteInRange(body.wavelengthVacuumNm, 1, 1_000_000_000)
      ) {
        return res.status(400).json({ error: 'Thông số phép đo gửi lên không hợp lệ.' });
      }

      const saved = await createUserMeasurement(req.dbUser!.id, {
        label,
        regimeShort,
        n1: body.n1,
        n2: body.n2,
        material1Id,
        material2Id,
        incidentAngleDeg: body.incidentAngleDeg,
        refractedAngleDeg:
          typeof body.refractedAngleDeg === 'number' ? body.refractedAngleDeg : null,
        reflectancePct: body.reflectancePct,
        transmittancePct: body.transmittancePct,
        wavelength2Nm: body.wavelength2Nm,
        wavelengthVacuumNm: body.wavelengthVacuumNm,
        polarization,
        band,
      });

      return res.status(201).json({ measurement: saved });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể lưu phép đo.';
      return res.status(500).json({ error: message });
    }
  });

  app.delete('/api/measurements/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const measurementId = Number(req.params.id);
      if (!Number.isInteger(measurementId) || measurementId <= 0) {
        return res.status(400).json({ error: 'Mã phép đo không hợp lệ.' });
      }

      const deleted = await deleteUserMeasurement(req.dbUser!.id, measurementId);
      if (!deleted) {
        return res.status(404).json({ error: 'Không tìm thấy phép đo để xóa.' });
      }
      return res.json({ deleted: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể xóa phép đo.';
      return res.status(500).json({ error: message });
    }
  });

  app.delete('/api/measurements', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      await clearUserMeasurements(req.dbUser!.id);
      return res.json({ cleared: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể xóa bảng phép đo.';
      return res.status(500).json({ error: message });
    }
  });

  // Google Search Grounded Electromagnetic Material Lookup (Gemini 4 Hydrogen)
  app.post('/api/search/material', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const rawQuery = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      if (rawQuery.length < 2 || rawQuery.length > 300) {
        return res.status(400).json({
          error: 'Vui lòng nhập nội dung tra cứu từ 2 đến 300 ký tự.',
        });
      }

      const wavelengthNm = isFiniteInRange(req.body?.wavelengthNm, 1, 1_000_000_000)
        ? req.body.wavelengthNm
        : undefined;
      const currentN1 = isFiniteInRange(req.body?.currentN1, 1, 5) ? req.body.currentN1 : undefined;
      const currentN2 = isFiniteInRange(req.body?.currentN2, 1, 5) ? req.body.currentN2 : undefined;

      const result = await searchElectromagneticMaterialData({
        query: rawQuery,
        wavelengthNm,
        currentN1,
        currentN2,
      });

      if (req.dbUser) {
        try {
          await saveUserSearchLog(req.dbUser.id, {
            query: rawQuery,
            summary: result.answer,
            suggestedN: result.suggestedN,
            wavelengthNm: wavelengthNm ?? null,
            sources: result.sources,
          });
        } catch (dbErr) {
          console.error('Failed to persist search log (non-fatal):', dbErr);
        }
      }

      return res.json(result);
    } catch (error: unknown) {
      console.error('Material search grounding failed:', error);
      const rawMsg = error instanceof Error ? error.message : String(error);
      if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        return res.status(429).json({
          error:
            'Hạn mức gọi dịch vụ tìm kiếm Gemini API hiện đã hết (429 RESOURCE_EXHAUSTED). Vui lòng kiểm tra gói cước hoặc chọn khóa API có bật thanh toán trong Settings > Secrets.',
        });
      }
      if (rawMsg.includes('403') || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('API_KEY_INVALID')) {
        return res.status(403).json({
          error:
            'Khóa Gemini API chưa hợp lệ hoặc thiếu quyền truy cập. Vui lòng kiểm tra cấu hình trong Settings > Secrets.',
        });
      }
      return res.status(502).json({
        error: 'Không thể hoàn tất tra cứu dữ liệu Google Search lúc này. Vui lòng thử lại sau.',
      });
    }
  });

  app.get('/api/search/history', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const logs = await listUserSearchLogs(req.user!.uid);
      return res.json({ history: logs });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể tải lịch sử tra cứu.';
      return res.status(500).json({ error: message });
    }
  });

  // AI Wave Propagation Direction Predictor (Server-side Gemini 4 Hydrogen Structured JSON)
  app.post('/api/ai/predict-wave', async (req: Request, res: Response) => {
    try {
      const rawScenario =
        typeof req.body?.scenarioPrompt === 'string' ? req.body.scenarioPrompt.trim() : '';
      if (rawScenario.length < 4 || rawScenario.length > 600) {
        return res.status(400).json({
          error: 'Vui lòng mô tả kịch bản hoặc câu hỏi truyền sóng từ 4 đến 600 ký tự.',
        });
      }

      const useCurrentLabContext = Boolean(req.body?.useCurrentLabContext);
      const currentN1 = isFiniteInRange(req.body?.currentN1, 1, 5) ? req.body.currentN1 : undefined;
      const currentN2 = isFiniteInRange(req.body?.currentN2, 1, 5) ? req.body.currentN2 : undefined;
      const currentIncidentAngleDeg = isFiniteInRange(req.body?.currentIncidentAngleDeg, 0, 89.5)
        ? req.body.currentIncidentAngleDeg
        : undefined;
      const currentWavelengthNm = isFiniteInRange(req.body?.currentWavelengthNm, 1, 1_000_000_000)
        ? req.body.currentWavelengthNm
        : undefined;
      const currentPolarization =
        typeof req.body?.currentPolarization === 'string' &&
        VALID_POLARIZATIONS.has(req.body.currentPolarization)
          ? req.body.currentPolarization
          : undefined;
      const material1Label =
        typeof req.body?.material1Label === 'string'
          ? req.body.material1Label.trim().slice(0, 80)
          : undefined;
      const material2Label =
        typeof req.body?.material2Label === 'string'
          ? req.body.material2Label.trim().slice(0, 80)
          : undefined;

      const output = await predictWavePropagationDirection({
        scenarioPrompt: rawScenario,
        useCurrentLabContext,
        currentN1,
        currentN2,
        currentIncidentAngleDeg,
        currentWavelengthNm,
        currentPolarization,
        material1Label,
        material2Label,
      });

      return res.json(output);
    } catch (error: unknown) {
      console.error('AI wave prediction failed:', error);
      const rawMsg = error instanceof Error ? error.message : String(error);
      if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        return res.status(429).json({
          error:
            'Hạn mức gọi Gemini API hiện đã hết (429 RESOURCE_EXHAUSTED). Vui lòng kiểm tra gói cước hoặc chọn khóa API có bật thanh toán trong Settings > Secrets.',
        });
      }
      if (
        rawMsg.includes('403') ||
        rawMsg.includes('PERMISSION_DENIED') ||
        rawMsg.includes('API_KEY_INVALID')
      ) {
        return res.status(403).json({
          error:
            'Khóa Gemini API chưa hợp lệ hoặc thiếu quyền truy cập. Vui lòng kiểm tra cấu hình trong Settings > Secrets.',
        });
      }
      return res.status(502).json({
        error: 'Không thể hoàn tất dự đoán hướng truyền sóng bằng AI lúc này. Vui lòng thử lại sau.',
      });
    }
  });

  // Frontend Vite middleware (dev) or static dist serving (prod)
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EMRefract Lab server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
