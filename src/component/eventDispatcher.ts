import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
} from "convex/server";

type EventCtx =
  | GenericMutationCtx<GenericDataModel>
  | GenericActionCtx<GenericDataModel>;

type EventRegistry = Record<string, unknown>;
type EventName<TEventRegistry extends EventRegistry> = Extract<
  keyof TEventRegistry,
  string
>;

export type EventHandler<
  TEventRegistry extends EventRegistry,
  TEvent extends EventName<TEventRegistry>,
> = (
  ctx: EventCtx,
  payload: TEventRegistry[TEvent],
  meta: { event: TEvent },
) => Promise<void> | void;

export class ConvexCheckpoints<TEventRegistry extends EventRegistry> {
  private handlers = new Map<
    EventName<TEventRegistry>,
    EventHandler<TEventRegistry, EventName<TEventRegistry>>[]
  >();

  public on<TEvent extends EventName<TEventRegistry>>(
    event: TEvent,
    handler: EventHandler<TEventRegistry, TEvent>,
  ): this {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(
      handler as EventHandler<TEventRegistry, EventName<TEventRegistry>>,
    );
    this.handlers.set(event, handlers);
    return this;
  }

  public async trigger<TEvent extends EventName<TEventRegistry>>(
    ctx: EventCtx,
    event: TEvent,
    payload: TEventRegistry[TEvent],
  ): Promise<void> {
    const handlers = this.handlers.get(event);
    if (handlers === undefined) {
      return;
    }

    for (const handler of handlers) {
      await handler(ctx, payload, {
        event,
      });
    }
  }
}
