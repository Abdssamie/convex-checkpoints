import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rules: defineTable({
    name: v.string(),
    factor: v.string(),
    threshold: v.number(),
    actionName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_factor", ["factor"]),
  progress: defineTable({
    userId: v.string(),
    factor: v.string(),
    value: v.number(),
    updatedAt: v.number(),
  }).index("by_userId_and_factor", ["userId", "factor"]),
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
  }).index("by_key", ["key"]),
});
