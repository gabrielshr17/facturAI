import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import type { AlmacenRecepcion } from "../fiscal/recepcion/almacen.js";
import type { AutenticadorReceptor } from "../fiscal/recepcion/autenticacion.js";
import { construirXmlArecf, type MotivoNoRecibido } from "../fiscal/xml/arecf.js";
import { leerAprobacionComercial, leerEcfRecibido, verificarDocumentoFirmado } from "../fiscal/verificacion.js";

export interface ReceptorFiscal {
  rncPropio: string;
  firmar: (xml: string) => string;
}

export interface DependenciasRecepcion {
  /** null cuando no hay certificado: sin él no se puede firmar el acuse de recibo. */
  receptor: ReceptorFiscal | null;
  /** null sin Postgres configurado: no hay dónde guardar lo recibido. */
  almacen: AlmacenRecepcion | null;
  autenticador: AutenticadorReceptor;
  reloj?: () => Date;
}

const LIMITE_ARCHIVO_BYTES = 5 * 1024 * 1024;

async function leerXml(request: FastifyRequest): Promise<string | null> {
  if (request.isMultipart()) {
    const archivo = await request.file();
    if (!archivo) return null;
    return (await archivo.toBuffer()).toString("utf8");
  }
  return typeof request.body === "string" ? request.body : null;
}

/**
 * Servicios que la DGII exige a todo emisor electrónico en su rol de receptor
 * (Descripción Técnica Emisores Electrónicos, "Estándar como Receptor Electrónico").
 * Van FUERA del contexto protegido: los llaman la DGII y otros contribuyentes, que no tienen
 * nuestras credenciales. La autenticación propia (semilla/token) es opcional en el estándar:
 * si llega un token se exige que sea válido; si no llega, se acepta el envío.
 */
export function rutasRecepcion(deps: DependenciasRecepcion): FastifyPluginAsync {
  const reloj = deps.reloj ?? (() => new Date());

  return async (app) => {
    await app.register(multipart, { limits: { fileSize: LIMITE_ARCHIVO_BYTES, files: 1 } });
    app.addContentTypeParser(["text/xml", "application/xml"], { parseAs: "string" }, (_req, cuerpo, listo) =>
      listo(null, cuerpo),
    );

    async function tokenAceptable(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
      const auth = request.headers.authorization;
      if (!auth) return true;
      const token = auth.replace(/^bearer\s+/i, "");
      if (deps.autenticador.tokenValido(token)) return true;
      await reply.code(401).send({ error: "Token inválido o expirado." });
      return false;
    }

    async function exigirReceptor(
      reply: FastifyReply,
    ): Promise<{ receptor: ReceptorFiscal; almacen: AlmacenRecepcion } | null> {
      if (deps.receptor && deps.almacen) return { receptor: deps.receptor, almacen: deps.almacen };
      const falta = deps.receptor ? "la base de datos" : "el certificado digital";
      await reply.code(503).send({ error: `Servicio de recepción no disponible: falta ${falta}.` });
      return null;
    }

    app.get("/fe/autenticacion/api/semilla", async (_request, reply) => {
      await reply.type("application/xml").send(deps.autenticador.emitirSemilla());
    });

    app.post("/fe/autenticacion/api/validacioncertificado", async (request, reply) => {
      const xml = await leerXml(request);
      const token = xml ? deps.autenticador.validarSemillaFirmada(xml) : null;
      if (!token) {
        await reply.code(400).send({ error: "Semilla inválida, vencida, ya usada o mal firmada." });
        return;
      }
      return token;
    });

    app.post("/fe/recepcion/api/ecf", async (request, reply) => {
      if (!(await tokenAceptable(request, reply))) return;
      const disponible = await exigirReceptor(reply);
      if (!disponible) return;
      const { receptor, almacen } = disponible;

      const xml = await leerXml(request);
      const ecf = xml ? leerEcfRecibido(xml) : null;
      if (!xml || !ecf) {
        await reply.code(400).send({ error: "El archivo no es un e-CF válido." });
        return;
      }

      let motivo: MotivoNoRecibido | undefined;
      const verificacion = verificarDocumentoFirmado(xml, ecf.rncEmisor);
      if (!verificacion.valido) motivo = verificacion.motivo === "especificacion" ? 1 : 2;
      else if (ecf.rncComprador !== receptor.rncPropio) motivo = 4;

      const acuse = (recibido: boolean, m?: MotivoNoRecibido) =>
        receptor.firmar(
          construirXmlArecf(
            {
              rncEmisor: ecf.rncEmisor,
              rncComprador: ecf.rncComprador ?? receptor.rncPropio,
              encf: ecf.encf,
              recibido,
              motivo: m,
            },
            reloj(),
          ),
        );

      if (!motivo) {
        const acuseXml = acuse(true);
        try {
          const resultado = await almacen.guardarEcf({ ...ecf, xml, acuseXml });
          if (resultado === "nuevo") {
            await reply.type("application/xml").send(acuseXml);
            return;
          }
          motivo = 3;
        } catch (error) {
          request.log.error(error, "No se pudo guardar un e-CF recibido");
          await reply.code(500).send({ error: "No se pudo registrar el e-CF. Reintente." });
          return;
        }
      }

      request.log.warn({ encf: ecf.encf, rncEmisor: ecf.rncEmisor, motivo }, "e-CF recibido no aceptado");
      await reply.type("application/xml").send(acuse(false, motivo));
    });

    app.post("/fe/aprobacioncomercial/api/ecf", async (request, reply) => {
      if (!(await tokenAceptable(request, reply))) return;
      const disponible = await exigirReceptor(reply);
      if (!disponible) return;
      const { receptor, almacen } = disponible;

      const xml = await leerXml(request);
      const aprobacion = xml ? leerAprobacionComercial(xml) : null;
      if (!xml || !aprobacion) {
        await reply.code(400).send({ error: "El archivo no es una aprobación comercial válida." });
        return;
      }
      if (aprobacion.rncEmisor !== receptor.rncPropio) {
        await reply.code(400).send({ error: "La aprobación corresponde a un e-CF de otro emisor." });
        return;
      }
      const verificacion = verificarDocumentoFirmado(xml, aprobacion.rncComprador);
      if (!verificacion.valido) {
        await reply.code(400).send({ error: verificacion.detalle });
        return;
      }
      try {
        await almacen.guardarAprobacion({ ...aprobacion, xml });
      } catch (error) {
        request.log.error(error, "No se pudo guardar una aprobación comercial");
        await reply.code(500).send({ error: "No se pudo registrar la aprobación comercial. Reintente." });
        return;
      }
      return { mensaje: "Aprobación comercial recibida." };
    });
  };
}
