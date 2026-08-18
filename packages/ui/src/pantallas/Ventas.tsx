import { useEffect, useState, useCallback, useRef } from "react";
import {
  type Factura,
  type FacturaLinea,
  type Producto,
  type ProductoInput,
  type Cliente,
  type Negocio,
  type MetodoPago,
  ValidacionError,
  cobrarConFiscal,
  aplicarDescuento,
  pctGananciaDesdePrecio,
} from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { s, c, money, sombra } from "../estilos.js";
import { ModalCobro, type FiscalInput, type SalidaCobro } from "../componentes/ModalCobro.js";
import { ModalCotizacion } from "../componentes/ModalCotizacion.js";
import { FormularioProducto, diferenciasProducto, type CambioProducto } from "../componentes/FormularioProducto.js";
import { ModalConfirmarCambios } from "../componentes/ModalConfirmarCambios.js";
import { imprimirRecibo } from "../impresion/recibo.js";
import { generarPdfRecibo, generarPdfCotizacion, guardarPdf } from "../impresion/pdf.js";
import { abrirGavetaTermica } from "../impresion/termica.js";
import { BotonVoz } from "../componentes/BotonVoz.js";
import { ChatBot } from "../componentes/ChatBot.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { filtrarNumero } from "../utilidades/numero.js";
import type { CSSProperties } from "react";

const stepperBtn: CSSProperties = {
  ...s.botonSecundario,
  width: 28,
  height: 28,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  lineHeight: 1,
};

function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Recorta el ruido de punto flotante (ej. una cantidad calculada como monto/precio puede llegar como
 *  "3.3333333333333335") para mostrarla en pantalla, sin tocar el valor guardado en la línea. */
function formatearCantidad(n: number): string {
  return Number(n.toFixed(4)).toString();
}

/** Un paso de deshacer/rehacer (§ Ctrl+Z/Ctrl+Y) sobre las líneas del ticket. Cada acción visible del
 *  usuario (agregar, quitar, cambiar cantidad, alternar mayoreo) puede traducirse en uno o más de estos
 *  pasos atómicos — p.ej. alternar mayoreo con fusión es a la vez un "cantidad" en la línea existente y
 *  un "eliminar" en la línea vieja — y se deshacen/rehacen siempre juntos, como una sola unidad.
 *  "eliminar"/"crear" reusan el borrado LÓGICO de `factura_linea`: como la fila conserva sus datos
 *  originales, deshacer un borrado es simplemente restaurarla (mismo id, mismo precio/cantidad), sin
 *  tener que reconstruirla a mano. */
type AccionLinea =
  | { tipo: "cantidad"; lineaId: string; antes: number; despues: number }
  | { tipo: "crear"; lineaId: string }
  | { tipo: "eliminar"; lineaId: string };

/**
 * Pantalla de Ventas (§7.1): construye el ticket. El cobro (§7.2, con NCF
 * opcional §6) marca la factura `cobrada` (o `fiscal` si se emite comprobante).
 */
export function Ventas() {
  const {
    factura: repo,
    producto: productos,
    cliente: clientes,
    negocio: negocioRepo,
    secuenciaNcf,
    comprobanteFiscal,
    proveedorFiscal,
    promocion: promocionRepo,
    cotizacion: cotizacionRepo,
  } = useRepos();

  const [tickets, setTickets] = useState<Factura[]>([]);
  const [activoId, setActivoId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<FacturaLinea[]>([]);
  const [ahora, setAhora] = useState(new Date());

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [indiceResultado, setIndiceResultado] = useState(-1);
  // Escape esconde el desplegable de resultados sin perder la búsqueda escrita ni tocar `resultados`
  // — así se puede ver la lista del ticket debajo por un momento, y en cuanto se sigue escribiendo
  // (§ buscarProducto) el desplegable vuelve a aparecer solo.
  const [ocultarResultados, setOcultarResultados] = useState(false);
  const [esMayoreo, setEsMayoreo] = useState(false);
  const [modalCantidad, setModalCantidad] = useState<{ producto: Producto | null } | null>(null);
  const [busquedaModalCantidad, setBusquedaModalCantidad] = useState("");
  const [resultadosModalCantidad, setResultadosModalCantidad] = useState<Producto[]>([]);
  const [indiceResultadoModalCantidad, setIndiceResultadoModalCantidad] = useState(-1);
  const [cantidadModalTexto, setCantidadModalTexto] = useState("");
  const [montoModalTexto, setMontoModalTexto] = useState("");
  const [modalConsultaAbierto, setModalConsultaAbierto] = useState(false);
  const [busquedaConsulta, setBusquedaConsulta] = useState("");
  const [resultadosConsulta, setResultadosConsulta] = useState<Producto[]>([]);
  const [lineaEditandoId, setLineaEditandoId] = useState<string | null>(null);
  const [cantidadEditandoInput, setCantidadEditandoInput] = useState("");
  const [lineaResaltada, setLineaResaltada] = useState<FacturaLinea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoAplicada, setPromoAplicada] = useState<string | null>(null);

  // Deshacer/rehacer (Ctrl+Z/Ctrl+Y) de cambios en las líneas del ticket activo — § AccionLinea.
  const [pilaDeshacer, setPilaDeshacer] = useState<AccionLinea[][]>([]);
  const [pilaRehacer, setPilaRehacer] = useState<AccionLinea[][]>([]);

  const [editandoProducto, setEditandoProducto] = useState<Producto | null>(null);
  const [formEdicion, setFormEdicion] = useState<ProductoInput | null>(null);
  const [erroresEdicion, setErroresEdicion] = useState<string[]>([]);
  const [cambiosPendientesEdicion, setCambiosPendientesEdicion] = useState<CambioProducto[] | null>(null);

  const [clienteQ, setClienteQ] = useState("");
  const [clienteResultados, setClienteResultados] = useState<Cliente[]>([]);
  const [indiceResultadoCliente, setIndiceResultadoCliente] = useState(-1);
  const [clienteActivo, setClienteActivo] = useState<Cliente | null>(null);
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState("");

  const [mostrarSuelto, setMostrarSuelto] = useState(false);
  const [sueltoDesc, setSueltoDesc] = useState("");
  const [sueltoPrecio, setSueltoPrecio] = useState("");
  const [sueltoCantidad, setSueltoCantidad] = useState("1");
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [mostrarCotizacion, setMostrarCotizacion] = useState(false);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [reimprimiendo, setReimprimiendo] = useState(false);

  const activo = tickets.find((t) => t.id === activoId) ?? null;

  const busquedaRef = useRef<HTMLInputElement>(null);
  const enfocarBusqueda = useCallback(() => busquedaRef.current?.focus(), []);

  useAtajosTeclado({
    F10: enfocarBusqueda,
    F12: () => { if (lineas.length > 0) setMostrarCobro(true); },
    F5: () => { if (lineas.length > 0) setMostrarCotizacion(true); },
    F6: () => void nuevoTicket(),
    F7: () => setMostrarSuelto((v) => !v),
    // Apuntando (con el mouse, sin hacer clic) a una línea del ticket: F8 alterna el precio
    // mayoreo de ESA línea. Si no hay ninguna resaltada, F8 vuelve a su otro significado: el
    // régimen por defecto para el próximo producto que se agregue.
    F8: () => { if (lineaResaltada) void alternarMayoreoLinea(lineaResaltada); else setEsMayoreo((v) => !v); },
    F9: () => abrirConsultaPrecio(),
    F11: () => abrirModalCantidad(),
    "Ctrl+P": () => { if (!reimprimiendo) void reimprimirUltimo(); },
    // Deshacer/rehacer de cambios en el ticket (agregar/quitar/cantidad/mayoreo, § AccionLinea).
    // Se registran ambos atajos de rehacer porque las dos convenciones son comunes en Windows:
    // Ctrl+Y (Office) y Ctrl+Shift+Z (navegadores, VS Code, la mayoría del software moderno).
    "Ctrl+Z": () => void deshacer(),
    "Ctrl+Y": () => void rehacer(),
    "Ctrl+Shift+Z": () => void rehacer(),
    // "+"/"-" solo se registran mientras hay una línea resaltada: si estuvieran siempre en el
    // mapa, el hook les haría preventDefault() en CUALQUIER campo de texto (aunque el manejador
    // no hiciera nada), y esos caracteres dejarían de poderse escribir en toda la pantalla.
    ...(lineaResaltada
      ? {
          "+": () => cambiarCantidad(lineaResaltada, 1),
          "-": () => cambiarCantidad(lineaResaltada, -1),
        }
      : {}),
  }, !mostrarCobro && !mostrarCotizacion && !modalCantidad && !modalConsultaAbierto && !formEdicion);

  useAtajosTeclado({
    Escape: () => cerrarConsultaPrecio(),
  }, modalConsultaAbierto);

  useAtajosTeclado({
    Escape: () => cerrarModalCantidad(),
  }, modalCantidad !== null);

  useAtajosTeclado({
    Escape: () => cerrarEdicionProducto(),
    "Ctrl+S": () => guardarEdicionProducto(),
  }, formEdicion !== null && cambiosPendientesEdicion === null);

  useAtajosTeclado({
    Escape: () => setCambiosPendientesEdicion(null),
    "Ctrl+S": () => void guardarEdicionProductoAhora(),
  }, cambiosPendientesEdicion !== null);

  // Escribir en cualquier parte de la pantalla de Ventas (sin haber hecho clic en la búsqueda
  // primero) arranca una búsqueda de productos — como el "type-ahead" de Gmail. Si el foco ya está
  // en OTRO campo de texto (cliente, notas, edición de cantidad, etc.) no se interfiere: esos
  // campos deben poder recibir su propio tecleo sin que salte a la búsqueda. "+"/"-" se excluyen
  // a propósito porque ya tienen su propio significado (cambiar cantidad de la línea resaltada).
  useEffect(() => {
    if (mostrarCobro || mostrarCotizacion || modalCantidad || modalConsultaAbierto || formEdicion) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1 || e.key === "+" || e.key === "-") return;
      const activo = document.activeElement;
      const enCampoDeTexto = activo instanceof HTMLInputElement || activo instanceof HTMLTextAreaElement || activo instanceof HTMLSelectElement;
      if (enCampoDeTexto) return;
      e.preventDefault();
      busquedaRef.current?.focus();
      buscarProducto(e.key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mostrarCobro, mostrarCotizacion, modalCantidad, modalConsultaAbierto, formEdicion]);

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  // No depende de `activoId`: usa forma funcional al fijarlo, así el repo no
  // cambia entre renders y el efecto de abajo puede correr una sola vez.
  const cargarTickets = useCallback(async () => {
    let abiertos = await repo.listarAbiertos();
    if (abiertos.length === 0) {
      await repo.abrirTicket();
      abiertos = await repo.listarAbiertos();
    }
    setTickets(abiertos);
    setActivoId((prev) => (abiertos.some((t) => t.id === prev) ? prev : abiertos[0]?.id ?? null));
  }, [repo]);

  // Guarda contra el doble-montaje de React StrictMode en desarrollo: sin este
  // guard, el efecto corre dos veces al montar y crea dos tickets abiertos.
  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    cargarTickets().catch((e) => setErrorCarga(String(e)));
  }, [cargarTickets]);

  // `Factura` solo trae `cliente_id` (§ core), así que las pestañas de tickets abiertos resuelven
  // el nombre del cliente aparte — igual que ya hacía `clienteActivo` para el ticket activo, pero
  // para todos los tickets abiertos a la vez, para poder nombrar cada pestaña.
  const [nombreClientePorTicket, setNombreClientePorTicket] = useState<Record<string, string>>({});
  useEffect(() => {
    const idsCliente = Array.from(new Set(tickets.map((t) => t.cliente_id).filter((id): id is string => !!id)));
    if (idsCliente.length === 0) {
      setNombreClientePorTicket({});
      return;
    }
    void (async () => {
      const pares = await Promise.all(
        idsCliente.map(async (id) => [id, await clientes.obtener(id)] as const),
      );
      const nombrePorClienteId = new Map(pares.map(([id, cl]) => [id, cl ? `${cl.nombre} ${cl.apellidos ?? ""}`.trim() : null]));
      const porTicket: Record<string, string> = {};
      for (const t of tickets) {
        const nombre = t.cliente_id ? nombrePorClienteId.get(t.cliente_id) : null;
        if (nombre) porTicket[t.id] = nombre;
      }
      setNombreClientePorTicket(porTicket);
    })();
  }, [tickets, clientes]);

  const cargarLineas = useCallback(async () => {
    if (!activoId) {
      setLineas([]);
      return [] as FacturaLinea[];
    }
    const ls = await repo.obtenerLineas(activoId);
    setLineas(ls);
    return ls;
  }, [repo, activoId]);

  useEffect(() => {
    setError(null);
    // Las pilas de deshacer/rehacer guardan ids de línea del ticket activo — se reinician al
    // cambiar de ticket para no arriesgarse a deshacer/rehacer algo en el ticket equivocado.
    setPilaDeshacer([]);
    setPilaRehacer([]);
    cargarLineas().catch((e) => setErrorCarga(String(e)));
  }, [activoId]);

  // Siempre hay una línea "resaltada" mientras el ticket tenga artículos — así F8/+/− (que actúan
  // sobre `lineaResaltada`) y las flechas arriba/abajo (§ onKeyDown de la búsqueda) siempre tienen
  // sobre qué línea trabajar, sin depender de que el mouse esté encima de una fila. Si la línea
  // resaltada ya no existe (se borró, o se cambió de ticket), cae a la primera de la lista.
  //
  // IMPORTANTE: hay que resincronizar con el objeto FRESCO de `lineas`, no quedarse con el viejo
  // aunque el id siga existiendo — si no, `cambiarCantidad` (+/−) sigue leyendo la cantidad de
  // ANTES del último cambio, y cada `+` de ahí en adelante recalcula el mismo valor ya guardado
  // en vez de sumar de nuevo (se "traba" después del primer +).
  useEffect(() => {
    setLineaResaltada((actual) => {
      if (lineas.length === 0) return null;
      const vigente = actual && lineas.find((l) => l.id === actual.id);
      return vigente || lineas[0];
    });
  }, [lineas]);

  useEffect(() => {
    void (async () => {
      if (activo?.cliente_id) setClienteActivo(await clientes.obtener(activo.cliente_id) ?? null);
      else setClienteActivo(null);
    })();
  }, [activo?.cliente_id]);

  useEffect(() => {
    void negocioRepo.obtener().then((n) => setNegocio(n ?? null));
  }, [negocioRepo]);

  async function refrescarTicketActivo() {
    const abiertos = await repo.listarAbiertos();
    setTickets(abiertos);
    return await cargarLineas();
  }

  /** Registra un paso de deshacer para la acción que se acaba de hacer (§ AccionLinea) y descarta
   *  cualquier "rehacer" pendiente — como en cualquier editor, hacer algo nuevo después de deshacer
   *  invalida el futuro que se había deshecho. */
  function registrarAccionTicket(pasos: AccionLinea[]) {
    setPilaDeshacer((p) => [...p, pasos]);
    setPilaRehacer([]);
  }

  async function deshacer() {
    const pasos = pilaDeshacer[pilaDeshacer.length - 1];
    if (!pasos) return;
    setError(null);
    try {
      for (const paso of [...pasos].reverse()) {
        if (paso.tipo === "cantidad") await repo.actualizarCantidadLinea(paso.lineaId, paso.antes);
        else if (paso.tipo === "crear") await repo.eliminarLinea(paso.lineaId);
        else await repo.restaurarLinea(paso.lineaId);
      }
      setPilaDeshacer((p) => p.slice(0, -1));
      setPilaRehacer((p) => [...p, pasos]);
      await refrescarTicketActivo();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  async function rehacer() {
    const pasos = pilaRehacer[pilaRehacer.length - 1];
    if (!pasos) return;
    setError(null);
    try {
      for (const paso of pasos) {
        if (paso.tipo === "cantidad") await repo.actualizarCantidadLinea(paso.lineaId, paso.despues);
        else if (paso.tipo === "crear") await repo.restaurarLinea(paso.lineaId);
        else await repo.eliminarLinea(paso.lineaId);
      }
      setPilaRehacer((p) => p.slice(0, -1));
      setPilaDeshacer((p) => [...p, pasos]);
      await refrescarTicketActivo();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  async function nuevoTicket() {
    const t = await repo.abrirTicket();
    setTickets((prev) => [...prev, t]);
    setActivoId(t.id);
  }

  async function eliminarTicketActivo() {
    if (!activoId) return;
    if (!confirm("¿Eliminar este ticket?")) return;
    await repo.eliminarTicket(activoId);
    setActivoId(null);
    await cargarTickets();
  }

  function buscarProducto(q: string) {
    setBusqueda(q);
    setOcultarResultados(false);
    setError(null);
  }

  /** Busca con un pequeño debounce (§ mismo motivo que la búsqueda de "Agregar cantidad"): sin esto,
   *  cada tecla que dispara un escáner de código de barra hace una consulta y abre el desplegable de
   *  resultados con el texto todavía a medio escribir, así que se ve un parpadeo del desplegable justo
   *  antes de que el Enter del escáner lo cierre de nuevo. Esperar a una pausa evita ese parpadeo sin
   *  afectar el escaneo en sí, que igual resuelve por código exacto al presionar Enter. */
  useEffect(() => {
    const q = busqueda;
    if (!q.trim()) {
      setResultados([]);
      setIndiceResultado(-1);
      return;
    }
    const id = setTimeout(() => {
      void productos.listar(q).then((res) => {
        setResultados(res);
        setIndiceResultado(res.length > 0 ? 0 : -1);
      });
    }, 250);
    return () => clearTimeout(id);
  }, [busqueda, productos]);

  /** Favorito: sube el producto al tope de la búsqueda (§ Productos). Se puede marcar/desmarcar
   *  directo desde la búsqueda de Ventas, sin salir del ticket que se está armando. */
  async function alternarFavoritoProducto(p: Producto) {
    const favorito = p.favorito === 1 ? 0 : 1;
    await productos.alternarFavorito(p.id, favorito === 1);
    setResultados((rs) => rs.map((r) => (r.id === p.id ? { ...r, favorito } : r)));
    setResultadosModalCantidad((rs) => rs.map((r) => (r.id === p.id ? { ...r, favorito } : r)));
  }

  async function agregarProducto(p: Producto, cantidad: number) {
    if (!activoId) return;
    setError(null);
    setPromoAplicada(null);
    const base = precioBase(p);
    try {
      const promo = await promocionRepo.obtenerAplicable(p.id, p.departamento_id, hoyIso());
      const precio = promo ? aplicarDescuento(base, promo) : base;
      if (promo) {
        setPromoAplicada(`Promoción aplicada: ${promo.nombre} (RD$ ${money(base)} → RD$ ${money(precio)})`);
      }
      // Si el mismo producto ya está en el ticket con el mismo precio (mismo
      // régimen mayoreo/promo), suma a esa línea en vez de crear una repetida.
      const existente = lineas.find(
        (l) => l.producto_id === p.id && l.es_mayoreo === (esMayoreo ? 1 : 0) && l.precio_unitario === precio,
      );
      let lineaId: string;
      if (existente) {
        const antes = existente.cantidad;
        const despues = antes + cantidad;
        await repo.actualizarCantidadLinea(existente.id, despues);
        lineaId = existente.id;
        registrarAccionTicket([{ tipo: "cantidad", lineaId, antes, despues }]);
      } else {
        const nueva = await repo.agregarLinea(activoId, {
          producto_id: p.id,
          descripcion: p.descripcion,
          cantidad,
          precioUnitario: precio,
          esMayoreo,
          impuestoTipo: p.impuesto_tipo,
          tasaImpuesto: p.tasa_impuesto,
        });
        lineaId = nueva.id;
        registrarAccionTicket([{ tipo: "crear", lineaId }]);
      }
      setBusqueda("");
      setResultados([]);
      setIndiceResultado(-1);
      // El producto recién agregado (o la línea a la que se sumó) queda "resaltado" para poder
      // ajustar cantidad/mayoreo con +/−/F8 sin tocar el mouse — el foco del teclado se queda en
      // la búsqueda (para seguir escaneando), y las flechas arriba/abajo desde ahí mueven el
      // resaltado entre líneas (§ onKeyDown de la búsqueda).
      const lineasNuevas = await refrescarTicketActivo();
      const destino = lineasNuevas.find((x) => x.id === lineaId) ?? null;
      setLineaResaltada(destino);
      enfocarBusqueda();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  /** Precio unitario a usar para un producto según el régimen mayoreo activo (botón "Precio
   *  mayoreo"/F8). Sin promoción — esa se resuelve de forma asíncrona dentro de `agregarProducto`
   *  al confirmar. */
  function precioBase(p: Producto): number {
    return esMayoreo && p.precio_mayoreo ? p.precio_mayoreo : p.precio_venta;
  }

  /** Punto de entrada al elegir un producto desde la búsqueda principal (clic en resultado, código de
   *  barra exacto, o único resultado + Enter). Los productos a granel (§ venta a granel) no tienen una
   *  cantidad implícita: se abre la ventanita de cantidad específica en vez de agregar 1 unidad de una vez. */
  function seleccionarProducto(p: Producto) {
    if (p.tipo_venta === "granel") {
      elegirProductoModalCantidad(p);
      return;
    }
    void agregarProducto(p, 1);
  }

  /** Abre el "Modificar" (§ botón en la búsqueda): corrige un producto sin salir del ticket que se
   *  está armando, para poder corregir un precio equivocado y agregarlo enseguida. */
  function abrirEdicionProducto(p: Producto) {
    setEditandoProducto(p);
    setFormEdicion({
      descripcion: p.descripcion,
      codigo_barra: p.codigo_barra ?? "",
      tipo_venta: p.tipo_venta,
      unidad_medida: p.unidad_medida ?? "",
      costo: p.costo,
      // § Productos.editar(): el % guardado se desfasa cuando el precio se
      // escribió a mano — se muestra el % que el precio actual implica de verdad.
      pct_ganancia: pctGananciaDesdePrecio(p.costo, p.precio_venta, p.tasa_impuesto),
      precio_venta: p.precio_venta,
      precio_mayoreo: p.precio_mayoreo,
      impuesto_tipo: p.impuesto_tipo,
      politica_sin_existencia: p.politica_sin_existencia,
    });
    setErroresEdicion([]);
  }

  function cerrarEdicionProducto() {
    setEditandoProducto(null);
    setFormEdicion(null);
    setErroresEdicion([]);
    setCambiosPendientesEdicion(null);
  }

  /** Antes de guardar, muestra qué va a cambiar y pide confirmar (§ Productos.guardar()) —
   *  así corregir un precio desde la búsqueda no lo aplica sin querer. */
  function guardarEdicionProducto() {
    if (!editandoProducto || !formEdicion) return;
    const cambios = diferenciasProducto(editandoProducto, formEdicion);
    if (cambios.length === 0) { cerrarEdicionProducto(); return; }
    setCambiosPendientesEdicion(cambios);
  }

  async function guardarEdicionProductoAhora() {
    if (!editandoProducto || !formEdicion) return;
    try {
      await productos.actualizar(editandoProducto.id, formEdicion);
      // Un ticket abierto (este mismo u otro) pudo agregar el producto ANTES de la corrección —
      // sin esto se quedaría cobrando el precio viejo aunque el catálogo ya muestre el nuevo.
      const actualizado = await productos.obtener(editandoProducto.id);
      if (actualizado) {
        await repo.actualizarPrecioEnTicketsAbiertos({
          productoId: actualizado.id,
          precioVenta: actualizado.precio_venta,
          precioMayoreo: actualizado.precio_mayoreo,
          impuestoTipo: actualizado.impuesto_tipo,
          tasaImpuesto: actualizado.tasa_impuesto,
        });
      }
      cerrarEdicionProducto();
      buscarProducto(busqueda);
      await refrescarTicketActivo();
    } catch (e) {
      setCambiosPendientesEdicion(null);
      setErroresEdicion(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje) : [String(e)]);
    }
  }

  /** Abre la ventanita "Agregar cantidad específica" (§ botón dedicado) empezando por la búsqueda del producto. */
  function abrirModalCantidad() {
    setModalCantidad({ producto: null });
    setBusquedaModalCantidad("");
    setResultadosModalCantidad([]);
    setIndiceResultadoModalCantidad(-1);
  }

  /** Busca con un pequeño debounce y, en cuanto el texto deja un solo producto posible, pasa directo
   *  a cantidad/monto — sin esperar Enter ni un clic, para poder usar esta ventanita solo con el
   *  teclado. El debounce (en vez de buscar en cada tecla) es a propósito: si el cambio de foco a la
   *  ventanita de cantidad ocurriera a mitad de una racha de teclas (tipeo rápido o un escáner de
   *  código de barra, que dispara teclas mucho más rápido que el round-trip de `productos.listar`),
   *  las teclas que quedan en vuelo terminan escribiéndose en el campo que recién ganó el foco. Esperar
   *  a una pausa evita esa condición de carrera por completo. */
  useEffect(() => {
    if (!modalCantidad || modalCantidad.producto) return;
    const q = busquedaModalCantidad;
    if (!q.trim()) {
      setResultadosModalCantidad([]);
      setIndiceResultadoModalCantidad(-1);
      return;
    }
    const id = setTimeout(() => {
      void productos.listar(q).then((resultados) => {
        setResultadosModalCantidad(resultados);
        setIndiceResultadoModalCantidad(-1);
        if (resultados.length === 1) elegirProductoModalCantidad(resultados[0]);
      });
    }, 250);
    return () => clearTimeout(id);
  }, [busquedaModalCantidad, modalCantidad, productos]);

  // Cuál de los dos campos escribió la persona por último: es el que manda al confirmar. El otro es
  // solo una vista previa calculada — mostrarlo redondeado a 2 decimales está bien para leer en
  // pantalla, pero si se usara ese texto YA REDONDEADO como la cantidad real a cobrar, el redondeo se
  // arrastra al total (p.ej. pedir "RD$500 de queso" podía terminar cobrando RD$499.10). Por eso
  // `confirmarModalCantidad` recalcula desde el campo autoritativo con precisión completa, no desde el
  // texto ya redondeado del campo derivado.
  const [campoModalActivo, setCampoModalActivo] = useState<"cantidad" | "monto">("cantidad");

  /** Producto ya elegido (desde la búsqueda de la ventanita, o directo si es a granel): pasa al paso de cantidad/monto.
   *  Cantidad arranca en "1" (Enter agrega una unidad de una vez) y con foco+selección — así, si en
   *  vez de aceptar la unidad se empieza a escribir, lo tecleado reemplaza el "1" en vez de sumarse. */
  function elegirProductoModalCantidad(p: Producto) {
    setModalCantidad({ producto: p });
    setCampoModalActivo("cantidad");
    const precio = precioBase(p);
    setCantidadModalTexto("1");
    setMontoModalTexto(precio > 0 ? precio.toFixed(2) : "");
  }

  function cambiarCantidadModal(texto: string) {
    const limpio = filtrarNumero(texto);
    setCampoModalActivo("cantidad");
    setCantidadModalTexto(limpio);
    const p = modalCantidad?.producto;
    const cantidad = Number(limpio);
    if (p && Number.isFinite(cantidad)) {
      const precio = precioBase(p);
      setMontoModalTexto(precio > 0 ? (cantidad * precio).toFixed(2) : "");
    }
  }

  function cambiarMontoModal(texto: string) {
    const limpio = filtrarNumero(texto);
    setCampoModalActivo("monto");
    setMontoModalTexto(limpio);
    const p = modalCantidad?.producto;
    const monto = Number(limpio);
    const precio = p ? precioBase(p) : 0;
    if (p && Number.isFinite(monto) && precio > 0) {
      setCantidadModalTexto((monto / precio).toFixed(2));
    }
  }

  function cerrarModalCantidad() {
    setModalCantidad(null);
    setBusquedaModalCantidad("");
    setResultadosModalCantidad([]);
    setCantidadModalTexto("");
    setMontoModalTexto("");
    enfocarBusqueda();
  }

  /** Cantidad real a agregar: si el último campo tocado fue "monto", se recalcula aquí con precisión
   *  completa (monto / precio) en vez de usar el texto de `cantidadModalTexto`, que solo existe
   *  redondeado a 2 decimales para mostrarse en pantalla. */
  function cantidadFinalModal(): number {
    const p = modalCantidad?.producto;
    if (!p) return 0;
    if (campoModalActivo === "monto") {
      const precio = precioBase(p);
      const monto = Number(montoModalTexto);
      return precio > 0 && monto > 0 ? monto / precio : 0;
    }
    return Number(cantidadModalTexto) || 0;
  }

  async function confirmarModalCantidad() {
    const p = modalCantidad?.producto;
    if (!p) return;
    const cantidad = cantidadFinalModal();
    if (!(cantidad > 0)) return;
    cerrarModalCantidad();
    await agregarProducto(p, cantidad);
  }

  /** Abre la ventanita "Consultar precio" (F9): buscar un producto y ver su precio sin agregarlo al ticket. */
  function abrirConsultaPrecio() {
    setModalConsultaAbierto(true);
    setBusquedaConsulta("");
    setResultadosConsulta([]);
  }

  function cerrarConsultaPrecio() {
    setModalConsultaAbierto(false);
    setBusquedaConsulta("");
    setResultadosConsulta([]);
    enfocarBusqueda();
  }

  // Mismo debounce que la búsqueda de "Agregar cantidad" (§ useEffect de buscarModalCantidad):
  // evita que la ventanita reaccione a mitad de una racha de teclas.
  useEffect(() => {
    if (!modalConsultaAbierto) return;
    const q = busquedaConsulta;
    if (!q.trim()) {
      setResultadosConsulta([]);
      return;
    }
    const id = setTimeout(() => {
      void productos.listar(q).then(setResultadosConsulta);
    }, 250);
    return () => clearTimeout(id);
  }, [busquedaConsulta, modalConsultaAbierto, productos]);

  async function agregarSuelto() {
    if (!activoId) return;
    setError(null);
    try {
      const nueva = await repo.agregarLinea(activoId, {
        producto_id: null,
        descripcion: sueltoDesc,
        cantidad: Math.max(1, Number(sueltoCantidad) || 1),
        precioUnitario: Number(sueltoPrecio) || 0,
        impuestoTipo: "itbis18",
        tasaImpuesto: 0.18,
      });
      registrarAccionTicket([{ tipo: "crear", lineaId: nueva.id }]);
      setSueltoDesc("");
      setSueltoPrecio("");
      setSueltoCantidad("1");
      setMostrarSuelto(false);
      await refrescarTicketActivo();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  async function establecerCantidad(l: FacturaLinea, cantidad: number) {
    if (!(cantidad > 0)) return eliminarLinea(l);
    setError(null);
    try {
      await repo.actualizarCantidadLinea(l.id, cantidad);
      registrarAccionTicket([{ tipo: "cantidad", lineaId: l.id, antes: l.cantidad, despues: cantidad }]);
      await refrescarTicketActivo();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  function cambiarCantidad(l: FacturaLinea, delta: number) {
    return establecerCantidad(l, l.cantidad + delta);
  }

  /** Mueve el resaltado de línea con las flechas arriba/abajo (§ contenedor `lineasRef`), partiendo
   *  de la línea actual si hay una, o del extremo correspondiente si no hay ninguna resaltada. */
  function moverResaltado(delta: number) {
    if (lineas.length === 0) return;
    const idx = lineaResaltada ? lineas.findIndex((x) => x.id === lineaResaltada.id) : -1;
    const siguiente = idx === -1 ? (delta > 0 ? 0 : lineas.length - 1) : Math.min(Math.max(idx + delta, 0), lineas.length - 1);
    setLineaResaltada(lineas[siguiente]);
  }

  function editarCantidad(l: FacturaLinea) {
    setLineaEditandoId(l.id);
    setCantidadEditandoInput(formatearCantidad(l.cantidad));
  }

  async function confirmarEdicionCantidad(l: FacturaLinea) {
    const cantidad = Number(cantidadEditandoInput);
    setLineaEditandoId(null);
    if (!Number.isFinite(cantidad)) return;
    await establecerCantidad(l, cantidad);
  }

  async function eliminarLinea(l: FacturaLinea) {
    await repo.eliminarLinea(l.id);
    registrarAccionTicket([{ tipo: "eliminar", lineaId: l.id }]);
    // No hace falta soltar `lineaResaltada` a mano aquí: el efecto que la mantiene siempre válida
    // (§ arriba) la reconcilia en cuanto `lineas` se actualiza, cayendo a otra línea si existía.
    await refrescarTicketActivo();
  }

  /** Alterna el precio mayoreo de una línea ya agregada (§ resaltar con el mouse + F8, sin clic):
   *  recalcula el precio con el producto actual y, si ya hay otra línea con ese mismo régimen/precio,
   *  fusiona en vez de dejar dos líneas — mismo criterio que al agregar por primera vez. */
  async function alternarMayoreoLinea(l: FacturaLinea) {
    if (!activoId || !l.producto_id) return; // los artículos sueltos no tienen precio mayoreo
    setError(null);
    try {
      const p = await productos.obtener(l.producto_id);
      if (!p) return;
      const nuevoMayoreo = !l.es_mayoreo;
      const nuevoPrecio = nuevoMayoreo && p.precio_mayoreo ? p.precio_mayoreo : p.precio_venta;

      const existente = lineas.find(
        (x) => x.id !== l.id && x.producto_id === l.producto_id && x.es_mayoreo === (nuevoMayoreo ? 1 : 0) && x.precio_unitario === nuevoPrecio,
      );
      if (existente) {
        const antes = existente.cantidad;
        const despues = antes + l.cantidad;
        await repo.actualizarCantidadLinea(existente.id, despues);
        await repo.eliminarLinea(l.id);
        registrarAccionTicket([
          { tipo: "cantidad", lineaId: existente.id, antes, despues },
          { tipo: "eliminar", lineaId: l.id },
        ]);
      } else {
        await repo.eliminarLinea(l.id);
        const nueva = await repo.agregarLinea(activoId, {
          producto_id: l.producto_id,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precioUnitario: nuevoPrecio,
          esMayoreo: nuevoMayoreo,
          impuestoTipo: l.impuesto_tipo,
          tasaImpuesto: l.tasa_impuesto,
        });
        registrarAccionTicket([
          { tipo: "eliminar", lineaId: l.id },
          { tipo: "crear", lineaId: nueva.id },
        ]);
      }
      setLineaResaltada(null);
      await refrescarTicketActivo();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  async function buscarCliente(q: string) {
    setClienteQ(q);
    setClienteResultados(q.trim() ? await clientes.listar(q) : []);
    setIndiceResultadoCliente(-1);
  }

  async function asignarCliente(cl: Cliente | null) {
    if (!activoId) return;
    await repo.asignarCliente(activoId, cl?.id ?? null);
    setClienteActivo(cl);
    setClienteQ("");
    setClienteResultados([]);
    await refrescarTicketActivo();
  }

  async function crearClienteRapido() {
    if (!nuevoClienteNombre.trim()) return;
    setError(null);
    try {
      const cl = await clientes.crear({ nombre: nuevoClienteNombre.trim(), telefono: nuevoClienteTelefono.trim() || null });
      await asignarCliente(cl);
      setMostrarNuevoCliente(false);
      setNuevoClienteNombre("");
      setNuevoClienteTelefono("");
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  const negocioReciboDefault = {
    nombre_comercial: "Mi Negocio",
    rnc: null,
    direccion: null,
    telefono: null,
    ancho_impresora_default: 80,
  };

  /** Confirma el cobro (normal o con NCF), imprime/genera el PDF si corresponde, y libera el ticket. */
  async function confirmarCobro(
    pagos: { metodo: MetodoPago; monto: number }[],
    notas: string,
    salida: SalidaCobro,
    fiscal: FiscalInput | null,
  ) {
    if (!activoId) return;

    let factura: Factura;
    let comprobanteRecibo: { ncf: string; tipoEcfEtiqueta: string; codigoSeguridad?: string | null } | null = null;

    if (fiscal) {
      const resultado = await cobrarConFiscal(
        { facturaRepo: repo, secuenciaRepo: secuenciaNcf, comprobanteRepo: comprobanteFiscal, proveedorFiscal },
        activoId,
        { pagos, notas, tipoEcf: fiscal.tipoEcf, receptorDocumentoTipo: fiscal.receptorDocumentoTipo, receptorDocumentoNumero: fiscal.receptorDocumentoNumero, rncEmisor: negocio?.rnc ?? null },
      );
      factura = resultado.factura;
      comprobanteRecibo = {
        ncf: resultado.comprobante.ncf,
        tipoEcfEtiqueta: fiscal.tipoEcf === "31" ? "Crédito Fiscal (E31)" : "Consumo (E32)",
        codigoSeguridad: resultado.comprobante.codigo_seguridad,
      };
    } else {
      const resultado = await repo.cobrar(activoId, { pagos, notas });
      factura = resultado.factura;
    }

    const datosRecibo = {
      negocio: negocio ?? negocioReciboDefault,
      factura,
      lineas,
      pagos,
      cliente: clienteActivo,
      comprobante: comprobanteRecibo,
    };
    if (salida === "imprimir") {
      imprimirRecibo(datosRecibo);
    } else if (salida === "pdf") {
      guardarPdf(generarPdfRecibo(datosRecibo), `Factura-${factura.numero_interno}.pdf`);
    }
    if (pagos.some((p) => p.metodo === "efectivo")) void abrirGavetaTermica();
    setMostrarCobro(false);
    setActivoId(null);
    await cargarTickets();
    enfocarBusqueda();
  }

  /** Genera una cotización a partir del ticket actual: guarda el registro (§ cotizacion-repo) y el
   *  PDF. A diferencia de Cobrar, no toca el ticket — sigue abierto tal como estaba. */
  async function crearCotizacion(notas: string, diasVigencia: number) {
    const c = await cotizacionRepo.crear({
      cliente_id: clienteActivo?.id ?? null,
      notas: notas.trim() || null,
      diasVigencia,
      lineas: lineas.map((l) => ({
        producto_id: l.producto_id,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precio_unitario,
        impuestoTipo: l.impuesto_tipo,
        tasaImpuesto: l.tasa_impuesto,
      })),
    });
    guardarPdf(
      generarPdfCotizacion({
        negocio: negocio ?? negocioReciboDefault,
        numero: c.numero_interno,
        fecha: c.fecha_hora,
        fechaVencimiento: c.fecha_vencimiento,
        cliente: clienteActivo,
        lineas,
        subtotalGravado: c.subtotal_gravado,
        subtotalExento: c.subtotal_exento,
        totalItbis: c.total_itbis,
        total: c.total,
        notas: c.notas,
      }),
      `Cotizacion-${c.numero_interno}.pdf`,
    );
    setMostrarCotizacion(false);
    enfocarBusqueda();
  }

  /** Reimprime la última venta cobrada (§7.1). */
  async function reimprimirUltimo() {
    setReimprimiendo(true);
    try {
      const ultima = await repo.obtenerUltimaCobrada();
      if (!ultima) {
        alert("Todavía no hay ninguna venta cobrada para reimprimir.");
        return;
      }
      const [lineasUltima, pagosUltima, clienteUltima, comprobanteUltimo] = await Promise.all([
        repo.obtenerLineas(ultima.id),
        repo.obtenerPagos(ultima.id),
        ultima.cliente_id ? clientes.obtener(ultima.cliente_id) : Promise.resolve(undefined),
        ultima.comprobante_id ? comprobanteFiscal.obtener(ultima.comprobante_id) : Promise.resolve(undefined),
      ]);
      imprimirRecibo({
        negocio: negocio ?? negocioReciboDefault,
        factura: ultima,
        lineas: lineasUltima,
        pagos: pagosUltima,
        cliente: clienteUltima ?? null,
        comprobante: comprobanteUltimo
          ? {
              ncf: comprobanteUltimo.ncf,
              tipoEcfEtiqueta: comprobanteUltimo.tipo_ecf === "31" ? "Crédito Fiscal (E31)" : "Consumo (E32)",
              codigoSeguridad: comprobanteUltimo.codigo_seguridad,
            }
          : null,
      });
    } finally {
      setReimprimiendo(false);
    }
  }

  return (
    <div>
      {/* Barra de tickets abiertos + fecha/hora */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setActivoId(t.id)}
              title={nombreClientePorTicket[t.id] ? `Ticket #${t.numero_interno}` : undefined}
              style={{
                ...s.botonSecundario,
                borderRadius: 999,
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                ...(t.id === activoId ? { background: c.azulClaro, color: c.azulOscuro, border: `1px solid ${c.azul}`, fontWeight: 600 } : {}),
              }}
            >
              {nombreClientePorTicket[t.id] ?? `Ticket #${t.numero_interno}`}
            </button>
          ))}
          <button style={s.botonSecundario} onClick={nuevoTicket}>+ Nuevo ticket (F6)</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={s.botonSecundario} disabled={reimprimiendo} onClick={reimprimirUltimo}>
            Reimprimir último ticket (Ctrl+P)
          </button>
          <span style={{ color: c.gris, fontSize: 13 }}>
            {ahora.toLocaleDateString("es-DO")} {ahora.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {errorCarga ? (
        <div style={s.errorBox}>No se pudo cargar el ticket: {errorCarga}</div>
      ) : !activo ? (
        <p style={{ color: c.gris }}>Cargando ticket…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
          {/* Columna principal: búsqueda + líneas */}
          <div>
            <div style={{ ...s.tarjeta, marginBottom: 12 }}>
              {/* `position: relative` para que el desplegable de resultados (§ abajo) quede
                  posicionado ENCIMA del contenido de más abajo (el formulario de suelto, y sobre
                  todo la tabla de líneas del ticket) en vez de empujarlo hacia abajo cada vez que
                  aparecen resultados — la lista del ticket no debe moverse mientras se busca. */}
              <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  ref={busquedaRef}
                  style={{ ...s.input, fontSize: 15, padding: "11px 14px" }}
                  placeholder="Escanear código de barra o buscar producto… (F10)"
                  value={busqueda}
                  autoFocus
                  onChange={(e) => buscarProducto(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Escape" && resultados.length > 0 && !ocultarResultados) {
                      e.preventDefault();
                      setOcultarResultados(true);
                      return;
                    }
                    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && resultados.length > 0 && !ocultarResultados) {
                      e.preventDefault();
                      setIndiceResultado((i) => {
                        const siguiente = e.key === "ArrowDown" ? i + 1 : i - 1;
                        return Math.min(Math.max(siguiente, 0), resultados.length - 1);
                      });
                      return;
                    }
                    // Sin un desplegable de resultados visible, arriba/abajo mueve el resaltado
                    // entre las líneas del ticket — así siempre hay una línea con la que trabajar
                    // (F8/+/−) sin salir de la búsqueda ni tocar el mouse.
                    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && lineas.length > 0) {
                      e.preventDefault();
                      moverResaltado(e.key === "ArrowDown" ? 1 : -1);
                      return;
                    }
                    if (e.key === "Enter" && busqueda.trim()) {
                      // `e.currentTarget` deja de ser válido después del `await` (React limpia el
                      // evento sintético) — hay que guardar el nodo del DOM antes de esperar.
                      const campo = e.currentTarget;
                      const exacto = await productos.porCodigoBarra(busqueda.trim());
                      if (exacto) { seleccionarProducto(exacto); return; }
                      if (indiceResultado >= 0 && resultados[indiceResultado]) { seleccionarProducto(resultados[indiceResultado]); return; }
                      if (resultados.length === 1) { seleccionarProducto(resultados[0]); return; }
                      if (resultados.length === 0) {
                        setError("Producto no encontrado.");
                        // Deja el código seleccionado (sin borrarlo) para que el siguiente
                        // escaneo/tecleo lo reemplace solo, sin tener que borrarlo a mano primero.
                        campo.select();
                      }
                    }
                  }}
                />
                <button
                  style={{
                    ...s.botonSecundario,
                    whiteSpace: "nowrap",
                    ...(esMayoreo ? { background: c.azulClaro, color: c.azulOscuro, border: `1px solid ${c.azul}`, fontWeight: 600 } : {}),
                  }}
                  onClick={() => setEsMayoreo((v) => !v)}
                >
                  {esMayoreo ? "✓ " : ""}Precio mayoreo (F8)
                </button>
                <BotonVoz onResultado={(texto) => buscarProducto(texto)} />
                <button style={s.botonSecundario} onClick={() => setMostrarSuelto((v) => !v)}>
                  + Artículo no registrado (F7)
                </button>
                <button style={s.botonSecundario} onClick={abrirModalCantidad}>
                  🔢 Agregar cantidad (F11)
                </button>
                <button style={s.botonSecundario} onClick={abrirConsultaPrecio}>
                  🔍 Consultar precio (F9)
                </button>
              </div>

              {resultados.length > 0 && !ocultarResultados && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 8,
                    background: c.superficie,
                    border: `1px solid ${c.borde}`,
                    borderRadius: 8,
                    overflow: "hidden",
                    maxHeight: 340,
                    overflowY: "auto",
                    boxShadow: sombra.md,
                    zIndex: 20,
                  }}
                >
                  {resultados.map((p, i) => (
                    <div
                      key={p.id}
                      className="sfr-fila-clickeable"
                      onClick={() => seleccionarProducto(p)}
                      onMouseEnter={() => setIndiceResultado(i)}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        borderBottom: `1px solid ${c.borde}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        ...(i === indiceResultado ? { background: c.azulClaro } : {}),
                      }}
                    >
                      <span>
                        <button
                          onClick={(e) => { e.stopPropagation(); void alternarFavoritoProducto(p); }}
                          title={p.favorito === 1 ? "Quitar de favoritos" : "Marcar como favorito"}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 0, marginRight: 4, lineHeight: 1, verticalAlign: "middle", color: p.favorito === 1 ? c.amarillo : c.gris, opacity: p.favorito === 1 ? 1 : 0.4 }}
                        >
                          {p.favorito === 1 ? "★" : "☆"}
                        </button>
                        {p.descripcion} {p.codigo_barra ? <span style={{ color: c.gris, fontSize: 12 }}>({p.codigo_barra})</span> : ""}
                        {p.tipo_venta === "granel" && (
                          <span style={{ ...s.badge, marginLeft: 8, background: c.amarilloFondo, color: c.amarillo }}>
                            ⚖️ a granel{p.unidad_medida ? ` (${p.unidad_medida})` : ""}
                          </span>
                        )}
                        {negocio?.inventario_activo === 1 && (
                          <span style={{ color: (p.existencia ?? 0) <= 0 ? c.rojo : c.gris, fontSize: 12, marginLeft: 8 }}>
                            {(p.existencia ?? 0) <= 0 ? "⚠ sin existencia" : `${p.existencia} disponibles`}
                          </span>
                        )}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <b style={{ fontVariantNumeric: "tabular-nums" }}>RD$ {money(esMayoreo && p.precio_mayoreo ? p.precio_mayoreo : p.precio_venta)}</b>
                        <button
                          style={s.botonSecundario}
                          title="Corregir este producto sin salir del ticket"
                          onClick={(e) => { e.stopPropagation(); abrirEdicionProducto(p); }}
                        >
                          ✏️ Modificar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>

              {mostrarSuelto && (
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <input autoFocus style={s.input} placeholder="Descripción" value={sueltoDesc}
                    onChange={(e) => setSueltoDesc(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void agregarSuelto(); }} />
                  <input style={{ ...s.input, maxWidth: 120 }} placeholder="Precio" type="text" inputMode="decimal" value={sueltoPrecio}
                    onChange={(e) => setSueltoPrecio(filtrarNumero(e.target.value))}
                    onKeyDown={(e) => { if (e.key === "Enter") void agregarSuelto(); }} />
                  <input style={{ ...s.input, maxWidth: 80 }} placeholder="Cant." type="text" inputMode="decimal" value={sueltoCantidad}
                    onChange={(e) => setSueltoCantidad(filtrarNumero(e.target.value))}
                    onKeyDown={(e) => { if (e.key === "Enter") void agregarSuelto(); }} />
                  <button style={s.boton} onClick={agregarSuelto}>Agregar</button>
                </div>
              )}

              {error && <div style={s.errorBox}>{error}</div>}
              {promoAplicada && (
                <div style={{ ...s.errorBox, background: c.verdeFondo, borderColor: c.verde, color: c.verde }}>
                  {promoAplicada}
                </div>
              )}
            </div>

            <div style={s.tarjeta}>
              <table style={s.tabla}>
                <thead>
                  <tr>
                    <th style={s.th}>#</th>
                    <th style={s.th}>Descripción</th>
                    <th style={s.th}>Cant.</th>
                    <th style={s.th}>Precio</th>
                    <th style={s.th}>Subtotal</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.length === 0 && (
                    <tr><td style={s.filaVacia} colSpan={6}>Sin artículos. Escanea o busca un producto arriba.</td></tr>
                  )}
                  {lineas.map((l, i) => (
                    <tr
                      key={l.id}
                      onMouseEnter={() => setLineaResaltada(l)}
                      title={l.producto_id ? "↑/↓: moverse · +/−: cambiar cantidad · F8: alternar mayoreo (sin hacer clic)" : "↑/↓: moverse · +/−: cambiar cantidad (sin hacer clic)"}
                      style={lineaResaltada?.id === l.id ? { background: c.azulClaro } : undefined}
                    >
                      <td style={{ ...s.td, color: c.gris, fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                      <td style={s.td}>
                        {l.descripcion}
                        {l.es_mayoreo ? <span style={{ ...s.badge, marginLeft: 6 }}>mayoreo</span> : ""}
                        {!l.producto_id ? <span style={{ ...s.badge, marginLeft: 6, background: c.amarilloFondo, color: c.amarillo }}>no registrado</span> : ""}
                      </td>
                      <td style={s.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button style={stepperBtn} onClick={() => cambiarCantidad(l, -1)}>−</button>
                          {lineaEditandoId === l.id ? (
                            <input
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              type="text"
                              inputMode="decimal"
                              value={cantidadEditandoInput}
                              onChange={(e) => setCantidadEditandoInput(filtrarNumero(e.target.value))}
                              onBlur={() => void confirmarEdicionCantidad(l)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void confirmarEdicionCantidad(l);
                                else if (e.key === "Escape") setLineaEditandoId(null);
                              }}
                              style={{ ...s.input, width: 64, padding: "4px 6px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}
                            />
                          ) : (
                            <span
                              onClick={() => editarCantidad(l)}
                              title="Clic para modificar la cantidad"
                              style={{ minWidth: 24, textAlign: "center", fontVariantNumeric: "tabular-nums", cursor: "pointer", borderBottom: `1px dashed ${c.gris}` }}
                            >
                              {formatearCantidad(l.cantidad)}
                            </span>
                          )}
                          <button style={stepperBtn} onClick={() => cambiarCantidad(l, 1)}>+</button>
                        </div>
                      </td>
                      <td style={s.tdDerecha}>RD$ {money(l.precio_unitario)}</td>
                      <td style={s.tdDerecha}>RD$ {money(l.subtotal)}</td>
                      <td style={s.td}>
                        <button
                          style={s.botonPeligro}
                          onClick={() => { if (confirm(`¿Borrar "${l.descripcion}" del ticket?`)) void eliminarLinea(l); }}
                        >
                          Borrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lineas.length > 0 && (() => {
                const totalArticulos = lineas.reduce((acc, l) => acc + l.cantidad, 0);
                return (
                  <div style={{ padding: "8px 4px 0", textAlign: "right", fontSize: 12, color: c.gris }}>
                    {lineas.length} línea{lineas.length === 1 ? "" : "s"} · {formatearCantidad(totalArticulos)} artículo{totalArticulos === 1 ? "" : "s"} en total
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Columna lateral: cliente + totales */}
          <div>
            <div style={{ ...s.tarjeta, marginBottom: 12 }}>
              <h4 style={{ marginTop: 0 }}>👤 Cliente</h4>
              {clienteActivo ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ margin: 0 }}>{clienteActivo.nombre} {clienteActivo.apellidos ?? ""}</p>
                  <button style={s.botonSecundario} onClick={() => asignarCliente(null)}>Quitar</button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      style={s.input}
                      placeholder="Buscar cliente…"
                      value={clienteQ}
                      onChange={(e) => void buscarCliente(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && clienteResultados.length > 0) {
                          e.preventDefault();
                          setIndiceResultadoCliente((i) => {
                            const siguiente = e.key === "ArrowDown" ? i + 1 : i - 1;
                            return Math.min(Math.max(siguiente, 0), clienteResultados.length - 1);
                          });
                          return;
                        }
                        if (e.key === "Enter" && indiceResultadoCliente >= 0 && clienteResultados[indiceResultadoCliente]) {
                          asignarCliente(clienteResultados[indiceResultadoCliente]);
                        }
                      }}
                    />
                    <button style={s.botonSecundario} onClick={() => setMostrarNuevoCliente((v) => !v)}>+ Nuevo</button>
                  </div>
                  {clienteResultados.map((cl, i) => (
                    <div
                      key={cl.id}
                      className="sfr-fila-clickeable"
                      onClick={() => asignarCliente(cl)}
                      onMouseEnter={() => setIndiceResultadoCliente(i)}
                      style={{
                        padding: "8px 6px",
                        cursor: "pointer",
                        fontSize: 14,
                        borderRadius: 6,
                        ...(i === indiceResultadoCliente ? { background: c.azulClaro } : {}),
                      }}
                    >
                      {cl.nombre} {cl.apellidos ?? ""}
                    </div>
                  ))}
                  {mostrarNuevoCliente && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      <input autoFocus style={s.input} placeholder="Nombre del cliente" value={nuevoClienteNombre}
                        onChange={(e) => setNuevoClienteNombre(e.target.value)} />
                      <input style={s.input} placeholder="Teléfono (opcional)" value={nuevoClienteTelefono}
                        onChange={(e) => setNuevoClienteTelefono(e.target.value)} />
                      <button style={s.boton} disabled={!nuevoClienteNombre.trim()} onClick={crearClienteRapido}>
                        Crear y asignar
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={s.tarjeta}>
              <h4 style={{ marginTop: 0 }}>💲 Totales</h4>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                <span style={{ color: c.gris }}>Gravado</span><span>RD$ {money(activo.subtotal_gravado)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                <span style={{ color: c.gris }}>Exento</span><span>RD$ {money(activo.subtotal_exento)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                <span style={{ color: c.gris }}>ITBIS</span><span>RD$ {money(activo.total_itbis)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 20, fontWeight: 700, borderTop: `1px solid ${c.borde}`, paddingTop: 10 }}>
                <span>Total</span><span style={{ fontVariantNumeric: "tabular-nums" }}>RD$ {money(activo.total)}</span>
              </div>
              <button
                style={{ ...s.boton, width: "100%", marginTop: 14, padding: "13px 18px", fontSize: 16 }}
                disabled={lineas.length === 0}
                onClick={() => setMostrarCobro(true)}
              >
                Cobrar (F12)
              </button>
              <button
                style={{ ...s.botonSecundario, width: "100%", marginTop: 8 }}
                disabled={lineas.length === 0}
                onClick={() => setMostrarCotizacion(true)}
              >
                📋 Cotización (F5)
              </button>
              <button style={{ ...s.botonPeligro, width: "100%", marginTop: 8, border: "none", background: "none" }} onClick={eliminarTicketActivo}>
                Eliminar ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarCobro && activo && (
        <ModalCobro
          total={activo.total}
          cantidadArticulos={lineas.length}
          notasIniciales={activo.notas ?? ""}
          clienteDocumentoTipo={clienteActivo?.documento_tipo ?? null}
          clienteDocumentoNumero={clienteActivo?.documento_numero ?? null}
          onCancelar={() => { setMostrarCobro(false); enfocarBusqueda(); }}
          onConfirmar={confirmarCobro}
        />
      )}

      {mostrarCotizacion && activo && (
        <ModalCotizacion
          total={activo.total}
          cantidadArticulos={lineas.length}
          notasIniciales={activo.notas ?? ""}
          onCancelar={() => { setMostrarCotizacion(false); enfocarBusqueda(); }}
          onConfirmar={crearCotizacion}
        />
      )}

      {modalCantidad && (
        <div
          style={{ position: "fixed", inset: 0, background: "var(--sfr-overlay)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={cerrarModalCantidad}
        >
          <div style={{ ...s.tarjeta, width: 380, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            {!modalCantidad.producto ? (
              <>
                <h3 style={{ marginTop: 0, marginBottom: 12 }}>🔢 Buscar producto</h3>
                <input
                  autoFocus
                  style={s.input}
                  placeholder="Escanear código de barra o buscar producto…"
                  value={busquedaModalCantidad}
                  onChange={(e) => setBusquedaModalCantidad(e.target.value)}
                  onKeyDown={async (e) => {
                    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && resultadosModalCantidad.length > 0) {
                      e.preventDefault();
                      setIndiceResultadoModalCantidad((i) => {
                        const siguiente = e.key === "ArrowDown" ? i + 1 : i - 1;
                        return Math.min(Math.max(siguiente, 0), resultadosModalCantidad.length - 1);
                      });
                      return;
                    }
                    if (e.key === "Enter" && busquedaModalCantidad.trim()) {
                      const exacto = await productos.porCodigoBarra(busquedaModalCantidad.trim());
                      if (exacto) { elegirProductoModalCantidad(exacto); return; }
                      if (indiceResultadoModalCantidad >= 0 && resultadosModalCantidad[indiceResultadoModalCantidad]) {
                        elegirProductoModalCantidad(resultadosModalCantidad[indiceResultadoModalCantidad]);
                        return;
                      }
                      if (resultadosModalCantidad.length === 1) elegirProductoModalCantidad(resultadosModalCantidad[0]);
                    }
                  }}
                />
                {resultadosModalCantidad.length > 0 && (
                  <div style={{ marginTop: 8, border: `1px solid ${c.borde}`, borderRadius: 8, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
                    {resultadosModalCantidad.map((p, i) => (
                      <div
                        key={p.id}
                        className="sfr-fila-clickeable"
                        onClick={() => elegirProductoModalCantidad(p)}
                        onMouseEnter={() => setIndiceResultadoModalCantidad(i)}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderBottom: `1px solid ${c.borde}`,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          ...(i === indiceResultadoModalCantidad ? { background: c.azulClaro } : {}),
                        }}
                      >
                        <span>
                          <button
                            onClick={(e) => { e.stopPropagation(); void alternarFavoritoProducto(p); }}
                            title={p.favorito === 1 ? "Quitar de favoritos" : "Marcar como favorito"}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 0, marginRight: 4, lineHeight: 1, verticalAlign: "middle", color: p.favorito === 1 ? c.amarillo : c.gris, opacity: p.favorito === 1 ? 1 : 0.4 }}
                          >
                            {p.favorito === 1 ? "★" : "☆"}
                          </button>
                          {p.descripcion}
                          {p.tipo_venta === "granel" && (
                            <span style={{ ...s.badge, marginLeft: 8, background: c.amarilloFondo, color: c.amarillo }}>
                              ⚖️ a granel{p.unidad_medida ? ` (${p.unidad_medida})` : ""}
                            </span>
                          )}
                        </span>
                        <b style={{ fontVariantNumeric: "tabular-nums" }}>RD$ {money(precioBase(p))}</b>
                      </div>
                    ))}
                  </div>
                )}
                <div style={s.formFooter}>
                  <button style={s.botonSecundario} onClick={cerrarModalCantidad}>Cancelar (Esc)</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0, marginBottom: 4 }}>
                  {modalCantidad.producto.tipo_venta === "granel" ? "⚖️ " : ""}{modalCantidad.producto.descripcion}
                </h3>
                <p style={{ color: c.gris, fontSize: 13, marginTop: 0, marginBottom: 12 }}>
                  Precio: RD$ {money(precioBase(modalCantidad.producto))}
                  {modalCantidad.producto.unidad_medida ? ` / ${modalCantidad.producto.unidad_medida}` : ""}
                </p>
                <label style={s.label}>
                  Cantidad{modalCantidad.producto.unidad_medida ? ` (${modalCantidad.producto.unidad_medida})` : ""}
                </label>
                <input
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  type="text"
                  inputMode="decimal"
                  style={{ ...s.input, fontSize: 18, textAlign: "center", fontWeight: 700 }}
                  value={cantidadModalTexto}
                  onChange={(e) => cambiarCantidadModal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void confirmarModalCantidad(); }}
                />
                <label style={s.label}>Monto (RD$)</label>
                <input
                  onFocus={(e) => e.target.select()}
                  type="text"
                  inputMode="decimal"
                  style={{ ...s.input, fontSize: 18, textAlign: "center", fontWeight: 700 }}
                  value={montoModalTexto}
                  onChange={(e) => cambiarMontoModal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void confirmarModalCantidad(); }}
                />
                <div style={s.formFooter}>
                  <button style={s.boton} disabled={!(cantidadFinalModal() > 0)} onClick={() => void confirmarModalCantidad()}>
                    Agregar
                  </button>
                  <button style={s.botonSecundario} onClick={cerrarModalCantidad}>Cancelar (Esc)</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modalConsultaAbierto && (
        <div
          style={{ position: "fixed", inset: 0, background: "var(--sfr-overlay)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={cerrarConsultaPrecio}
        >
          <div style={{ ...s.tarjeta, width: 420, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>🔍 Consultar precio</h3>
            <input
              autoFocus
              style={s.input}
              placeholder="Escanear código de barra o buscar producto…"
              value={busquedaConsulta}
              onChange={(e) => setBusquedaConsulta(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== "Enter" || !busquedaConsulta.trim()) return;
                // `e.currentTarget` deja de ser válido después del `await` (React limpia el evento
                // sintético) — hay que guardar el nodo del DOM antes de esperar, no después.
                const campo = e.currentTarget;
                // Un escáner escribe el código entero y manda Enter casi al instante — mucho antes
                // de que el debounce de arriba (250ms) llegue a buscar, así que sin esto Enter no
                // encontraba nada todavía que mostrar. Se busca el código exacto ya mismo, sin
                // esperar el debounce.
                const exacto = await productos.porCodigoBarra(busquedaConsulta.trim());
                if (exacto) setResultadosConsulta([exacto]);
                // No se borra el texto: hay que poder LEER el precio antes de que desaparezca. En
                // vez de eso se selecciona todo — así el siguiente escaneo/tecleo lo reemplaza solo
                // (como pasar el mouse y escribir encima), sin tener que borrar a mano primero.
                campo.select();
              }}
            />
            {resultadosConsulta.length > 0 && (
              <div style={{ marginTop: 8, border: `1px solid ${c.borde}`, borderRadius: 8, overflow: "hidden", maxHeight: 300, overflowY: "auto" }}>
                {resultadosConsulta.map((p) => (
                  <div key={p.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${c.borde}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>
                        {p.descripcion}
                        {p.tipo_venta === "granel" && (
                          <span style={{ ...s.badge, marginLeft: 8, background: c.amarilloFondo, color: c.amarillo }}>
                            ⚖️ a granel{p.unidad_medida ? ` (${p.unidad_medida})` : ""}
                          </span>
                        )}
                      </span>
                      <b style={{ fontVariantNumeric: "tabular-nums" }}>RD$ {money(p.precio_venta)}</b>
                    </div>
                    {p.precio_mayoreo ? (
                      <div style={{ fontSize: 12, color: c.gris, marginTop: 2 }}>Mayoreo: RD$ {money(p.precio_mayoreo)}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {busquedaConsulta.trim() && resultadosConsulta.length === 0 && (
              <p style={{ color: c.gris, fontSize: 13, marginTop: 8 }}>Sin resultados.</p>
            )}
            <div style={s.formFooter}>
              <button style={s.botonSecundario} onClick={cerrarConsultaPrecio}>Cerrar (Esc)</button>
            </div>
          </div>
        </div>
      )}

      {formEdicion && (
        <div
          style={{ position: "fixed", inset: 0, background: "var(--sfr-overlay)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={cerrarEdicionProducto}
        >
          <div style={{ width: 640, maxWidth: "90vw", maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <FormularioProducto
              form={formEdicion}
              onCambiar={setFormEdicion}
              editando
              inventarioActivo={negocio?.inventario_activo === 1}
              errores={erroresEdicion}
              onGuardar={guardarEdicionProducto}
              onCancelar={cerrarEdicionProducto}
            />
          </div>
        </div>
      )}

      {cambiosPendientesEdicion && (
        <ModalConfirmarCambios
          cambios={cambiosPendientesEdicion}
          onConfirmar={() => void guardarEdicionProductoAhora()}
          onCancelar={() => setCambiosPendientesEdicion(null)}
        />
      )}

      <ChatBot />
    </div>
  );
}
