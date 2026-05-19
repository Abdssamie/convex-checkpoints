import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server.js";
import schema from "./schema.js";

const checkpointValidator = schema.tables.checkpoints.validator.extend({
  _id: v.id("checkpoints"),
  _creationTime: v.number(),
});

export const record = mutation({
  args: {
    name: v.string(),
    userId: v.optional(v.string()),
    payload: v.optional(v.any()),
    idempotencyKey: v.optional(v.string()),
    reachedAt: v.optional(v.number()),
  },
  returns: v.object({
    checkpointId: v.id("checkpoints"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("checkpoints")
        .withIndex("by_idempotencyKey", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey),
        )
        .unique();

      if (existing !== null) {
        return { checkpointId: existing._id, created: false };
      }
    }

    const now = Date.now();
    const checkpointId = await ctx.db.insert("checkpoints", {
      name: args.name,
      userId: args.userId,
      payload: args.payload,
      idempotencyKey: args.idempotencyKey,
      reachedAt: args.reachedAt ?? now,
      receivedAt: now,
    });

    return { checkpointId, created: true };
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(checkpointValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpoints")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listByName = query({
  args: {
    name: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(checkpointValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpoints")
      .withIndex("by_name_and_reachedAt", (q) => q.eq("name", args.name))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listByUser = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(checkpointValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpoints")
      .withIndex("by_userId_and_reachedAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const get = internalQuery({
  args: {
    checkpointId: v.id("checkpoints"),
  },
  returns: v.union(v.null(), checkpointValidator),
  handler: async (ctx, args) => {
    return await ctx.db.get("checkpoints", args.checkpointId);
  },
});
