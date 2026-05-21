import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import schema from "./schema.js";

const ruleValidator = schema.tables.rules.validator.extend({
  _id: v.id("rules"),
  _creationTime: v.number(),
});

const progressValidator = schema.tables.progress.validator.extend({
  _id: v.id("progress"),
  _creationTime: v.number(),
});

export const registerRule = mutation({
  args: {
    name: v.string(),
    factor: v.string(),
    threshold: v.number(),
    actionName: v.string(),
  },
  returns: v.object({
    ruleId: v.id("rules"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.threshold <= 0) {
      throw new Error("Rule threshold must be greater than zero.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("rules")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    const rule = {
      name: args.name,
      factor: args.factor,
      threshold: args.threshold,
      actionName: args.actionName,
      updatedAt: now,
    };

    if (existing !== null) {
      await ctx.db.patch("rules", existing._id, rule);
      return { ruleId: existing._id, created: false };
    }

    const ruleId = await ctx.db.insert("rules", {
      ...rule,
      createdAt: now,
    });
    return { ruleId, created: true };
  },
});

export const trackEvent = mutation({
  args: {
    userId: v.string(),
    factor: v.string(),
    increment: v.optional(v.number()),
    payload: v.optional(v.any()),
    occurredAt: v.optional(v.number()),
  },
  returns: v.object({
    progressId: v.id("progress"),
    value: v.number(),
    completed: v.array(
      v.object({
        ruleName: v.string(),
        actionName: v.string(),
        threshold: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const increment = args.increment ?? 1;
    if (increment <= 0) {
      throw new Error("Event increment must be greater than zero.");
    }

    const now = Date.now();
    const existingProgress = await ctx.db
      .query("progress")
      .withIndex("by_userId_and_factor", (q) =>
        q.eq("userId", args.userId).eq("factor", args.factor),
      )
      .unique();

    const previousValue = existingProgress?.value ?? 0;
    const value = previousValue + increment;
    const progressId =
      existingProgress?._id ??
      (await ctx.db.insert("progress", {
        userId: args.userId,
        factor: args.factor,
        value: 0,
        updatedAt: now,
      }));

    await ctx.db.patch("progress", progressId, {
      value,
      updatedAt: now,
    });

    const completed = [];
    const rules = ctx.db
      .query("rules")
      .withIndex("by_factor", (q) => q.eq("factor", args.factor));

    for await (const rule of rules) {
      if (previousValue >= rule.threshold || value < rule.threshold) {
        continue;
      }

      completed.push({
        ruleName: rule.name,
        actionName: rule.actionName,
        threshold: rule.threshold,
      });
    }

    return { progressId, value, completed };
  },
});

export const listRules = query({
  args: {
    factor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(ruleValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    if (args.factor !== undefined) {
      return await ctx.db
        .query("rules")
        .withIndex("by_factor", (q) => q.eq("factor", args.factor!))
        .take(limit);
    }
    return await ctx.db.query("rules").take(limit);
  },
});

export const getProgress = query({
  args: {
    userId: v.string(),
    factor: v.string(),
  },
  returns: v.union(v.null(), progressValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("progress")
      .withIndex("by_userId_and_factor", (q) =>
        q.eq("userId", args.userId).eq("factor", args.factor),
      )
      .unique();
  },
});

export const listProgressForUser = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(progressValidator),
  handler: async (ctx, args) => {
    const progress = [];
    const rows = ctx.db.query("progress").withIndex("by_userId_and_factor", (q) =>
      q.eq("userId", args.userId),
    );
    for await (const row of rows) {
      progress.push(row);
      if (progress.length >= (args.limit ?? 100)) {
        break;
      }
    }
    return progress;
  },
});
