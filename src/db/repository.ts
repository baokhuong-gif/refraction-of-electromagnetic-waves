import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { measurements, searchLogs, users } from './schema.ts';

export interface NewMeasurementPayload {
  label: string;
  regimeShort: string;
  n1: number;
  n2: number;
  material1Id: string;
  material2Id: string;
  incidentAngleDeg: number;
  refractedAngleDeg: number | null;
  reflectancePct: number;
  transmittancePct: number;
  wavelength2Nm: number;
  wavelengthVacuumNm: number;
  polarization: string;
  band: string;
}

export interface GroundedSourceItem {
  title: string;
  uri: string;
}

export async function getOrCreateUser(uid: string, email: string, displayName?: string | null) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to upsert user:', error);
    throw new Error('Không thể đồng bộ tài khoản người dùng.', { cause: error });
  }
}

export async function listUserMeasurements(uid: string) {
  try {
    return await db
      .select({
        id: measurements.id,
        label: measurements.label,
        regimeShort: measurements.regimeShort,
        n1: measurements.n1,
        n2: measurements.n2,
        material1Id: measurements.material1Id,
        material2Id: measurements.material2Id,
        incidentAngleDeg: measurements.incidentAngleDeg,
        refractedAngleDeg: measurements.refractedAngleDeg,
        reflectancePct: measurements.reflectancePct,
        transmittancePct: measurements.transmittancePct,
        wavelength2Nm: measurements.wavelength2Nm,
        wavelengthVacuumNm: measurements.wavelengthVacuumNm,
        polarization: measurements.polarization,
        band: measurements.band,
        createdAt: measurements.createdAt,
      })
      .from(measurements)
      .innerJoin(users, eq(measurements.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(measurements.createdAt))
      .limit(100);
  } catch (error) {
    console.error('Failed to list measurements:', error);
    throw new Error('Không thể tải danh sách phép đo.', { cause: error });
  }
}

export async function createUserMeasurement(userId: number, payload: NewMeasurementPayload) {
  try {
    const [inserted] = await db
      .insert(measurements)
      .values({
        userId,
        label: payload.label,
        regimeShort: payload.regimeShort,
        n1: payload.n1,
        n2: payload.n2,
        material1Id: payload.material1Id,
        material2Id: payload.material2Id,
        incidentAngleDeg: payload.incidentAngleDeg,
        refractedAngleDeg: payload.refractedAngleDeg,
        reflectancePct: payload.reflectancePct,
        transmittancePct: payload.transmittancePct,
        wavelength2Nm: payload.wavelength2Nm,
        wavelengthVacuumNm: payload.wavelengthVacuumNm,
        polarization: payload.polarization,
        band: payload.band,
      })
      .returning();

    return inserted;
  } catch (error) {
    console.error('Failed to create measurement:', error);
    throw new Error('Không thể lưu phép đo vào hệ thống.', { cause: error });
  }
}

export async function deleteUserMeasurement(userId: number, measurementId: number) {
  try {
    const deleted = await db
      .delete(measurements)
      .where(and(eq(measurements.id, measurementId), eq(measurements.userId, userId)))
      .returning({ id: measurements.id });

    return deleted.length > 0;
  } catch (error) {
    console.error('Failed to delete measurement:', error);
    throw new Error('Không thể xóa phép đo.', { cause: error });
  }
}

export async function clearUserMeasurements(userId: number) {
  try {
    await db.delete(measurements).where(eq(measurements.userId, userId));
  } catch (error) {
    console.error('Failed to clear measurements:', error);
    throw new Error('Không thể xóa toàn bộ bảng phép đo.', { cause: error });
  }
}

export async function listUserSearchLogs(uid: string) {
  try {
    const rows = await db
      .select({
        id: searchLogs.id,
        query: searchLogs.query,
        summary: searchLogs.summary,
        suggestedN: searchLogs.suggestedN,
        wavelengthNm: searchLogs.wavelengthNm,
        sourcesJson: searchLogs.sourcesJson,
        createdAt: searchLogs.createdAt,
      })
      .from(searchLogs)
      .innerJoin(users, eq(searchLogs.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(searchLogs.createdAt))
      .limit(20);

    return rows.map((row) => {
      let sources: GroundedSourceItem[] = [];
      try {
        sources = JSON.parse(row.sourcesJson) as GroundedSourceItem[];
      } catch {
        sources = [];
      }
      return {
        id: row.id,
        query: row.query,
        summary: row.summary,
        suggestedN: row.suggestedN,
        wavelengthNm: row.wavelengthNm,
        sources,
        createdAt: row.createdAt,
      };
    });
  } catch (error) {
    console.error('Failed to list search logs:', error);
    throw new Error('Không thể tải lịch sử tra cứu.', { cause: error });
  }
}

export async function saveUserSearchLog(
  userId: number,
  payload: {
    query: string;
    summary: string;
    suggestedN: number | null;
    wavelengthNm: number | null;
    sources: GroundedSourceItem[];
  }
) {
  try {
    const [inserted] = await db
      .insert(searchLogs)
      .values({
        userId,
        query: payload.query,
        summary: payload.summary,
        suggestedN: payload.suggestedN,
        wavelengthNm: payload.wavelengthNm,
        sourcesJson: JSON.stringify(payload.sources),
      })
      .returning();

    return inserted;
  } catch (error) {
    console.error('Failed to save search log:', error);
    throw new Error('Không thể lưu kết quả tra cứu.', { cause: error });
  }
}
