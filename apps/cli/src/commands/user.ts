import { AssignRoleCommand, type IUserDTO, type IUserRepository, USER_REPO } from "@app/application";
import { CommandBus } from "@app/cqrs";
import { NotFoundException } from "@app/domain";
import { UserEmail, UserEmailSpecification, UserRole } from "@app/domain";
import { Command, Option } from "clipanion";

import { AppCommand } from "../base-command";

/**
 * Trusted operator entry point, not a network endpoint. Use this to provision the first admin or recover
 * after demoting the last admin. Anyone able to run the CLI already has database/operator credentials.
 */
export class UserRoleCliCommand extends AppCommand {
  static override paths = [["user", "role"]];
  static override usage = Command.Usage({ description: "Assign a user's role (admin, member, viewer); requires operator access" });

  email = Option.String({ name: "email" });
  role = Option.String({ name: "role" });

  async execute(): Promise<number> {
    // Validate before bootstrapping dependencies or making any changes.
    const email = UserEmail.create(this.email);
    const role = UserRole.create(this.role);
    const users = await this.context.services.resolve<IUserRepository>(USER_REPO);
    const user = await users.findOne(new UserEmailSpecification(email));
    if (!user) throw new NotFoundException("No account with this email; sign up first");

    const bus = await this.context.services.resolve(CommandBus);
    const result = await bus.execute<AssignRoleCommand, IUserDTO>(new AssignRoleCommand({ userId: user.id.value, role: role.value }));
    this.write(result);
    return 0;
  }
}

export const userCliCommands = [UserRoleCliCommand];
