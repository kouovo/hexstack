import type { TodoStatusValue } from "@app/domain";

export interface ITodoDTO {
  id: string;
  title: string;
  status: TodoStatusValue;
  completedAt: string | null;
  completionNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
