export interface ISpecVisitor {
  and(left: ISpecification, right: ISpecification): this;
  or(left: ISpecification, right: ISpecification): this;
  not(spec: ISpecification): this;
  clone(): this;
}

export interface ISpecification<T = unknown, V extends ISpecVisitor = ISpecVisitor> {
  isSatisfiedBy(t: T): boolean;
  mutate(t: T): T;
  accept(v: V): void;
}

export abstract class Specification<T = unknown, V extends ISpecVisitor = ISpecVisitor> implements ISpecification<T, V> {
  abstract isSatisfiedBy(t: T): boolean;
  abstract mutate(t: T): T;
  abstract accept(v: V): void;

  public and(s: ISpecification<T, V>): Specification<T, V> {
    return new And(this, s);
  }

  public or(s: ISpecification<T, V>): Specification<T, V> {
    return new Or(this, s);
  }

  public not(): Not<T, V> {
    return new Not(this);
  }
}

export { Specification as CompositeSpecification };

class And<T, V extends ISpecVisitor> extends Specification<T, V> {
  constructor(
    private readonly left: ISpecification<T, V>,
    private readonly right: ISpecification<T, V>,
  ) {
    super();
  }

  isSatisfiedBy(t: T): boolean {
    return this.left.isSatisfiedBy(t) && this.right.isSatisfiedBy(t);
  }

  mutate(t: T): T {
    return this.right.mutate(this.left.mutate(t));
  }

  accept(v: V): void {
    v.and(this.left, this.right);
  }
}

class Or<T, V extends ISpecVisitor> extends Specification<T, V> {
  constructor(
    private readonly left: ISpecification<T, V>,
    private readonly right: ISpecification<T, V>,
  ) {
    super();
  }

  isSatisfiedBy(t: T): boolean {
    return this.left.isSatisfiedBy(t) || this.right.isSatisfiedBy(t);
  }

  mutate(t: T): T {
    try {
      return this.left.mutate(t);
    } catch {
      return this.right.mutate(t);
    }
  }

  accept(v: V): void {
    v.or(this.left, this.right);
  }
}

export class Not<T, V extends ISpecVisitor> extends Specification<T, V> {
  constructor(public readonly spec: ISpecification<T, V>) {
    super();
  }

  isSatisfiedBy(t: T): boolean {
    return !this.spec.isSatisfiedBy(t);
  }

  mutate(): T {
    throw new Error("[Not.mutate] Method not implemented.");
  }

  accept(v: V): void {
    v.not(this.spec);
  }
}

export const and = <T, V extends ISpecVisitor>(...specs: Specification<T, V>[]): Specification<T, V> | undefined => {
  const [first, ...rest] = specs;

  if (!first) return undefined;

  let s = first;
  for (const spec of rest) {
    s = s.and(spec);
  }

  return s;
};

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

export const andDefined = <T, V extends ISpecVisitor>(
  ...specs: Array<Specification<T, V> | undefined>
): Specification<T, V> | undefined => {
  return and(...specs.filter(isDefined));
};

export const or = <T, V extends ISpecVisitor>(...specs: Specification<T, V>[]): Specification<T, V> | undefined => {
  const [first, ...rest] = specs;

  if (!first) return undefined;

  let s = first;
  for (const spec of rest) {
    s = s.or(spec);
  }

  return s;
};

export const orDefined = <T, V extends ISpecVisitor>(...specs: Array<Specification<T, V> | undefined>): Specification<T, V> | undefined => {
  return or(...specs.filter(isDefined));
};

export class SpecificationBuilder<T, V extends ISpecVisitor> {
  private readonly specs: Specification<T, V>[] = [];

  add<Input, Value>(
    input: Input | undefined,
    createValue: (input: Input) => Value,
    createSpec: new (value: Value) => Specification<T, V>,
  ): this {
    if (input === undefined) return this;

    const value = createValue(input);
    this.specs.push(new createSpec(value));
    return this;
  }

  addValue<Value>(input: Value | undefined, createSpec: new (value: Value) => Specification<T, V>): this {
    if (input === undefined) return this;

    this.specs.push(new createSpec(input));
    return this;
  }

  build(): Specification<T, V> | undefined {
    return and(...this.specs);
  }

  required(emptyError: Error): Specification<T, V> {
    const spec = this.build();
    if (!spec) throw emptyError;

    return spec;
  }
}

export const specificationBuilder = <T, V extends ISpecVisitor>(): SpecificationBuilder<T, V> => {
  return new SpecificationBuilder<T, V>();
};
