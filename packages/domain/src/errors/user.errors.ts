import { DomainError } from "@app/core";

export class UserIdRequiredError extends DomainError<"UserIdRequiredError"> {
  readonly _tag = "UserIdRequiredError";
  readonly kind = "validation";
  readonly field = "userId";
  constructor() {
    super("User ID is required");
  }
}

export class UserEmailInvalidError extends DomainError<"UserEmailInvalidError"> {
  readonly _tag = "UserEmailInvalidError";
  readonly kind = "validation";
  readonly rule = "valid-email";
  constructor() {
    super("Email address is invalid");
  }
}

export class UserRoleInvalidError extends DomainError<"UserRoleInvalidError"> {
  readonly _tag = "UserRoleInvalidError";
  readonly kind = "validation";
  constructor(readonly role: string) {
    super(`Unknown role "${role}"`);
  }
}

/** A hasher/rehydration invariant, not public input. Never retain the supplied hash or plaintext. */
export class PasswordHashInvalidError extends DomainError<"PasswordHashInvalidError"> {
  readonly _tag = "PasswordHashInvalidError";
  readonly kind = "internal";
  readonly format = "PHC";
  constructor() {
    super("Password hash must be a PHC string");
  }
}

export type UserValidationError = UserIdRequiredError | UserEmailInvalidError | UserRoleInvalidError;

export class EmailAlreadyRegisteredError extends DomainError<"EmailAlreadyRegisteredError"> {
  readonly _tag = "EmailAlreadyRegisteredError";
  readonly kind = "conflict";
  readonly detectedBy: "lookup" | "unique-constraint";
  constructor(args: { detectedBy: "lookup" | "unique-constraint"; cause?: unknown }) {
    super(`Sign-up rejected: the email is already registered (detected by ${args.detectedBy}). No account, session or event was created.`, {
      cause: args.cause,
    });
    this.detectedBy = args.detectedBy;
  }
}

export type UserError = EmailAlreadyRegisteredError | UserValidationError;

export class PasswordPolicyViolationError extends DomainError<"PasswordPolicyViolationError"> {
  readonly _tag = "PasswordPolicyViolationError";
  readonly kind = "invalid-input";
  readonly rule: string;

  constructor(args: { rule: string }) {
    super(`New password rejected by the domain password policy: ${args.rule}. Nothing was hashed or stored.`);
    this.rule = args.rule;
  }
}
