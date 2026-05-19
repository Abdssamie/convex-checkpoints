import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  checkpoints: defineTable({
    name: v.string(),
    userId: v.optional(v.string()),
    payload: v.optional(v.any()),
    idempotencyKey: v.optional(v.string()),
    reachedAt: v.number(),
    receivedAt: v.number(),
  })
    .index("by_name_and_reachedAt", ["name", "reachedAt"])
    .index("by_userId_and_reachedAt", ["userId", "reachedAt"])
    .index("by_idempotencyKey", ["idempotencyKey"]),
});
