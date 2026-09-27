import Fastify from "fastify";
import cors from "@fastify/cors";
import { cargarConfig } from "./config.js";
import { registrarAuth, dependenciasAuthDesdeConfig, exigirPermisoFiscal } from "./plugins/auth.js";
import { rutaSalud } from "./routes/health.js";
import { rutaFiscal } from "./routes/fiscal.js";
import { rutaChatbot } from "./routes/chatbot.js";
import { rutaTransferencias } from "./routes/transferencias.js";
import { iniciarPollerTransferencias } from "./jobs/poller-transferencias.js";
import { iniciarModuloFiscal } from "./fiscal/iniciar.js";
import { rutasRecepcion } from "./routes/recepcion.js";
import { rutaRecibidos } from "./routes/recibidos.js";
import { crearServicioRecibidos } from "./fiscal/servicio-recibidos.js";
import { crearClienteContribuyente } from "./fiscal/entrega.js";
import { crearAlmacenSupabase } from "./fiscal/recepcion/almacen.js";
import { crearAutenticadorReceptor } from "./fiscal/recepcion/autenticacion.js";
import { dbDisponible, obtenerClienteDb } from "./services/db.js";

/**
 * Backend del modo multi-caja/multiusuario (§ Flujo de datos y modos).
 * En modo 100% local (default) esto ni siquiera corre: el cliente habla
 * directo con SQLite. Ver README.md de este paquete — es un scaffold, no
 * está conectado a Supabase/PowerSync todavía.
 */
const config = cargarConfig();
const moduloFiscal = iniciarModuloFiscal(config);
// 10 MB: el límite por defecto de Fastify (1 MB) rechaza las fotos de
// comprobantes en base64 que envía el chatbot con visión.
const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024, routerOptions: { caseSensitive: false } });

await app.register(cors, { origin: true });
// `/health` vive FUERA del contexto protegido: tiene que "responder siempre" para servir de
// chequeo de conectividad, sin importar si hay token o no. El orden de las líneas no alcanza para
// lograr esto — Fastify resuelve los hooks por jerarquía de `.register()`, no por orden en el
// archivo — así que el hook de auth se agrega dentro de un child context propio (`protegido`), y
// `rutaSalud`, registrada como hermana sobre `app` y no como su hija, queda afuera.
await app.register(rutaSalud);
await app.register(
  rutasRecepcion({
    receptor: moduloFiscal.disponible ? { rncPropio: moduloFiscal.rncEmisor, firmar: moduloFiscal.firmar } : null,
    almacen: dbDisponible() ? crearAlmacenSupabase(obtenerClienteDb()) : null,
    autenticador: crearAutenticadorReceptor(),
  }),
);
await app.register(async (protegido) => {
  registrarAuth(protegido, dependenciasAuthDesdeConfig(config));
  await protegido.register(async (fiscal) => {
    fiscal.addHook("onRequest", exigirPermisoFiscal);
    await fiscal.register(rutaFiscal(moduloFiscal));
    await fiscal.register(
      rutaRecibidos(
        moduloFiscal.disponible && dbDisponible()
          ? crearServicioRecibidos({
              rncPropio: moduloFiscal.rncEmisor,
              almacen: crearAlmacenSupabase(obtenerClienteDb()),
              firmar: moduloFiscal.firmar,
              dgii: moduloFiscal.dgii,
              contribuyente: crearClienteContribuyente({ firmar: moduloFiscal.firmar }),
            })
          : null,
      ),
    );
  });
  await protegido.register(rutaChatbot);
  await protegido.register(rutaTransferencias);
});

await app.listen({ port: config.puerto, host: "0.0.0.0" });

iniciarPollerTransferencias(app, config.transferenciasPollIntervaloMs);

if (moduloFiscal.disponible) {
  app.log.info(`Facturación electrónica activa (DGII ${moduloFiscal.ambiente}).`);
} else {
  app.log.warn(`Facturación electrónica inactiva: ${moduloFiscal.motivo}`);
}

if (!config.supabaseConfigurado) {
  app.log.warn(
    "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY no configurados: todas las solicitudes se autentican " +
      "como usuario de desarrollo. No usar así en producción.",
  );
}
