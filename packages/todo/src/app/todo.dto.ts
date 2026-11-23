import type { TodoStatusValue } from "../domain/todo/todo-status.value-object";

export interface ITodoDTO {
  id: string;
  title: string;
  status: TodoStatusValue;
  completedAt: string | null;
  completionNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
