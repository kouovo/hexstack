import { describe, expect, test } from "vitest";

import { TodoStatus } from "../todo-status.value-object";
import { TodoTitle } from "../todo-title.value-object";
import { TodoEntity } from "../todo.entity";
import { TodoIdSpecification } from "./todo-id.specification";
import { TodoStatusSpecification } from "./todo-status.specification";
import { TodoTitleSpecification } from "./todo-title.specification";

const open = TodoEntity.create(new TodoTitleSpecification(TodoTitle.create("open")));
const done = TodoEntity.create(new TodoTitleSpecification(TodoTitle.create("done")));
done.complete();

describe("todo specifications (in-memory evaluation)", () => {
  test("id and status specs", () => {
    expect(new TodoIdSpecification(open.id).isSatisfiedBy(open)).toBe(true);
    expect(new TodoIdSpecification(open.id).isSatisfiedBy(done)).toBe(false);
    expect(new TodoStatusSpecification(TodoStatus.create("completed")).isSatisfiedBy(done)).toBe(true);
  });

  test("specs compose with and / or / not", () => {
    const isOpen = new TodoStatusSpecification(TodoStatus.open());
    const isDone = new TodoIdSpecification(done.id);
    expect(isOpen.or(isDone).isSatisfiedBy(done)).toBe(true);
    expect(isOpen.and(isDone).isSatisfiedBy(done)).toBe(false);
    expect(isOpen.not().isSatisfiedBy(done)).toBe(true);
  });

  test("specs build a new todo; the result satisfies the spec it was built from", () => {
    const spec = new TodoTitleSpecification(TodoTitle.create("built")).and(new TodoIdSpecification(open.id));
    const todo = TodoEntity.create(spec);
    expect(todo.title.value).toBe("built");
    expect(todo.id.equals(open.id)).toBe(true);
    expect(todo.status.value).toBe("open");
    expect(spec.isSatisfiedBy(todo)).toBe(true);
  });
});
