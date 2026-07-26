/**
 * Genera un identificador único para PKs (requisito local-first: la PK se genera
 * en el cliente, no en el servidor). Usa UUID v4 nativo. En Fase 2, al integrar
 * PowerSync, se puede migrar a UUID v7 (ordenable por tiempo) sin tocar llamadas.
 */
export function newId(): string {
  return crypto.randomUUID();
}

/** Timestamp ISO 8601 en UTC, usado para created_at/updated_at/deleted_at. */
export function now(): string {
  return new Date().toISOString();
}
