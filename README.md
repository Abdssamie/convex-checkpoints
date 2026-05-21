# Convex Checkpoints

Convex Checkpoints lets an app define milestone rules for user activity and run
a host-owned callback when a rule is completed.

It fits cases like:

- send a welcome email 30 minutes after signup
- grant credits after a user creates 5 posts
- unlock a badge after profile completion

The component owns rule configuration and per-user factor progress. Your app
owns auth, app data, and the callback that performs side effects.

## Installation

Install the component in your app's `convex/convex.config.ts`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import convexCheckpoints from "@abdssamie/convex-checkpoints/convex.config.js";

const app = defineApp();
app.use(convexCheckpoints);

export default app;
```

## Usage

Rules live in the component. Actions live in your app. The component only
tracks progress and tells your callback when a rule is completed.

### Configure checkpoints

Create a small app module, usually `convex/checkpoints.ts`.

```ts
// convex/checkpoints.ts
import { components, internal } from "./_generated/api.js";
import { internalMutation, mutation } from "./_generated/server.js";
import { v } from "convex/values";
import { ConvexCheckpoints } from "@abdssamie/convex-checkpoints";

// 1. Create one helper for the installed component.
// `onComplete` points at your app-owned callback below.
export const checkpoints = new ConvexCheckpoints(components.convexCheckpoints, {
  onComplete: internal.checkpoints.onCheckpointComplete,
});

// 2. Register rules that describe completed checkpoints.
// - factor: the activity you track, such as "signup" or "create_post"
// - threshold: the value that completes the rule
// - actionName: the app action your callback should run
export const configureRules = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await checkpoints.registerRule(ctx, {
      name: "welcome-after-signup",
      factor: "signup",
      threshold: 1,
      actionName: "send_welcome_email",
    });

    await checkpoints.registerRule(ctx, {
      name: "credits-after-five-posts",
      factor: "create_post",
      threshold: 5,
      actionName: "add_credits",
    });

    return null;
  },
});

// 3. Handle completed rules in your app.
// This is a normal Convex function, so it can write tables, call internal
// mutations, or schedule later work.
export const onCheckpointComplete = internalMutation({
  args: {
    userId: v.string(),
    factor: v.string(),
    ruleName: v.string(),
    actionName: v.string(),
    value: v.number(),
    threshold: v.number(),
    completedAt: v.number(),
    occurredAt: v.optional(v.number()),
    payload: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    switch (args.actionName) {
      case "send_welcome_email":
        await ctx.scheduler.runAfter(30 * 60 * 1000, internal.emails.sendWelcome, {
          userId: args.userId,
        });
        break;
      case "add_credits":
        await ctx.runMutation(internal.credits.add, {
          userId: args.userId,
          amount: 100,
        });
        break;
    }
    return null;
  },
});

// Optional query helpers for dashboards, debug views, and admin tools.
export const { listRules, getProgress, listProgressForUser } =
  checkpoints.api();
```

### Track activity from app mutations

Call `trackEvent` after the app's real business write succeeds. In this example,
creating a post increments the user's `"create_post"` factor. When the value
reaches `5`, the `"credits-after-five-posts"` rule completes and the callback
runs with `actionName: "add_credits"`.

```ts
// convex/posts.ts
import { mutation } from "./_generated/server.js";
import { checkpoints } from "./checkpoints.js";
import { v } from "convex/values";

export const createPost = mutation({
  args: { body: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    // 4. First perform the real app write.
    const postId = await ctx.db.insert("posts", {
      body: args.body,
      userId,
    });

    // Then track the factor that may complete one or more rules.
    await checkpoints.trackEvent(ctx, {
      userId,
      factor: "create_post",
      payload: { postId },
    });

    return postId;
  },
});
```

When progress crosses a rule threshold, the wrapper schedules `onComplete`
immediately. If an action should happen later, schedule that timing in your
handler with Convex's `ctx.scheduler.runAfter` or `ctx.scheduler.runAt`, as the
welcome email example does.

The component does not store callback references; the app-side wrapper schedules
the typed function reference directly.

## HTTP

Prefer mutation wrappers for app-driven events. They run inside your app's
Convex functions, so you can authenticate the user, validate input, write app
data, and track progress in one place.

HTTP ingestion is for server-to-server entry points such as webhooks or trusted
backend jobs. Treat it as a public endpoint: anyone who can reach the URL can
try to submit an event unless you verify the request.

The HTTP helper exposes the same `trackEvent` flow through routes. Use it when
an external system needs to report a factor without calling your Convex
mutations directly.

```ts
// convex/http.ts
import { checkpoints } from "./checkpoints.js";

export default checkpoints.http("/checkpoints", {
  token: process.env.CHECKPOINTS_SECRET,
});
```

This registers both `POST /checkpoints` and factor-specific routes such as
`POST /checkpoints/create_post`. The factor-specific route uses the path segment
as the factor, so the request body only needs the user and payload fields.

```sh
curl -X POST "$CONVEX_SITE_URL/checkpoints/create_post" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CHECKPOINTS_SECRET" \
  -d '{"userId":"user1","postId":"post1"}'
```

Requests must include `Authorization: Bearer <token>` when `token` is set.
Keep `CHECKPOINTS_SECRET` in server-side environment variables only.

## Tests

When using `convex-test`, register the component with the test instance:

```ts
import { convexTest } from "convex-test";
import component from "@abdssamie/convex-checkpoints/test";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.*s");
const t = convexTest(schema, modules);
component.register(t);
```
