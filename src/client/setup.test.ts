/// <reference types="vite/client" />
import { test } from "vitest";
import { convexTest } from "convex-test";
export const modules = import.meta.glob("./**/*.*s");

import {
  defineSchema,
  type AnyComponents,
  type GenericSchema,
  type SchemaDefinition,
} from "convex/server";
import { componentsGeneric } from "convex/server";
import { register } from "../test.js";

export function initConvexTest<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(schema?: Schema) {
  const t = convexTest(schema ?? defineSchema({}), modules);
  register(t);
  return t;
}
export const components: AnyComponents = {
  convexCheckpoints: componentsGeneric().convexCheckpoints,
};

test("setup", () => {});
