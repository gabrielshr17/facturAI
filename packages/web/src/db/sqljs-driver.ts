import initSqlJs, { type Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { SqlDriver } from "@sfr/core";

/**
 * Driver SqlDriver para el navegador basado en sql.js (SQLite compilado a WASM),
 * con persistencia en IndexedDB.
 *
 * Es el driver de la **PWA en modo local**. La base vive en memoria y se
 * serializa a IndexedDB tras cada escritura (a escala de MVP es suficiente).
 * En Fase 2, para multi-caja/offline robusto, se puede sustituir por wa-sqlite
 * sin tocar el resto de la app: implementa la misma interfaz `SqlDriver`.
 */

const IDB_NOMBRE = "sfr-db";
const IDB_STORE = "sqlite";
const IDB_KEY = "principal";

function abrirIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NOMBRE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cargarBytes(): Promise<Uint8Array | null> {
  const idb = await abrirIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as Uint8Array) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function guardarBytes(bytes: Uint8Array): Promise<void> {
  const idb = await abrirIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function crearSqlJsDriver(): Promise<SqlDriver> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });

  // Sin esto el navegador trata la base como caché descartable y puede borrarla cuando el
  // dispositivo anda escaso de espacio — en un teléfono eso es perder las ventas. Pedirlo es
  // best-effort (el navegador puede decir que no) y nunca debe impedir que la app arranque.
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Navegador sin la API o permiso denegado: se sigue igual, solo sin la garantía extra.
  }

  const previos = await cargarBytes();
  const db: Database = previos ? new SQL.Database(previos) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");

  // Persistencia diferida: agrupa escrituras seguidas en un solo guardado.
  let pendiente: ReturnType<typeof setTimeout> | null = null;
  const persistir = () => {
    if (pendiente) clearTimeout(pendiente);
    pendiente = setTimeout(() => {
      void guardarBytes(db.export());
      pendiente = null;
    }, 150);
  };

  /** Guarda YA lo que esté esperando el debounce, sin esperar los 150 ms. */
  const persistirAhora = () => {
    if (!pendiente) return;
    clearTimeout(pendiente);
    pendiente = null;
    void guardarBytes(db.export());
  };

  // En el teléfono la pestaña se puede congelar o matar en cualquier momento (cambio de app,
  // pantalla bloqueada) y ahí nunca llega a correr el timer del debounce: se perdería la última
  // escritura. `pagehide` y el paso a segundo plano son las únicas señales fiables en iOS —
  // `beforeunload` no dispara en móvil.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", persistirAhora);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persistirAhora();
    });
  }

  return {
    async exec(sql) {
      db.run(sql);
      persistir();
    },
    async run(sql, params = []) {
      db.run(sql, params as never[]);
      persistir();
    },
    async all<T>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params as never[]);
      const filas: T[] = [];
      while (stmt.step()) filas.push(stmt.getAsObject() as T);
      stmt.free();
      return filas;
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params as never[]);
      const fila = stmt.step() ? (stmt.getAsObject() as T) : undefined;
      stmt.free();
      return fila;
    },
    async close() {
      if (pendiente) clearTimeout(pendiente);
      await guardarBytes(db.export());
      db.close();
    },
  };
}
