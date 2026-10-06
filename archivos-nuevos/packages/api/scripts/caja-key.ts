import { randomBytes } from "node:crypto";
import { obtenerClienteDb } from "../src/services/db.js";
import { hashLlaveCaja } from "../src/plugins/auth.js";

const USO = `Uso:
  pnpm --filter @sfr/api caja-key emitir "<nombre de la caja>"
  pnpm --filter @sfr/api caja-key listar
  pnpm --filter @sfr/api caja-key revocar <id>`;

async function main(): Promise<void> {
  const [accion, argumento] = process.argv.slice(2);
  const db = obtenerClienteDb();

  if (accion === "emitir" && argumento) {
    const llave = randomBytes(32).toString("base64url");
    const { data, error } = await db
      .from("caja_api_key")
      .insert({ nombre: argumento, llave_hash: hashLlaveCaja(llave) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    console.log(`Caja "${argumento}" (id ${data.id}).`);
    console.log("Llave (se muestra UNA sola vez; pégala en Configuración de esa caja):");
    console.log(llave);
    return;
  }
  if (accion === "listar") {
    const { data, error } = await db
      .from("caja_api_key")
      .select("id, nombre, created_at, revocada_at")
      .order("created_at");
    if (error) throw new Error(error.message);
    console.table(data);
    return;
  }
  if (accion === "revocar" && argumento) {
    const { error } = await db
      .from("caja_api_key")
      .update({ revocada_at: new Date().toISOString() })
      .eq("id", argumento);
    if (error) throw new Error(error.message);
    console.log(`Llave ${argumento} revocada.`);
    return;
  }
  console.log(USO);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
