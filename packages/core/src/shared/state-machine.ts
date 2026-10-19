/** Allowed next states for every state. A state with no targets is terminal. */
export type TransitionTable<TState extends string> = { readonly [K in TState]: readonly TState[] };

/**
 * Minimal, dependency-free finite state machine over string states.
 * Designed for persisted status value objects: it is stateless and
 * validates transitions between a current value and a requested next value.
 */
export class StateMachine<TState extends string> {
  constructor(
    /** Human-readable subject used in error messages, e.g. "app build". */
    readonly subject: string,
    private readonly table: TransitionTable<TState>,
  ) {}

  get states(): TState[] {
    return Object.keys(this.table) as TState[];
  }

  targets(from: TState): readonly TState[] {
    return this.table[from];
  }

  can(from: TState, to: TState): boolean {
    return this.table[from].includes(to);
  }

  isTerminal(state: TState): boolean {
    return this.table[state].length === 0;
  }

  /** The caller supplies its domain error, keeping this utility independent of @app/domain. */
  assert(from: TState, to: TState, onInvalid: () => Error): void {
    if (!this.can(from, to)) throw onInvalid();
  }
}

export function defineStateMachine<TState extends string>(subject: string, table: TransitionTable<TState>): StateMachine<TState> {
  return new StateMachine(subject, table);
}
