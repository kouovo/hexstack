import { Specification } from "@app/core";

import type { TodoEntity } from "../todo.entity";
import type { ITodoSpecVisitor } from "../todo.type";

export abstract class TodoSpecification extends Specification<TodoEntity, ITodoSpecVisitor> {}
