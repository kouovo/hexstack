import type { CompositeSpecification, ISpecification, ISpecVisitor } from "@app/core";
import type { Expression, ExpressionBuilder, SqlBool } from "kysely";

export abstract class QueryVisitor<T, DB extends object = Record<string, unknown>, TB extends keyof DB = keyof DB> {
  constructor(protected readonly eb: ExpressionBuilder<DB, TB>) {}

  isNot = false;
  setIsNot(isNot: boolean) {
    this.isNot = isNot;
  }

  $where(spec: CompositeSpecification<T, ISpecVisitor> | undefined) {
    if (spec) {
      spec.accept(this);
    }

    return this.cond;
  }
  conds: Expression<SqlBool>[] = [];
  protected addCond(cond: Expression<SqlBool>): void {
    if (this.isNot) {
      this.conds.push(this.eb.not(cond));
    } else {
      this.conds.push(cond);
    }
  }
  get cond(): Expression<SqlBool> {
    const conds = this.conds;
    if (!conds.length) {
      return this.eb.and([]);
    }

    if (conds.length === 1) {
      const [cond] = conds;
      if (cond) {
        return this.isNot ? this.eb.not(cond) : cond;
      }
    }

    const cond = this.eb.and(conds);
    if (this.isNot) {
      return this.eb.not(cond);
    }

    return cond;
  }

  exec(spec: ISpecification<T, ISpecVisitor> | undefined) {
    if (spec) {
      spec.accept(this);
    }

    return this.cond;
  }

  and(left: ISpecification<T, ISpecVisitor>, right: ISpecification<T, ISpecVisitor>): this {
    const lv = this.clone();
    left.accept(lv);

    const rv = this.clone();
    right.accept(rv);

    const cond = this.eb.and([lv.cond, rv.cond]);
    this.addCond(cond);

    return this;
  }

  or(left: ISpecification<T, ISpecVisitor>, right: ISpecification<T, ISpecVisitor>): this {
    const lv = this.clone();
    left.accept(lv);

    const rv = this.clone();
    right.accept(rv);

    const cond = this.eb.or([lv.cond, rv.cond]);
    this.addCond(cond);

    return this;
  }

  not(spec: ISpecification<T, ISpecVisitor>): this {
    const v = this.clone();
    v.setIsNot(true);

    spec.accept(v);

    v.setIsNot(false);
    this.addCond(v.cond);

    return this;
  }

  clone(): this {
    return this;
  }
}
