import type { StorageError } from "@app/domain";

import type { PublicErrorMap } from "./types";

export const STORAGE_PUBLIC_ERRORS = {
  ObjectKeyInvalidError: (error) => ({ _tag: error._tag, message: "Choose a valid relative object key." }),
  ObjectContentTypeInvalidError: (error) => ({ _tag: error._tag, message: "Provide a valid media type." }),
  ObjectMetadataInvalidError: (error) => ({
    _tag: error._tag,
    message: "Object metadata contains an invalid entry or exceeds 8 KiB.",
  }),
  SignedObjectUrlMethodInvalidError: (error) => ({ _tag: error._tag, message: "Signed URL method must be GET or PUT." }),
  SignedObjectUrlExpiryInvalidError: (error) => ({
    _tag: error._tag,
    message: "Signed URL expiry must be an integer within 1..3600 seconds.",
  }),
} satisfies PublicErrorMap<StorageError>;
