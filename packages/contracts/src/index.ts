import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const idrSchema = z.number().int().min(0).max(1_000_000_000);
export const phoneSchema = z.string().regex(/^\+62[0-9]{8,13}$/);
export const emailSchema = z.string().toLowerCase().email().min(3).max(254);
export const passwordSchema = z.string().min(12).max(128);
export const categoryCodeSchema = z.string().regex(/^[a-z0-9_]{2,16}$/);
export const assetTagSchema = z.string().regex(/^JMB-[0-9]{3}-[A-Z]{3}-[0-9]{3}$/);
export const outletCodeSchema = z.string().regex(/^JMB-[0-9]{3}$/);
export const timestampSchema = z.string().datetime({ offset: false });
export const weekKeySchema = z
  .string()
  .regex(/^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/);

export type Uuid = z.infer<typeof uuidSchema>;
export type Idr = z.infer<typeof idrSchema>;
export type CategoryCode = z.infer<typeof categoryCodeSchema>;
