/**
 * Jambi Bike Rental Platform — Phase 1 database schema (Drizzle, PostgreSQL 16+).
 *
 * Source of truth: SRS section 5 (Data Model). This file maps 1:1 to it; every
 * deviation is commented with an A-xx marker (assumption, per SRS section 11.2 style).
 *
 * Architectural invariants embedded here:
 *  - INV-1: bikes always carry home_outlet_id, current_outlet_id, state (non-null).
 *  - INV-2: the lock row is `outlet_categories` (raw SQL `SELECT ... FOR UPDATE`
 *    in the reservation transaction locks it; no ORM magic, see modules/inventory).
 *  - INV-5: ALL money columns are bigint integer rupiah. Currency is implied (IDR),
 *    it is never a field. No numeric/float/decimal money.
 *  - INV-6: append-only tables get database triggers (raw SQL migration 0001).
 *    RLS policies for owner isolation live in that same raw SQL migration
 *    (USING (owner_id = current_setting('app.owner_id')::uuid)).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums (Postgres enums per SRS section 5; only P1 enums defined)     */
/* ------------------------------------------------------------------ */

export const bikeState = pgEnum("bike_state", [
  "available",
  "held", // enum value exists per PRD but is unused in P1..P3 (A-05)
  "reserved", // enum value exists per PRD but is unused in P1..P3 (A-05)
  "in_rental",
  "pending_inspection",
  "maintenance",
  "unavailable",
  "charging",
]);

export const bikeEventType = pgEnum("bike_event_type", [
  "registered",
  "checked_out",
  "checked_in",
  "inspected",
  "state_changed",
  "incident_reported",
]);

export const reservationStatus = pgEnum("reservation_status", [
  "held",
  "confirmed",
  "fulfilled",
  "expired",
  "cancelled",
  "no_show",
]);

export const rentalStatus = pgEnum("rental_status", ["open", "returned", "completed"]);

export const verificationStatus = pgEnum("verification_status", [
  "not_started",
  "pending",
  "verified",
  "rejected",
]);

export const paymentPurpose = pgEnum("payment_purpose", ["booking", "deposit", "late_fee"]);

export const paymentStatus = pgEnum("payment_status", [
  "created",
  "pending",
  "paid",
  "failed",
  "expired",
  "refunded",
]);

export const refundReason = pgEnum("refund_reason", [
  "mechanical_failure",
  "reallocation_declined",
  "late_payment_sold_out",
  "no_show",
  "dispute",
  "deposit_release",
]);

export const refundStatus = pgEnum("refund_status", ["pending", "succeeded", "failed"]);

export const depositStatus = pgEnum("deposit_status", [
  "none",
  "pending",
  "held",
  "insufficient",
  "released",
]);

/* ------------------------------------------------------------------ */
/* Platform config (SRS section 4)                                     */
/* ------------------------------------------------------------------ */

export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Lookup table (NOT an enum, so adding `ebike` in P3 is a data change) */
/* ------------------------------------------------------------------ */

export const categories = pgTable("categories", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  attributesSchema: jsonb("attributes_schema"),
});

/* ------------------------------------------------------------------ */
/* Tenancy                                                             */
/* ------------------------------------------------------------------ */

export const owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    bankCode: text("bank_code"),
    bankAccountNumber: text("bank_account_number"),
    bankAccountName: text("bank_account_name"),
    promoOptOut: boolean("promo_opt_out").notNull().default(false),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("owners_status_check", sql`status IN ('active','suspended')`)],
);

/**
 * Better Auth `user` table + platform fields (SRS section 5).
 * G-02 PASSED against better-auth@1.7.15: phoneNumber plugin present with
 * sendOTP / expiresIn(default 300) / otpLength(6) / allowedAttempts(5);
 * adapter mapping verified (drizzleAdapter schema map). A-17 follows from that.
 * A-17: better-auth is not installed yet (gate G-02 covers the exact plugin
 * surface). Core BA columns (name/email/email_verified/image) are kept under
 * the BA names so the identity PR can attach BA's account/session tables to it.
 * Renters sign up by phone OTP (A-10), so `email` is nullable here, unlike the
 * BA default.
 *
 * Adapter field-name notes: BA models read TS property names, while the DB
 * columns stay snake_case SRS names — e.g. the TS key `phoneNumber` maps to
 * DB column `phone` (SRS section 5 keeps users.phone).
 *
 * Extra SRS fields (role/ownerId/outletId) are passed as additionalFields;
 * users.phone stays the SRS identity of record, ALWAYS in +62E.164 form.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name"),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull(),
    ownerId: uuid("owner_id").references(() => owners.id),
    outletId: uuid("outlet_id").references(() => outlets.id),
    // SRS column `phone`; exposed to BA as phoneNumber (ts key below).
    phoneNumber: text("phone"),
    phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("users_role_check", sql`role IN ('renter','staff','owner','admin')`),
    check(
      "users_staff_requires_outlet_check",
      sql`(role <> 'staff') OR (outlet_id IS NOT NULL)`,
    ),
    check(
      "users_owner_requires_owner_check",
      sql`(role <> 'owner') OR (owner_id IS NOT NULL)`,
    ),
    uniqueIndex("users_email_uq").on(t.email),
    uniqueIndex("users_phone_uq").on(t.phoneNumber),
  ],
);

/* ------------------------------------------------------------------ */
/* Better Auth internal tables (canonical shapes verified via the      */
/* @better-auth/cli generate output for better-auth@1.7.15).           */
/* Not owner-scoped (no RLS policies here; grants in migration 0002).  */
/* ------------------------------------------------------------------ */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_uq").on(t.token),
    index("sessions_user_id_idx").on(t.userId),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    index("accounts_provider_account_idx").on(t.providerId, t.accountId),
  ],
);

/**
 * Generic BA verification table — CAN BE the storage of the phoneNumber-OTP
 * plugin codes? (identifier = phone, value = otp hash? see plugin implementation)
 */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/* ------------------------------------------------------------------ */
/* Catalog / outlets — RLS scope begins (FR-ID-03)                     */
/* ------------------------------------------------------------------ */

export const outlets = pgTable(
  "outlets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    address: text("address").notNull(),
    // Only `outlets` carries coordinates (NEG-1: no lat/lng anywhere else).
    lat: numeric("lat", { precision: 9, scale: 6 }).notNull(),
    lng: numeric("lng", { precision: 9, scale: 6 }).notNull(),
    hours: jsonb("hours").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("outlets_status_check", sql`status IN ('active','inactive')`),
    uniqueIndex("outlets_code_uq").on(t.code),
  ],
);

// The lock row (INV-2): raw SQL `SELECT ... FOR UPDATE` on this row decides
// availability inside the reservation transaction.
export const outletCategories = pgTable(
  "outlet_categories",
  {
    // NOTE: no `id` column — SRS section 5 keys this lock row on
    // PRIMARY KEY (outlet_id, category) only (section 3.1 "unless noted").
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id),
    category: text("category")
      .notNull()
      .references(() => categories.code),
    // A-18 (logged deviation): SRS section 5 sketch omits owner_id here, but
    // FR-ID-03 requires the exact policy on this table
    // (USING (owner_id = current_setting('app.owner_id')::uuid)), so the column
    // is denormalized from `outlets.owner_id` and kept in sync on write.
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    safetyBuffer: smallint("safety_buffer").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.outletId, t.category] }),
    check("outlet_categories_buffer_check", sql`safety_buffer BETWEEN 0 AND 1`),
  ],
);

// Data only until P3 (`feature.sister_outlets_enabled`); created now per SRS
// data model so enabling the flag needs no migration.
export const sisterGroups = pgTable("sister_groups", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sisterGroupOutlets = pgTable(
  "sister_group_outlets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    groupId: uuid("group_id")
      .notNull()
      .references(() => sisterGroups.id),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sister_group_outlets_pair_uq").on(t.groupId, t.outletId)],
);

/* ------------------------------------------------------------------ */
/* Fleet                                                               */
/* ------------------------------------------------------------------ */

export const bikes = pgTable(
  "bikes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    assetTag: text("asset_tag").notNull(),
    category: text("category")
      .notNull()
      .references(() => categories.code),
    // INV-1: both outlets are NOT NULL — station-to-station, never dockless.
    homeOutletId: uuid("home_outlet_id")
      .notNull()
      .references(() => outlets.id),
    currentOutletId: uuid("current_outlet_id")
      .notNull()
      .references(() => outlets.id),
    state: bikeState("state").notNull().default("available"),
    attributes: jsonb("attributes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bikes_asset_tag_uq").on(t.assetTag),
    // supports computeAvailability (FR-INV-01 step 1)
    index("bikes_home_outlet_cat_state_idx").on(
      t.homeOutletId,
      t.category,
      t.state,
    ),
  ],
);

// INV-4 custody trail: every bikes.state / current_outlet_id change writes
// exactly one row here in the same transaction. INV-6: append-only (trigger).
export const bikeEvents = pgTable(
  "bike_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    bikeId: uuid("bike_id")
      .notNull()
      .references(() => bikes.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    type: bikeEventType("type").notNull(),
    fromState: bikeState("from_state"),
    toState: bikeState("to_state"),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id),
    staffId: uuid("staff_id").references(() => users.id),
    rentalId: uuid("rental_id").references(() => rentals.id),
    clientEventId: uuid("client_event_id"),
    photoKeys: text("photo_keys").array().notNull().default(sql`'{}'::text[]`),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bike_events_client_event_id_uq").on(t.clientEventId),
    index("bike_events_bike_occurred_idx").on(t.bikeId, t.occurredAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Renters, verification, deposits                                     */
/* ------------------------------------------------------------------ */

export const renters = pgTable(
  "renters",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    phone: text("phone"),
    verificationStatus: verificationStatus("verification_status")
      .notNull()
      .default("not_started"),
    depositStatus: depositStatus("deposit_status").notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("renters_user_id_uq").on(t.userId)],
);

export const verificationRequests = pgTable(
  "verification_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    renterId: uuid("renter_id")
      .notNull()
      .references(() => renters.id),
    provider: text("provider").notNull(), // 'manual_review' until provider decision
    providerRef: text("provider_ref"),
    documentType: text("document_type").notNull(),
    documentKey: text("document_key"),
    status: verificationStatus("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "verification_requests_doc_type_check",
      sql`document_type IN ('ktp','sim','passport')`,
    ),
    index("verification_requests_status_idx").on(t.status, t.createdAt),
  ],
);

// INV-6: append-only (trigger). Access audit for ID documents (FR-ID-04.3).
export const idDocumentViews = pgTable("id_document_views", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  verificationRequestId: uuid("verification_request_id")
    .notNull()
    .references(() => verificationRequests.id),
  viewerId: uuid("viewer_id").references(() => users.id),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deposits = pgTable(
  "deposits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    renterId: uuid("renter_id")
      .notNull()
      .references(() => renters.id),
    // INV-5: integer rupiah, bigint, never a float.
    balanceIdr: bigint("balance_idr", { mode: "bigint" }).notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deposits_renter_id_uq").on(t.renterId),
    check("deposits_balance_non_negative_check", sql`balance_idr >= 0`),
    check("deposits_status_check", sql`status IN ('pending','held','released')`),
  ],
);

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    outletId: uuid("outlet_id").references(() => outlets.id),
    category: text("category")
      .notNull()
      .references(() => categories.code),
    // INV-5: rate per billing unit, integer rupiah.
    rateIdr: bigint("rate_idr", { mode: "bigint" }).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("pricing_rules_rate_positive_check", sql`rate_idr > 0`),
    index("pricing_rules_lookup_idx").on(t.outletId, t.category, t.effectiveFrom),
  ],
);

/* ------------------------------------------------------------------ */
/* Reservations and rentals                                            */
/* ------------------------------------------------------------------ */

// rate_snapshot: {rateIdr, unitMinutes} immutable after insert.
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    renterId: uuid("renter_id")
      .notNull()
      .references(() => renters.id),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    category: text("category")
      .notNull()
      .references(() => categories.code),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: reservationStatus("status").notNull().default("held"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    priceIdr: bigint("price_idr", { mode: "bigint" }).notNull(),
    discountIdr: bigint("discount_idr", { mode: "bigint" }).notNull().default(sql`0`),
    finalIdr: bigint("final_idr", { mode: "bigint" }).notNull(),
    promoId: uuid("promo_id"), // promotions is P2; no FK in P1
    ownerPromoBps: integer("owner_promo_bps").notNull(),
    rateSnapshot: jsonb("rate_snapshot").notNull(),
    atRisk: boolean("at_risk").notNull().default(false),
    reallocationDeadlineAt: timestamp("reallocation_deadline_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("reservations_window_check", sql`ends_at > starts_at`),
    // FR-INV-01/02 lookup path
    index("reservations_window_idx").on(
      t.outletId,
      t.category,
      t.status,
      t.startsAt,
      t.endsAt,
    ),
    index("reservations_renter_idx").on(t.renterId, t.createdAt),
  ],
);

export const rentals = pgTable(
  "rentals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id),
    renterId: uuid("renter_id")
      .notNull()
      .references(() => renters.id),
    bikeId: uuid("bike_id")
      .notNull()
      .references(() => bikes.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    checkoutOutletId: uuid("checkout_outlet_id")
      .notNull()
      .references(() => outlets.id),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }).notNull(),
    expectedEndAt: timestamp("expected_end_at", { withTimezone: true }).notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkinOutletId: uuid("checkin_outlet_id").references(() => outlets.id),
    status: rentalStatus("status").notNull().default("open"),
    lateMinutes: integer("late_minutes"),
    lateFeeIdr: bigint("late_fee_idr", { mode: "bigint" }).notNull().default(sql`0`),
    mechanicalFailure: boolean("mechanical_failure").notNull().default(false),
    escalationStage: smallint("escalation_stage").notNull().default(0),
    checkoutChecklist: jsonb("checkout_checklist").notNull(),
    checkinChecklist: jsonb("checkin_checklist"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rentals_reservation_uq").on(t.reservationId),
    // DB guard from SRS data model: one open rental per bike (raw SQL migration
    // may also declare it; keep it in the schema so drizzle-kit diffs stay true).
    uniqueIndex("rentals_one_open_per_bike_uq")
      .on(t.bikeId)
      .where(sql`status = 'open'`),
    check("rentals_escalation_stage_check", sql`escalation_stage BETWEEN 0 AND 4`),
    index("rentals_owner_status_idx").on(t.ownerId, t.status, t.createdAt),
    index("rentals_bike_idx").on(t.bikeId, t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Money: intents, webhooks, refunds                                   */
/* ------------------------------------------------------------------ */

export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    purpose: paymentPurpose("purpose").notNull(),
    renterId: uuid("renter_id")
      .notNull()
      .references(() => renters.id),
    reservationId: uuid("reservation_id").references(() => reservations.id),
    rentalId: uuid("rental_id").references(() => rentals.id),
    amountIdr: bigint("amount_idr", { mode: "bigint" }).notNull(),
    status: paymentStatus("status").notNull().default("created"),
    gateway: text("gateway").notNull().default("xendit"),
    gatewayRef: text("gateway_ref"),
    paymentUrl: text("payment_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("payment_intents_amount_positive_check", sql`amount_idr > 0`),
    index("payment_intents_reservation_idx").on(t.reservationId),
    index("payment_intents_rental_idx").on(t.rentalId),
  ],
);

// INV-6: append-only history table. Raw payload immutable (trigger);
// only `processed_at` may transition, guarded in the 0001 migration.
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    raw: jsonb("raw").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("payment_webhook_events_provider_event_uq").on(t.provider, t.eventId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    paymentIntentId: uuid("payment_intent_id")
      .notNull()
      .references(() => paymentIntents.id),
    reservationId: uuid("reservation_id").references(() => reservations.id),
    rentalId: uuid("rental_id").references(() => rentals.id),
    amountIdr: bigint("amount_idr", { mode: "bigint" }).notNull(),
    reason: refundReason("reason").notNull(),
    gatewayRef: text("gateway_ref"),
    status: refundStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("refunds_amount_positive_check", sql`amount_idr > 0`)],
);

/* ------------------------------------------------------------------ */
/* Damage claims                                                       */
/* ------------------------------------------------------------------ */

export const depositClaims = pgTable(
  "deposit_claims",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id),
    renterId: uuid("renter_id")
      .notNull()
      .references(() => renters.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    amountIdr: bigint("amount_idr", { mode: "bigint" }).notNull(),
    description: text("description").notNull(),
    photoKeys: text("photo_keys").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").notNull().default("proposed"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("deposit_claims_amount_positive_check", sql`amount_idr > 0`),
    check("deposit_claims_status_check", sql`status IN ('proposed','approved','rejected')`),
    index("deposit_claims_owner_status_idx").on(t.ownerId, t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Staff event ingestion (FR-OFF-01)                                   */
/* ------------------------------------------------------------------ */

// INV-6: append-only scans. The raw event is immutable; the resolution
// metadata (status/flag_reason/resolved_by/resolved_at) is gated in 0001 (FR-SEC-02).
export const scanEvents = pgTable(
  "scan_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    clientEventId: uuid("client_event_id").notNull(),
    staffId: uuid("staff_id").references(() => users.id),
    outletId: uuid("outlet_id").references(() => outlets.id),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull(),
    flagReason: text("flag_reason"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("scan_events_client_event_id_uq").on(t.clientEventId),
    check("scan_events_status_check", sql`status IN ('applied','flagged','rejected')`),
    index("scan_events_outlet_status_idx").on(t.outletId, t.status, t.receivedAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Outbox, notifications, drift, audit                                 */
/* ------------------------------------------------------------------ */

// Transactional outbox for the in-process event bus (SRS 2.105).
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbox_events_undispatched_idx").on(t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").references(() => users.id),
    channel: text("channel").notNull(),
    template: text("template").notNull(),
    vars: jsonb("vars").notNull().default({}),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("notifications_channel_check", sql`channel IN ('whatsapp','email')`),
    check("notifications_status_check", sql`status IN ('queued','sent','failed')`),
    index("notifications_status_idx").on(t.status, t.createdAt),
  ],
);

export const inventoryDriftChecks = pgTable("inventory_drift_checks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  outletId: uuid("outlet_id")
    .notNull()
    .references(() => outlets.id),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  expected: jsonb("expected").notNull(),
  reported: jsonb("reported"),
  driftPct: numeric("drift_pct", { precision: 5, scale: 2 }),
});

// INV-6: append-only (trigger). Receives admin mutations etc. (FR-SEC-02).
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    actorId: uuid("actor_id").references(() => users.id),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId, t.createdAt)],
);
