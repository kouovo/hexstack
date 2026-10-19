export abstract class ValueObject<TState> {
  protected constructor(protected readonly state: TState) {}

  protected snapshot(): unknown {
    return this.state;
  }

  equals(other: ValueObject<TState>): boolean {
    return JSON.stringify(this.snapshot()) === JSON.stringify(other.snapshot());
  }
}
