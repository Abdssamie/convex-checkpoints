import { defineApp } from "convex/server";
import convexCheckpoints from "@abdssamie/convex-checkpoints/convex.config.js";

const app = defineApp();
app.use(convexCheckpoints);

export default app;
