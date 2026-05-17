import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  events: defineTable({
    name: v.string(),
    userId: v.optional(v.string()),
    payload: v.optional(v.any()),
    idempotencyKey: v.optional(v.string()),
    occurredAt: v.number(),
    receivedAt: v.number(),
  })
    .index("by_name_and_occurredAt", ["name", "occurredAt"])
    .index("by_userId_and_occurredAt", ["userId", "occurredAt"])
    .index("by_idempotencyKey", ["idempotencyKey"]),
});
