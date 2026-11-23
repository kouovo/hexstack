import { customAlphabet } from "nanoid";

export const VALID_DATA_ATTR_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-._:";
const ENTITY_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_-";
/** 16 chars ≈ 38^16; birthday collision stays negligible past 10M records. 7 chars collided around 300k. */
export const ENTITY_ID_SUFFIX_LENGTH = 16;
const generateCustomId = customAlphabet(ENTITY_ID_CHARS, ENTITY_ID_SUFFIX_LENGTH);

export function generateId(prefix: string): string {
  let suffix = generateCustomId();
  // Keep IDs usable as Kubernetes label values / DNS-ish names: they must end
  // with an alphanumeric character. The suffix alphabet includes '-' and '_'.
  while (!/[a-z0-9]$/.test(suffix)) {
    suffix = generateCustomId();
  }
  return `${prefix}${suffix}`;
}
