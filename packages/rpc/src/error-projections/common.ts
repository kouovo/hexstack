import type { CommonError } from "@app/domain";

import type { PublicErrorMap } from "./types";

export const COMMON_PUBLIC_ERRORS = {
  IdentifierRequiredError: (error) => ({ _tag: error._tag, message: "An identifier is required." }),
  StateTransitionNotAllowedError: (error) => ({ _tag: error._tag, message: "The requested state transition is not allowed." }),
  ConflictException: (error) => ({ _tag: error._tag, message: error.message }),
  UnauthorizedException: (error) => ({ _tag: error._tag, message: error.message }),
  ForbiddenException: (error) => ({ _tag: error._tag, message: error.message }),
  NotFoundException: (error) => ({ _tag: error._tag, message: error.message }),
  NotImplementException: (error) => ({ _tag: error._tag, message: error.message }),
  ResourceBusyException: (error) => ({ _tag: error._tag, message: error.message }),
  TooManyRequestsException: (error) => ({ _tag: error._tag, message: error.message }),
} satisfies PublicErrorMap<CommonError>;
