/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      getProgress: FunctionReference<
        "query",
        "internal",
        { factor: string; userId: string },
        null | {
          _creationTime: number;
          _id: string;
          factor: string;
          updatedAt: number;
          userId: string;
          value: number;
        },
        Name
      >;
      listProgressForUser: FunctionReference<
        "query",
        "internal",
        { limit?: number; userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          factor: string;
          updatedAt: number;
          userId: string;
          value: number;
        }>,
        Name
      >;
      listRules: FunctionReference<
        "query",
        "internal",
        { factor?: string; limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          actionName: string;
          createdAt: number;
          factor: string;
          name: string;
          threshold: number;
          updatedAt: number;
        }>,
        Name
      >;
      registerRule: FunctionReference<
        "mutation",
        "internal",
        { actionName: string; factor: string; name: string; threshold: number },
        { created: boolean; ruleId: string },
        Name
      >;
      resetProgress: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        null,
        Name
      >;
      trackEvent: FunctionReference<
        "mutation",
        "internal",
        {
          factor: string;
          increment?: number;
          occurredAt?: number;
          payload?: any;
          userId: string;
        },
        {
          completed: Array<{
            actionName: string;
            ruleName: string;
            threshold: number;
          }>;
          progressId: string;
          value: number;
        },
        Name
      >;
    };
  };
