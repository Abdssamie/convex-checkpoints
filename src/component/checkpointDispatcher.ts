import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
} from "convex/server";

type CheckpointMutationCtx<T extends GenericDataModel = GenericDataModel> =
  GenericMutationCtx<T>;
type CheckpointActionCtx<T extends GenericDataModel = GenericDataModel> =
  GenericActionCtx<T>;

type CheckpointRegistry = Record<string, unknown>;
type CheckpointName<TCheckpointRegistry extends CheckpointRegistry> = Extract<
  keyof TCheckpointRegistry,
  string
>;

type CheckpointRegistration<
  TCheckpointRegistry extends CheckpointRegistry,
  TCheckpoint extends CheckpointName<TCheckpointRegistry>,
  TDataModel extends GenericDataModel,
> = {
  defineMutation: (
    handler: CheckpointMutationHandler<
      TCheckpointRegistry,
      TCheckpoint,
      TDataModel,
      CheckpointMutationCtx<TDataModel>
    >,
  ) => ConvexCheckpoints<TCheckpointRegistry, TDataModel>;
  defineAction: (
    handler: CheckpointActionHandler<
      TCheckpointRegistry,
      TCheckpoint,
      TDataModel,
      CheckpointActionCtx<TDataModel>
    >,
  ) => ConvexCheckpoints<TCheckpointRegistry, TDataModel>;
};

export type CheckpointMutationHandler<
  TCheckpointRegistry extends CheckpointRegistry,
  TCheckpoint extends CheckpointName<TCheckpointRegistry>,
  TDataModel extends GenericDataModel,
  TCheckpointCtx extends CheckpointMutationCtx<TDataModel> =
    CheckpointMutationCtx<TDataModel>,
> = {
  handle(
    ctx: TCheckpointCtx,
    payload: TCheckpointRegistry[TCheckpoint],
    meta: { checkpoint: TCheckpoint },
  ): Promise<void> | void;
}["handle"];

export type CheckpointActionHandler<
  TCheckpointRegistry extends CheckpointRegistry,
  TCheckpoint extends CheckpointName<TCheckpointRegistry>,
  TDataModel extends GenericDataModel,
  TCheckpointCtx extends CheckpointActionCtx<TDataModel> =
    CheckpointActionCtx<TDataModel>,
> = {
  handle(
    ctx: TCheckpointCtx,
    payload: TCheckpointRegistry[TCheckpoint],
    meta: { checkpoint: TCheckpoint },
  ): Promise<void> | void;
}["handle"];

export type CheckpointHandler<
  TCheckpointRegistry extends CheckpointRegistry,
  TCheckpoint extends CheckpointName<TCheckpointRegistry>,
  TDataModel extends GenericDataModel = GenericDataModel,
> = CheckpointMutationHandler<TCheckpointRegistry, TCheckpoint, TDataModel>;

export class ConvexCheckpoints<
  TCheckpointRegistry extends CheckpointRegistry,
  TDataModel extends GenericDataModel = GenericDataModel,
> {
  private actionHandlers = new Map<
    CheckpointName<TCheckpointRegistry>,
    CheckpointActionHandler<
      TCheckpointRegistry,
      CheckpointName<TCheckpointRegistry>,
      TDataModel,
      CheckpointActionCtx<TDataModel>
    >[]
  >();

  private mutationHandlers = new Map<
    CheckpointName<TCheckpointRegistry>,
    CheckpointMutationHandler<
      TCheckpointRegistry,
      CheckpointName<TCheckpointRegistry>,
      TDataModel,
      CheckpointMutationCtx<TDataModel>
    >[]
  >();

  public on<TCheckpoint extends CheckpointName<TCheckpointRegistry>>(
    checkpoint: TCheckpoint,
    handler: CheckpointMutationHandler<
      TCheckpointRegistry,
      TCheckpoint,
      TDataModel,
      CheckpointMutationCtx<TDataModel>
    >,
  ): this;
  public on<TCheckpoint extends CheckpointName<TCheckpointRegistry>>(
    checkpoint: TCheckpoint,
  ): CheckpointRegistration<TCheckpointRegistry, TCheckpoint, TDataModel>;
  public on<TCheckpoint extends CheckpointName<TCheckpointRegistry>>(
    checkpoint: TCheckpoint,
    handler?: CheckpointMutationHandler<
      TCheckpointRegistry,
      TCheckpoint,
      TDataModel,
      CheckpointMutationCtx<TDataModel>
    >,
  ):
    | this
    | CheckpointRegistration<TCheckpointRegistry, TCheckpoint, TDataModel> {
    if (handler !== undefined) {
      this.addMutationHandler(checkpoint, handler);
      return this;
    }

    return {
      defineMutation: (
        handler: CheckpointMutationHandler<
          TCheckpointRegistry,
          TCheckpoint,
          TDataModel,
          CheckpointMutationCtx<TDataModel>
        >,
      ): this => {
        this.addMutationHandler(checkpoint, handler);
        return this;
      },
      defineAction: (
        handler: CheckpointActionHandler<
          TCheckpointRegistry,
          TCheckpoint,
          TDataModel,
          CheckpointActionCtx<TDataModel>
        >,
      ): this => {
        this.addActionHandler(checkpoint, handler);
        return this;
      },
    };
  }

  private addMutationHandler<
    TCheckpoint extends CheckpointName<TCheckpointRegistry>,
  >(
    checkpoint: TCheckpoint,
    handler: CheckpointMutationHandler<
      TCheckpointRegistry,
      TCheckpoint,
      TDataModel,
      CheckpointMutationCtx<TDataModel>
    >,
  ) {
    const handlers = this.mutationHandlers.get(checkpoint) ?? [];
    handlers.push(handler);
    this.mutationHandlers.set(checkpoint, handlers);
  }

  private addActionHandler<
    TCheckpoint extends CheckpointName<TCheckpointRegistry>,
  >(
    checkpoint: TCheckpoint,
    handler: CheckpointActionHandler<
      TCheckpointRegistry,
      TCheckpoint,
      TDataModel,
      CheckpointActionCtx<TDataModel>
    >,
  ) {
    const handlers = this.actionHandlers.get(checkpoint) ?? [];
    handlers.push(handler);
    this.actionHandlers.set(checkpoint, handlers);
  }

  public async triggerAction<
    TCheckpoint extends CheckpointName<TCheckpointRegistry>,
  >(
    ctx: CheckpointActionCtx<TDataModel>,
    checkpoint: TCheckpoint,
    payload: TCheckpointRegistry[TCheckpoint],
  ): Promise<void> {
    const handlers = this.actionHandlers.get(checkpoint);
    if (handlers === undefined) {
      return;
    }

    for (const handler of handlers) {
      await handler(ctx, payload, {
        checkpoint,
      });
    }
  }

  public async triggerMutation<
    TCheckpoint extends CheckpointName<TCheckpointRegistry>,
  >(
    ctx: CheckpointMutationCtx<TDataModel>,
    checkpoint: TCheckpoint,
    payload: TCheckpointRegistry[TCheckpoint],
  ): Promise<void> {
    const handlers = this.mutationHandlers.get(checkpoint);
    if (handlers === undefined) {
      return;
    }

    for (const handler of handlers) {
      await handler(ctx, payload, {
        checkpoint,
      });
    }
  }

  public async trigger<TCheckpoint extends CheckpointName<TCheckpointRegistry>>(
    ctx: CheckpointMutationCtx<TDataModel>,
    checkpoint: TCheckpoint,
    payload: TCheckpointRegistry[TCheckpoint],
  ): Promise<void> {
    await this.triggerMutation(ctx, checkpoint, payload);
  }
}
