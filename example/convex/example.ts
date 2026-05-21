import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server.js";
import {
  ConvexCheckpoints,
  type CheckpointCompletion,
} from "@abdssamie/convex-checkpoints";

const demoUserId = "demo-user";

export const checkpoints: ConvexCheckpoints = new ConvexCheckpoints(
  components.convexCheckpoints,
  {
    onComplete: internal.example.onCheckpointComplete,
  },
);

const completionArgsValidator = {
  userId: v.string(),
  factor: v.string(),
  ruleName: v.string(),
  actionName: v.string(),
  value: v.number(),
  threshold: v.number(),
  completedAt: v.number(),
  occurredAt: v.optional(v.number()),
  payload: v.optional(v.any()),
};

export const { listRules, getProgress, listProgressForUser } =
  checkpoints.api();

export const configureRules = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await registerDefaultRules(ctx);
    return null;
  },
});

export const submitSignup = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
    source: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await registerDefaultRules(ctx);
    const result = await checkpoints.trackEvent(ctx, {
      userId: args.userId,
      factor: "signup",
      payload: {
        email: args.email,
        source: args.source,
      },
    });
    return result.progressId;
  },
});

export const submitPostCreated = mutation({
  args: {
    userId: v.string(),
    postId: v.string(),
    title: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await registerDefaultRules(ctx);
    await ctx.runMutation(internal.example.incrementPosts, {
      userId: args.userId,
    });
    const result = await checkpoints.trackEvent(ctx, {
      userId: args.userId,
      factor: "create_post",
      payload: {
        postId: args.postId,
        title: args.title,
      },
    });
    return result.progressId;
  },
});

export const submitProfileCompleted = mutation({
  args: {
    userId: v.string(),
    fields: v.array(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await registerDefaultRules(ctx);
    await ctx.runMutation(internal.example.completeProfile, {
      userId: args.userId,
    });
    const result = await checkpoints.trackEvent(ctx, {
      userId: args.userId,
      factor: "profile_completed",
      payload: {
        fields: args.fields,
      },
    });
    return result.progressId;
  },
});

export const trackEventAndSideEffects = internalMutation({
  args: {
    userId: v.string(),
    factor: v.string(),
    payload: v.optional(v.any()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await registerDefaultRules(ctx);
    if (args.factor === "create_post") {
      await ctx.runMutation(internal.example.incrementPosts, {
        userId: args.userId,
      });
    }
    const result = await checkpoints.trackEvent(ctx, {
      userId: args.userId,
      factor: args.factor,
      payload: args.payload,
    });
    return result.progressId;
  },
});

export const listDebugActions = query({
  args: {
    userId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("debugActions"),
      _creationTime: v.number(),
      userId: v.string(),
      checkpointName: v.string(),
      action: v.string(),
      status: v.string(),
      detail: v.string(),
      payload: v.optional(v.any()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("debugActions")
      .withIndex("by_userId_and_createdAt", (q) =>
        q.eq("userId", args.userId ?? demoUserId),
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getStats = query({
  args: {
    userId: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("userStats"),
      _creationTime: v.number(),
      userId: v.string(),
      postsCreated: v.number(),
      profileCompleted: v.boolean(),
      credits: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userStats")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId ?? demoUserId))
      .unique();
  },
});

export const resetDebug = mutation({
  args: {
    userId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = args.userId ?? demoUserId;
    const actions = await ctx.db
      .query("debugActions")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .take(100);
    for (const action of actions) {
      await ctx.db.delete("debugActions", action._id);
    }

    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (stats !== null) {
      await ctx.db.delete("userStats", stats._id);
    }

    await checkpoints.resetProgress(ctx, { userId });
    return null;
  },
});

export const onCheckpointComplete = internalMutation({
  args: completionArgsValidator,
  returns: v.null(),
  handler: async (ctx, args: CheckpointCompletion) => {
    switch (args.actionName) {
      case "welcome_email":
        await ctx.scheduler.runAfter(
          30 * 60 * 1000,
          internal.example.logAction,
          {
            userId: args.userId,
            checkpointName: args.ruleName,
            action: "welcome_email_sent",
            status: "completed",
            detail: `Delayed welcome email sent for ${args.userId}`,
            payload: args,
          },
        );
        break;
      case "add_credits": {
        const credits: number = await ctx.runMutation(
          internal.example.addCredits,
          {
            userId: args.userId,
            amount: 100,
          },
        );
        await ctx.runMutation(internal.example.logAction, {
          userId: args.userId,
          checkpointName: args.ruleName,
          action: "credits_awarded",
          status: "completed",
          detail: `Granted 100 credits at ${args.value} posts. Balance: ${credits}`,
          payload: args,
        });
        break;
      }
      case "profile_badge":
        await ctx.runMutation(internal.example.logAction, {
          userId: args.userId,
          checkpointName: args.ruleName,
          action: "profile_badge",
          status: "completed",
          detail: "Profile badge unlocked",
          payload: args,
        });
        break;
    }
    return null;
  },
});

export const logAction = internalMutation({
  args: {
    userId: v.string(),
    checkpointName: v.string(),
    action: v.string(),
    status: v.string(),
    detail: v.string(),
    payload: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("debugActions", {
      ...args,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const incrementPosts = internalMutation({
  args: {
    userId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const stats = await getOrCreateStats(ctx, args.userId);
    const postsCreated = stats.postsCreated + 1;
    await ctx.db.patch("userStats", stats._id, {
      postsCreated,
      updatedAt: Date.now(),
    });
    return postsCreated;
  },
});

export const completeProfile = internalMutation({
  args: {
    userId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stats = await getOrCreateStats(ctx, args.userId);
    await ctx.db.patch("userStats", stats._id, {
      profileCompleted: true,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const addCredits = internalMutation({
  args: {
    userId: v.string(),
    amount: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const stats = await getOrCreateStats(ctx, args.userId);
    const credits = stats.credits + args.amount;
    await ctx.db.patch("userStats", stats._id, {
      credits,
      updatedAt: Date.now(),
    });
    return credits;
  },
});

async function registerDefaultRules(ctx: MutationCtx) {
  await checkpoints.registerRule(ctx, {
    name: "welcome-after-signup",
    factor: "signup",
    threshold: 1,
    actionName: "welcome_email",
  });

  await checkpoints.registerRule(ctx, {
    name: "credits-after-five-posts",
    factor: "create_post",
    threshold: 5,
    actionName: "add_credits",
  });

  await checkpoints.registerRule(ctx, {
    name: "badge-after-profile-completion",
    factor: "profile_completed",
    threshold: 1,
    actionName: "profile_badge",
  });
}

async function getOrCreateStats(ctx: MutationCtx, userId: string) {
  const existing = await ctx.db
    .query("userStats")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (existing !== null) {
    return existing;
  }

  const id = await ctx.db.insert("userStats", {
    userId,
    postsCreated: 0,
    profileCompleted: false,
    credits: 0,
    updatedAt: Date.now(),
  });
  const stats = await ctx.db.get("userStats", id);
  if (stats === null) {
    throw new Error("Failed to create stats");
  }
  return stats;
}
