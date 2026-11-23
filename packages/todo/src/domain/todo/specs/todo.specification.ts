import { Specification } from "@app/common/ddd";

import type { ITodoState, TodoEntity } from "../todo.entity";
import type { ITodoSpecVisitor } from "../todo.type";

export abstract class TodoSpecification extends Specification<TodoEntity, ITodoSpecVisitor, ITodoState> {}
