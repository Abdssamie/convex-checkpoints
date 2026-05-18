import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server.js";
import schema from "./schema.js";

const eventValidator = schema.tables.events.validator.extend({
  _id: v.id("events"),
  _creationTime: v.number(),
});

export const record = mutation({
  args: {
    name: v.string(),
    userId: v.optional(v.string()),
    payload: v.optional(v.any()),
    idempotencyKey: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("events")
        .withIndex("by_idempotencyKey", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey),
        )
        .unique();

      if (existing !== null) {
        return existing._id;
      }
    }

    const now = Date.now();
    return await ctx.db.insert("events", {
      name: args.name,
      userId: args.userId,
      payload: args.payload,
      idempotencyKey: args.idempotencyKey,
      occurredAt: args.occurredAt ?? now,
      receivedAt: now,
    });
  },
});

export const recordOnce = mutation({
  args: {
    name: v.string(),
    userId: v.optional(v.string()),
    payload: v.optional(v.any()),
    idempotencyKey: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
  },
  returns: v.object({
    eventId: v.id("events"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("events")
        .withIndex("by_idempotencyKey", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey),
        )
        .unique();

      if (existing !== null) {
        return { eventId: existing._id, created: false };
      }
    }

    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      name: args.name,
      userId: args.userId,
      payload: args.payload,
      idempotencyKey: args.idempotencyKey,
      occurredAt: args.occurredAt ?? now,
      receivedAt: now,
    });

    return { eventId, created: true };
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(eventValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("events")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listByName = query({
  args: {
    name: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(eventValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("events")
      .withIndex("by_name_and_occurredAt", (q) => q.eq("name", args.name))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listByUser = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(eventValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("events")
      .withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const get = internalQuery({
  args: {
    eventId: v.id("events"),
  },
  returns: v.union(v.null(), eventValidator),
  handler: async (ctx, args) => {
    return await ctx.db.get("events", args.eventId);
  },
});
