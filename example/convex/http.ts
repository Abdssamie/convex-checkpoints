import { checkpoints } from "./example.js";

const checkpointsSecret = process.env.CHECKPOINTS_SECRET ?? "checkpoint-secret";

export default checkpoints.http("/checkpoints", {
  token: checkpointsSecret,
});
