import type { UserValidationError } from "@app/domain";

import type { PublicErrorMap } from "./types";

// Sign-up failures (including EmailAlreadyRegisteredError) are projected by the auth boundary.
export const USER_PUBLIC_ERRORS = {
  UserIdRequiredError: (error) => ({ _tag: error._tag, message: "User ID is required." }),
  UserEmailInvalidError: (error) => ({ _tag: error._tag, message: "Enter a valid email address." }),
  UserRoleInvalidError: (error) => ({ _tag: error._tag, message: "Choose a supported user role." }),
} satisfies PublicErrorMap<UserValidationError>;
