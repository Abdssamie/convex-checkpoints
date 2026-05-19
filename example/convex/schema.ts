import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  debugActions: defineTable({
    userId: v.string(),
    checkpointName: v.string(),
    action: v.string(),
    status: v.string(),
    detail: v.string(),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_userId_and_createdAt", ["userId", "createdAt"]),
  userStats: defineTable({
    userId: v.string(),
    postsCreated: v.number(),
    profileCompleted: v.boolean(),
    credits: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
});
