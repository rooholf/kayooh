import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  attributesSchema: jsonb("attributes_schema"),
});

export type Category = typeof categories.$inferSelect;
