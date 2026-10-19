/**
 * One mapper per aggregate, written as a plain object (no class, no DI):
 *
 * - `toEntity`: stored record -> domain entity (rehydrate)
 * - `toPersistence`: domain entity -> stored record
 * - `toResponse`: domain entity -> DTO returned to API callers
 */
export interface IMapper<Entity, Record, Response> {
  toEntity(record: Record): Entity;
  toPersistence(entity: Entity): Record;
  toResponse(entity: Entity): Response;
}
