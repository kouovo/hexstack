import { describe, expect, test } from "vitest";

import { TodoStatus } from "../todo-status.value-object";
import { TodoTitle } from "../todo-title.value-object";
import { TodoEntity } from "../todo.entity";
import { TodoIdSpecification } from "./todo-id.specification";
import { TodoStatusSpecification } from "./todo-status.specification";

const open = TodoEntity.create({ title: TodoTitle.create("open") });
const done = TodoEntity.create({ title: TodoTitle.create("done") });
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
});
