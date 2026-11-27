import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const measurements = pgTable('measurements', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  label: text('label').notNull(),
  regimeShort: text('regime_short').notNull(),
  n1: doublePrecision('n1').notNull(),
  n2: doublePrecision('n2').notNull(),
  material1Id: text('material1_id').notNull(),
  material2Id: text('material2_id').notNull(),
  incidentAngleDeg: doublePrecision('incident_angle_deg').notNull(),
  refractedAngleDeg: doublePrecision('refracted_angle_deg'),
  reflectancePct: doublePrecision('reflectance_pct').notNull(),
  transmittancePct: doublePrecision('transmittance_pct').notNull(),
  wavelength2Nm: doublePrecision('wavelength2_nm').notNull(),
  wavelengthVacuumNm: doublePrecision('wavelength_vacuum_nm').notNull(),
  polarization: text('polarization').notNull(),
  band: text('band').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const searchLogs = pgTable('search_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  query: text('query').notNull(),
  summary: text('summary').notNull(),
  suggestedN: doublePrecision('suggested_n'),
  wavelengthNm: doublePrecision('wavelength_nm'),
  sourcesJson: text('sources_json').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  measurements: many(measurements),
  searchLogs: many(searchLogs),
}));

export const measurementsRelations = relations(measurements, ({ one }) => ({
  user: one(users, {
    fields: [measurements.userId],
    references: [users.id],
  }),
}));

export const searchLogsRelations = relations(searchLogs, ({ one }) => ({
  user: one(users, {
    fields: [searchLogs.userId],
    references: [users.id],
  }),
}));
