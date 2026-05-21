import { checkpoints } from "./example.js";

export default checkpoints.http("/checkpoints", {
  token: process.env.CHECKPOINTS_SECRET,
});
