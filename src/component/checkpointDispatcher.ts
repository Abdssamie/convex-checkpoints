import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
} from "convex/server";

type CheckpointCtx =
  | GenericMutationCtx<GenericDataModel>
  | GenericActionCtx<GenericDataModel>;

type CheckpointRegistry = Record<string, unknown>;
type CheckpointName<TCheckpointRegistry extends CheckpointRegistry> = Extract<
  keyof TCheckpointRegistry,
  string
>;

export type CheckpointHandler<
  TCheckpointRegistry extends CheckpointRegistry,
  TCheckpoint extends CheckpointName<TCheckpointRegistry>,
> = (
  ctx: CheckpointCtx,
  payload: TCheckpointRegistry[TCheckpoint],
  meta: { checkpoint: TCheckpoint },
) => Promise<void> | void;

export class ConvexCheckpoints<TCheckpointRegistry extends CheckpointRegistry> {
  private handlers = new Map<
    CheckpointName<TCheckpointRegistry>,
    CheckpointHandler<
      TCheckpointRegistry,
      CheckpointName<TCheckpointRegistry>
    >[]
  >();

  public on<TCheckpoint extends CheckpointName<TCheckpointRegistry>>(
    checkpoint: TCheckpoint,
    handler: CheckpointHandler<TCheckpointRegistry, TCheckpoint>,
  ): this {
    const handlers = this.handlers.get(checkpoint) ?? [];
    handlers.push(
      handler as CheckpointHandler<
        TCheckpointRegistry,
        CheckpointName<TCheckpointRegistry>
      >,
    );
    this.handlers.set(checkpoint, handlers);
    return this;
  }

  public async trigger<TCheckpoint extends CheckpointName<TCheckpointRegistry>>(
    ctx: CheckpointCtx,
    checkpoint: TCheckpoint,
    payload: TCheckpointRegistry[TCheckpoint],
  ): Promise<void> {
    const handlers = this.handlers.get(checkpoint);
    if (handlers === undefined) {
      return;
    }

    for (const handler of handlers) {
      await handler(ctx, payload, {
        checkpoint,
      });
    }
  }
}
