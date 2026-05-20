# Convex Checkpoints

Convex Checkpoints stores user checkpoints, deduplicates retried submissions,
and lets your app attach typed handlers to those checkpoints.

It fits cases like:

- send a welcome email after `user.signup`
- grant credits after the fifth `post.created`
- keep a queryable audit log of recent checkpoints

The component owns the checkpoint log. Your app owns the checkpoint logic, auth,
and any side effects.

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

There are two steps: define your checkpoint registry with handlers, then expose submit mutations for your app to call.

```ts
// convex/checkpoints.ts
import { components, internal } from "./_generated/api.js";
import { mutation } from "./_generated/server.js";
import { v } from "convex/values";
import { ConvexCheckpoints } from "@abdssamie/convex-checkpoints";

export const checkpoints = new ConvexCheckpoints<{
  "user.signup": { userId: string; email: string };
  "post.created": { userId: string; postId: string; title: string };
}>(components.convexCheckpoints);

// Handlers run when a checkpoint is first recorded (deduplicated by idempotencyKey)
checkpoints.on("user.signup", async (ctx, payload) => {
  await ctx.scheduler.runAfter(30 * 60 * 1000, internal.emails.welcome, {
    userId: payload.userId,
  });
});

checkpoints.on("post.created", async (ctx, payload) => {
  const count = await ctx.runQuery(internal.posts.countByUser, {
    userId: payload.userId,
  });

  if (count === 5) {
    await ctx.runMutation(internal.credits.add, {
      userId: payload.userId,
      amount: 100,
    });
  }
});

// Submit mutations — called from your app code
export const submitPostCreated = mutation({
  args: {
    userId: v.string(),
    postId: v.string(),
    title: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await checkpoints.submit(ctx, {
      name: "post.created",
      userId: args.userId,
      payload: {
        userId: args.userId,
        postId: args.postId,
        title: args.title,
      },
      idempotencyKey: args.idempotencyKey,
    });
  },
});

export const { listRecent, listByName, listByUser } = checkpoints.api();
```

Call those wrappers from the rest of your app:

```ts
// convex/posts.ts
import { api } from "./_generated/api.js";
import { mutation } from "./_generated/server.js";
import { v } from "convex/values";

export const createPost = mutation({
  args: { body: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const postId = await ctx.db.insert("posts", {
      body: args.body,
      userId,
    });

    await ctx.runMutation(api.checkpoints.submitPostCreated, {
      userId,
      postId,
      title: args.body.slice(0, 80),
      idempotencyKey: `post.created:${postId}`,
    });

    return postId;
  },
});
```

When `idempotencyKey` is present, duplicate submissions return the original
checkpoint ID and skip handler re-execution.

## HTTP

Prefer mutation wrappers for app-driven checkpoints. They run inside your app's
Convex functions, so you can authenticate the user, validate the input, write
app data, and submit the checkpoint in one place.

HTTP ingestion is for server-to-server entry points such as webhooks or trusted
backend jobs. Treat it as a public endpoint: anyone who can reach the URL can
try to submit a checkpoint unless you verify the request.

```ts
// convex/http.ts
import { checkpoints } from "./checkpoints.js";

export default checkpoints.http("/checkpoints", {
  token: process.env.CHECKPOINTS_SECRET,
});
```

Requests must include `Authorization: Bearer <token>`. Keep
`CHECKPOINTS_SECRET` in server-side environment variables only. If the token
option is configured but the environment variable is missing or empty, HTTP
checkpoint submissions are rejected.

This registers both `POST /checkpoints` and checkpoint-specific routes such as
`POST /checkpoints/post.created`.

For checkpoint-specific routes, the route selects the checkpoint name and the
request body becomes the payload:

```sh
curl -X POST "$CONVEX_SITE_URL/checkpoints/post.created" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CHECKPOINTS_SECRET" \
  -d '{"userId":"user1","postId":"post1"}'
```

For webhook providers, verify the provider's signature in `authorize`. The
request is cloned before authorization runs, so signature checks can read the
body without preventing checkpoint parsing afterward.

Do not put a checkpoint HTTP secret in browser code. If a user action in your
app should submit a checkpoint, expose a Convex mutation instead and call
`checkpoints.submit(ctx, ...)` from that mutation.

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
