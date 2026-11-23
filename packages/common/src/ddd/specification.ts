export interface ISpecVisitor {
  and(left: ISpecification, right: ISpecification): this;
  or(left: ISpecification, right: ISpecification): this;
  not(spec: ISpecification): this;
  clone(): this;
}

/**
 * T: the entity it matches. V: the visitor that translates it (e.g. to SQL).
 * S: the state it can build; `create` writes this spec's value onto S (see the entity factories).
 */
export interface ISpecification<T = unknown, V extends ISpecVisitor = ISpecVisitor, S = unknown> {
  isSatisfiedBy(t: T): boolean;
  create(state: S): S;
  accept(v: V): void;
}

export abstract class Specification<T = unknown, V extends ISpecVisitor = ISpecVisitor, S = unknown> implements ISpecification<T, V, S> {
  abstract isSatisfiedBy(t: T): boolean;
  abstract accept(v: V): void;

  /** Specs that take part in creation override this; the rest leave the state unchanged. */
  create(state: S): S {
    return state;
  }

  public and(s: ISpecification<T, V, S>): Specification<T, V, S> {
    return new And(this, s);
  }

  public or(s: ISpecification<T, V, S>): Specification<T, V, S> {
    return new Or(this, s);
  }

  public not(): Not<T, V, S> {
    return new Not(this);
  }
}

export { Specification as CompositeSpecification };

class And<T, V extends ISpecVisitor, S> extends Specification<T, V, S> {
  constructor(
    private readonly left: ISpecification<T, V, S>,
    private readonly right: ISpecification<T, V, S>,
  ) {
    super();
  }

  isSatisfiedBy(t: T): boolean {
    return this.left.isSatisfiedBy(t) && this.right.isSatisfiedBy(t);
  }

  override create(state: S): S {
    return this.right.create(this.left.create(state));
  }

  accept(v: V): void {
    v.and(this.left, this.right);
  }
}

class Or<T, V extends ISpecVisitor, S> extends Specification<T, V, S> {
  constructor(
    private readonly left: ISpecification<T, V, S>,
    private readonly right: ISpecification<T, V, S>,
  ) {
    super();
  }

  isSatisfiedBy(t: T): boolean {
    return this.left.isSatisfiedBy(t) || this.right.isSatisfiedBy(t);
  }

  accept(v: V): void {
    v.or(this.left, this.right);
  }
}

export class Not<T, V extends ISpecVisitor, S> extends Specification<T, V, S> {
  constructor(public readonly spec: ISpecification<T, V, S>) {
    super();
  }

  isSatisfiedBy(t: T): boolean {
    return !this.spec.isSatisfiedBy(t);
  }

  accept(v: V): void {
    v.not(this.spec);
  }
}

export const and = <T, V extends ISpecVisitor, S>(...specs: Specification<T, V, S>[]): Specification<T, V, S> | undefined => {
  const [first, ...rest] = specs;

  if (!first) return undefined;

  let s = first;
  for (const spec of rest) {
    s = s.and(spec);
  }

  return s;
};

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

export const andDefined = <T, V extends ISpecVisitor, S>(
  ...specs: Array<Specification<T, V, S> | undefined>
): Specification<T, V, S> | undefined => {
  return and(...specs.filter(isDefined));
};

export const or = <T, V extends ISpecVisitor, S>(...specs: Specification<T, V, S>[]): Specification<T, V, S> | undefined => {
  const [first, ...rest] = specs;

  if (!first) return undefined;

  let s = first;
  for (const spec of rest) {
    s = s.or(spec);
  }

  return s;
};

export const orDefined = <T, V extends ISpecVisitor, S>(
  ...specs: Array<Specification<T, V, S> | undefined>
): Specification<T, V, S> | undefined => {
  return or(...specs.filter(isDefined));
};

export class SpecificationBuilder<T, V extends ISpecVisitor, S = unknown> {
  private readonly specs: Specification<T, V, S>[] = [];

  add<Input, Value>(
    input: Input | undefined,
    createValue: (input: Input) => Value,
    createSpec: new (value: Value) => Specification<T, V, S>,
  ): this {
    if (input === undefined) return this;

    const value = createValue(input);
    this.specs.push(new createSpec(value));
    return this;
  }

  addValue<Value>(input: Value | undefined, createSpec: new (value: Value) => Specification<T, V, S>): this {
    if (input === undefined) return this;

    this.specs.push(new createSpec(input));
    return this;
  }

  build(): Specification<T, V, S> | undefined {
    return and(...this.specs);
  }

  required(emptyError: Error): Specification<T, V, S> {
    const spec = this.build();
    if (!spec) throw emptyError;

    return spec;
  }
}

export const specificationBuilder = <T, V extends ISpecVisitor, S = unknown>(): SpecificationBuilder<T, V, S> => {
  return new SpecificationBuilder<T, V, S>();
};
