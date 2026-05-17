import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server.js";
import { ConvexCheckpoints } from "@abdssamie/convex-checkpoints";

const demoUserId = "demo-user";

export const events = new ConvexCheckpoints<{
  "user.signup": { userId: string; email: string; source: string };
  "post.created": { userId: string; postId: string; title: string };
  "profile.completed": { userId: string; fields: string[] };
  "billing.upgraded": { userId: string; plan: "pro" | "team" };
}>(components.convexCheckpoints);

events.on("user.signup", async (ctx, payload) => {
  await ctx.runMutation(internal.example.logAction, {
    userId: payload.userId,
    eventName: "user.signup",
    action: "welcome_email",
    status: "scheduled",
    detail: `Welcome email scheduled for ${payload.email}`,
    payload,
  });
  await ctx.scheduler.runAfter(
    30 * 60 * 1000,
    internal.example.markWelcomeEmailSent,
    {
      userId: payload.userId,
      email: payload.email,
    },
  );
});

events.on("post.created", async (ctx, payload) => {
  const postsCreated: number = await ctx.runMutation(
    internal.example.incrementPosts,
    {
      userId: payload.userId,
    },
  );

  await ctx.runMutation(internal.example.logAction, {
    userId: payload.userId,
    eventName: "post.created",
    action: "post_counter",
    status: "updated",
    detail: `Post counter is now ${postsCreated}`,
    payload,
  });

  if (postsCreated === 5) {
    const credits: number = await ctx.runMutation(
      internal.example.addCredits,
      {
        userId: payload.userId,
        amount: 100,
      },
    );
    await ctx.runMutation(internal.example.logAction, {
      userId: payload.userId,
      eventName: "post.created",
      action: "credits_awarded",
      status: "completed",
      detail: `Granted 100 credits at 5 posts. Balance: ${credits}`,
      payload,
    });
  }
});

events.on("profile.completed", async (ctx, payload) => {
  await ctx.runMutation(internal.example.completeProfile, {
    userId: payload.userId,
  });
  await ctx.runMutation(internal.example.logAction, {
    userId: payload.userId,
    eventName: "profile.completed",
    action: "profile_badge",
    status: "completed",
    detail: `Profile badge unlocked with ${payload.fields.length} fields`,
    payload,
  });
  await ctx.scheduler.runAt(
    Date.now() + 5 * 60 * 1000,
    internal.example.auditProfileCompletion,
    {
      userId: payload.userId,
      fields: payload.fields,
    },
  );
});

events.on("billing.upgraded", async (ctx, payload) => {
  const amount = payload.plan === "team" ? 1000 : 300;
  const credits: number = await ctx.runMutation(internal.example.addCredits, {
    userId: payload.userId,
    amount,
  });
  await ctx.runMutation(internal.example.logAction, {
    userId: payload.userId,
    eventName: "billing.upgraded",
    action: "plan_credits",
    status: "completed",
    detail: `Added ${amount} ${payload.plan} credits. Balance: ${credits}`,
    payload,
  });
});

export const { submit, listRecent, listByName, listByUser } = events.api();

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
      eventName: v.string(),
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
    return null;
  },
});

export const logAction = internalMutation({
  args: {
    userId: v.string(),
    eventName: v.string(),
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

export const markWelcomeEmailSent = internalMutation({
  args: {
    userId: v.string(),
    email: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("debugActions", {
      userId: args.userId,
      eventName: "user.signup",
      action: "welcome_email_sent",
      status: "completed",
      detail: `Delayed welcome email sent to ${args.email}`,
      payload: args,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const auditProfileCompletion = internalMutation({
  args: {
    userId: v.string(),
    fields: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("debugActions", {
      userId: args.userId,
      eventName: "profile.completed",
      action: "profile_audit",
      status: "completed",
      detail: `Profile completion audited for ${args.fields.length} fields`,
      payload: args,
      createdAt: Date.now(),
    });
    return null;
  },
});

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
