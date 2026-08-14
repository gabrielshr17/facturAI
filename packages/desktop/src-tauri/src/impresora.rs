// Impresión térmica ESC/POS (§ hardware, plan.md) vía el Spooler de Windows.
//
// Por qué el Spooler y no USB/serial directo: la impresora térmica ya está
// instalada como una impresora normal de Windows (driver "Generic / Text
// Only" o el del fabricante), sin importar si está conectada por USB, red o
// serial — Windows ya resuelve ese transporte. Enviar el trabajo como
// datatype "RAW" hace que el spooler entregue los bytes ESC/POS tal cual,
// sin que ningún driver los reinterprete como texto/GDI. Este es el método
// estándar que usa el software POS en Windows para térmicas, y evita tener
// que reemplazar el driver USB con WinUSB/libusb (frágil e invasivo).
//
// El frontend (packages/ui) genera los bytes ESC/POS; aquí solo se entregan
// al spooler tal cual, por lo que este módulo no sabe nada de recibos ni
// formato — es puro transporte.

#[cfg(target_os = "windows")]
mod win {
    use std::ffi::c_void;
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, GetDefaultPrinterW,
        OpenPrinterW, StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W,
        PRINTER_ENUM_LOCAL, PRINTER_HANDLE, PRINTER_INFO_4W,
    };

    fn a_utf16(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn listar() -> Result<Vec<String>, String> {
        unsafe {
            let mut necesitados: u32 = 0;
            let mut cantidad: u32 = 0;
            // Primera llamada solo para saber cuántos bytes hacen falta.
            let _ = EnumPrintersW(
                PRINTER_ENUM_LOCAL,
                PWSTR::null(),
                4,
                None,
                &mut necesitados,
                &mut cantidad,
            );
            if necesitados == 0 {
                return Ok(vec![]);
            }
            let mut buffer: Vec<u8> = vec![0; necesitados as usize];
            let ok = EnumPrintersW(
                PRINTER_ENUM_LOCAL,
                PWSTR::null(),
                4,
                Some(&mut buffer),
                &mut necesitados,
                &mut cantidad,
            );
            if ok.is_err() {
                return Err("No se pudo enumerar las impresoras instaladas en Windows.".into());
            }
            let infos = buffer.as_ptr() as *const PRINTER_INFO_4W;
            let mut nombres = Vec::with_capacity(cantidad as usize);
            for i in 0..cantidad as isize {
                let info = &*infos.offset(i);
                if !info.pPrinterName.is_null() {
                    nombres.push(info.pPrinterName.to_string().map_err(|e| e.to_string())?);
                }
            }
            Ok(nombres)
        }
    }

    pub fn imprimir_raw(nombre_impresora: &str, datos: &[u8]) -> Result<(), String> {
        unsafe {
            let mut nombre_utf16 = a_utf16(nombre_impresora);
            let mut handle = PRINTER_HANDLE::default();
            OpenPrinterW(
                PWSTR::from_raw(nombre_utf16.as_mut_ptr()),
                &mut handle,
                None,
            )
            .map_err(|_| format!("No se pudo abrir la impresora \"{nombre_impresora}\". ¿El nombre es correcto y está instalada en Windows?"))?;

            let resultado = (|| -> Result<(), String> {
                let mut nombre_doc = a_utf16("Ticket de venta");
                let mut tipo_datos = a_utf16("RAW");
                let doc_info = DOC_INFO_1W {
                    pDocName: PWSTR::from_raw(nombre_doc.as_mut_ptr()),
                    pOutputFile: PWSTR::null(),
                    pDatatype: PWSTR::from_raw(tipo_datos.as_mut_ptr()),
                };

                let job_id = StartDocPrinterW(handle, 1, &doc_info);
                if job_id == 0 {
                    return Err("No se pudo iniciar el trabajo de impresión.".into());
                }

                let resultado_pagina = (|| -> Result<(), String> {
                    StartPagePrinter(handle).ok().map_err(|_| "No se pudo iniciar la página de impresión.".to_string())?;

                    let mut escritos: u32 = 0;
                    WritePrinter(
                        handle,
                        datos.as_ptr() as *const c_void,
                        datos.len() as u32,
                        &mut escritos,
                    )
                    .ok()
                    .map_err(|_| "Fallo al enviar los datos a la impresora.".to_string())?;

                    if escritos as usize != datos.len() {
                        return Err("La impresora no recibió todos los datos del ticket.".into());
                    }

                    EndPagePrinter(handle).ok().map_err(|_| "No se pudo cerrar la página de impresión.".to_string())?;
                    Ok(())
                })();

                let _ = EndDocPrinter(handle);
                resultado_pagina
            })();

            let _ = ClosePrinter(handle);
            resultado
        }
    }

    fn nombre_impresora_predeterminada() -> Result<String, String> {
        unsafe {
            let mut necesitados: u32 = 0;
            // Igual que EnumPrintersW: primera llamada solo para saber el tamaño.
            let _ = GetDefaultPrinterW(Some(PWSTR::null()), &mut necesitados);
            if necesitados == 0 {
                return Err("No hay ninguna impresora predeterminada configurada en Windows.".into());
            }
            let mut buffer: Vec<u16> = vec![0; necesitados as usize];
            GetDefaultPrinterW(Some(PWSTR::from_raw(buffer.as_mut_ptr())), &mut necesitados)
                .ok()
                .map_err(|_| "No se pudo obtener la impresora predeterminada de Windows.".to_string())?;
            let fin = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
            Ok(String::from_utf16_lossy(&buffer[..fin]))
        }
    }

    /// Imprime texto plano directamente al driver GDI de la impresora (cualquier
    /// impresora instalada en Windows, no solo térmicas), sin mostrar el diálogo
    /// de impresión del sistema: el trabajo se manda al Spooler ya armado
    /// (StartDocW/StartPage/TextOutW/EndPage/EndDoc), que es la vía nativa de
    /// Windows para imprimir sin intervención del usuario — el diálogo es una
    /// UI aparte que este camino nunca invoca. Usado quien no tiene una térmica
    /// ESC/POS configurada en Configuración, para que "Cobrar e imprimir"
    /// tampoco muestre nada ahí.
    pub fn imprimir_texto(nombre_impresora: Option<&str>, lineas: &[String]) -> Result<(), String> {
        imprimir_texto_interno(nombre_impresora, lineas, None)
    }

    /// Misma lógica que `imprimir_texto`, con un `archivo_salida` opcional para pruebas: apunta
    /// `DOCINFOW.lpszOutput` a un archivo (ej. con la impresora virtual "Microsoft Print to PDF")
    /// para poder verificar el resultado sin depender de una impresora física ni de un diálogo.
    pub(crate) fn imprimir_texto_interno(
        nombre_impresora: Option<&str>,
        lineas: &[String],
        archivo_salida: Option<&str>,
    ) -> Result<(), String> {
        use windows::Win32::Graphics::Gdi::{
            CreateDCW, CreateFontW, DeleteDC, DeleteObject, GetDeviceCaps, SelectObject,
            SetBkMode, TextOutW, ANSI_CHARSET, CLIP_DEFAULT_PRECIS, DEFAULT_QUALITY, FF_MODERN,
            FIXED_PITCH, FW_NORMAL, HORZRES, LOGPIXELSY, OUT_DEFAULT_PRECIS, TRANSPARENT, VERTRES,
        };
        // StartDocW/StartPage/EndPage/EndDoc/DOCINFOW viven en el módulo Xps del crate
        // `windows` (así clasifica ese binding esas funciones), no en Gdi.
        use windows::Win32::Storage::Xps::{DOCINFOW, EndDoc, EndPage, StartDocW, StartPage};

        let nombre = match nombre_impresora {
            Some(n) if !n.is_empty() => n.to_string(),
            _ => nombre_impresora_predeterminada()?,
        };

        unsafe {
            let nombre_utf16 = a_utf16(&nombre);
            let hdc = CreateDCW(
                PCWSTR::null(),
                PCWSTR::from_raw(nombre_utf16.as_ptr()),
                PCWSTR::null(),
                None,
            );
            if hdc.is_invalid() {
                return Err(format!("No se pudo abrir la impresora \"{nombre}\"."));
            }

            let resultado = (|| -> Result<(), String> {
                let mut doc_nombre = a_utf16("Ticket de venta");
                let mut salida_utf16 = archivo_salida.map(a_utf16);
                let info = DOCINFOW {
                    cbSize: std::mem::size_of::<DOCINFOW>() as i32,
                    lpszDocName: PCWSTR::from_raw(doc_nombre.as_mut_ptr()),
                    lpszOutput: match &mut salida_utf16 {
                        Some(s) => PCWSTR::from_raw(s.as_mut_ptr()),
                        None => PCWSTR::null(),
                    },
                    lpszDatatype: PCWSTR::null(),
                    fwType: 0,
                };
                if StartDocW(hdc, &info) <= 0 {
                    return Err("No se pudo iniciar el trabajo de impresión.".into());
                }

                let dpi_y = GetDeviceCaps(Some(hdc), LOGPIXELSY);
                let alto_pagina = GetDeviceCaps(Some(hdc), VERTRES);
                let ancho_pagina = GetDeviceCaps(Some(hdc), HORZRES);
                let alto_fuente = -(dpi_y * 11 / 72); // ~11pt
                let margen = dpi_y / 4; // ~0.25"

                // El ancho de carácter se pide EXPLÍCITO (nWidth) en vez de dejar que GDI use el
                // ancho "natural" de la fuente (nWidth=0): en una térmica de recibo, el área
                // imprimible real (HORZRES) suele ser bastante más angosta que lo que una fuente a
                // este alto de línea ocupa a su ancho natural — con ancho natural, una línea de
                // ANCHO_TEXTO caracteres (ver `recibo.ts`, debe coincidir con la constante de ahí)
                // se salía del papel por la derecha, y como las columnas se arman con `columnasTexto`
                // (etiqueta + espacios + monto pegado al final), lo que quedaba fuera del área
                // imprimible era justo el monto — el bug reportado de "el total sale en blanco" era
                // en realidad el total (y cualquier subtotal) recortado, no ausente de los datos.
                const CARACTERES_POR_LINEA: i32 = 46; // debe coincidir con ANCHO_TEXTO en recibo.ts
                let ancho_util = (ancho_pagina - margen * 2).max(CARACTERES_POR_LINEA);
                let ancho_caracter = ancho_util / CARACTERES_POR_LINEA;

                let mut fuente_nombre = a_utf16("Consolas");
                let fuente = CreateFontW(
                    alto_fuente,
                    ancho_caracter,
                    0,
                    0,
                    FW_NORMAL.0 as i32,
                    0,
                    0,
                    0,
                    ANSI_CHARSET,
                    OUT_DEFAULT_PRECIS,
                    CLIP_DEFAULT_PRECIS,
                    DEFAULT_QUALITY,
                    (FIXED_PITCH.0 as u32) | (FF_MODERN.0 as u32),
                    PCWSTR::from_raw(fuente_nombre.as_mut_ptr()),
                );

                let alto_linea = (alto_fuente.abs() * 6) / 5; // interlineado ~1.2x
                let mut y = margen;

                // StartPage/EndPage reinician los atributos del DC (fuente, modo de fondo) a sus
                // valores por defecto — es un comportamiento documentado de GDI, no un descuido.
                // Seleccionarlos ANTES del primer StartPage (como hacía esta función antes) hacía
                // que el texto se dibujara con la fuente por defecto del driver en vez de la elegida
                // aquí: como el alto de línea se calcula a partir de la fuente pedida y no de la que
                // terminó usándose, el texto de más abajo (los totales) podía quedar recortado o
                // fuera del área imprimible. Por eso la fuente se reselecciona DESPUÉS de cada
                // StartPage, incluida la primera página.
                let _ = StartPage(hdc);
                let fuente_anterior = SelectObject(hdc, fuente.into());
                let _ = SetBkMode(hdc, TRANSPARENT);

                for linea in lineas {
                    if y > alto_pagina - margen {
                        let _ = EndPage(hdc);
                        let _ = StartPage(hdc);
                        SelectObject(hdc, fuente.into());
                        let _ = SetBkMode(hdc, TRANSPARENT);
                        y = margen;
                    }
                    let texto: Vec<u16> = linea.encode_utf16().collect();
                    let _ = TextOutW(hdc, margen, y, &texto);
                    y += alto_linea;
                }
                let _ = EndPage(hdc);

                SelectObject(hdc, fuente_anterior);
                let _ = DeleteObject(fuente.into());
                let _ = EndDoc(hdc);
                Ok(())
            })();

            let _ = DeleteDC(hdc);
            resultado
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod win {
    pub fn listar() -> Result<Vec<String>, String> {
        Err("La impresión térmica solo está implementada para Windows.".into())
    }

    pub fn imprimir_raw(_nombre_impresora: &str, _datos: &[u8]) -> Result<(), String> {
        Err("La impresión térmica solo está implementada para Windows.".into())
    }

    pub fn imprimir_texto(_nombre_impresora: Option<&str>, _lineas: &[String]) -> Result<(), String> {
        Err("La impresión solo está implementada para Windows.".into())
    }
}

#[tauri::command]
pub fn listar_impresoras() -> Result<Vec<String>, String> {
    win::listar()
}

#[tauri::command]
pub fn imprimir_ticket_termico(impresora: String, datos: Vec<u8>) -> Result<(), String> {
    win::imprimir_raw(&impresora, &datos)
}

#[tauri::command]
pub fn imprimir_texto_generico(lineas: Vec<String>, impresora: Option<String>) -> Result<(), String> {
    win::imprimir_texto(impresora.as_deref(), &lineas)
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    /// Smoke test contra el Spooler real de Windows (no una térmica en particular):
    /// confirma que EnumPrintersW/OpenPrinterW funcionan en esta máquina antes de
    /// confiar en ellos para una impresora física conectada más tarde.
    #[test]
    fn enumera_impresoras_sin_fallar() {
        let impresoras = listar_impresoras().expect("EnumPrintersW debería funcionar en cualquier Windows");
        println!("Impresoras detectadas por Windows: {impresoras:?}");
        assert!(!impresoras.is_empty(), "se esperaba al menos una impresora virtual (PDF/XPS/Fax)");
    }

    #[test]
    fn imprimir_en_impresora_inexistente_da_error_legible() {
        let resultado = imprimir_ticket_termico("___impresora_que_no_existe___".into(), vec![0x1b, 0x40]);
        assert!(resultado.is_err());
    }

    /// Verificación manual con la térmica física ya conectada — no se corre en
    /// la suite normal (depende del nombre exacto de una impresora real en esta
    /// máquina). Ejecutar a mano con `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn imprime_ticket_real_en_epson_conectada() {
        let mut datos: Vec<u8> = vec![0x1b, 0x40]; // ESC @ inicializar
        datos.extend([0x1b, 0x61, 0x01]); // ESC a 1: centrar
        datos.extend([0x1b, 0x45, 0x01]); // ESC E 1: negrita on
        datos.extend(b"PRUEBA DESDE RUST\n");
        datos.extend([0x1b, 0x45, 0x00]); // negrita off
        datos.extend(b"Sistema de Facturacion\n");
        datos.extend(b"Si ves esto impreso y el\n");
        datos.extend(b"papel se corto solo, todo\n");
        datos.extend(b"funciona correctamente.\n");
        datos.extend([0x0a, 0x0a, 0x0a]);
        datos.extend([0x1d, 0x56, 0x01]); // GS V 1: cortar

        imprimir_ticket_termico("EPSON TM-T88V Receipt".into(), datos)
            .expect("debería imprimir en la EPSON TM-T88V ya registrada como impresora de Windows");
    }

    /// Calibración manual: imprime líneas de largo creciente (con su longitud
    /// como prefijo) para determinar a ojo cuántos caracteres por línea caben
    /// de verdad en el papel instalado, en vez de asumir el estándar de 42/32.
    /// Ejecutar con `cargo test -- --ignored --nocapture calibra_ancho`.
    #[test]
    #[ignore]
    fn calibra_ancho_de_papel() {
        let mut datos: Vec<u8> = vec![0x1b, 0x40];
        for largo in [28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48] {
            let prefijo = format!("{largo:02}:");
            let guiones = "-".repeat(largo - prefijo.len());
            datos.extend((prefijo + &guiones).bytes());
            datos.push(0x0a);
        }
        datos.extend([0x0a, 0x0a, 0x0a]);
        datos.extend([0x1d, 0x56, 0x01]);

        imprimir_ticket_termico("EPSON TM-T88V Receipt".into(), datos)
            .expect("debería imprimir en la EPSON TM-T88V ya registrada como impresora de Windows");
    }

    /// Imprime un PDF real de prueba a través del mismo camino RAW que usaría una
    /// térmica — con "Microsoft Print to PDF" instalado en Windows, esto verifica
    /// OpenPrinterW/StartDocPrinterW/WritePrinter end-to-end (aunque el resultado
    /// para una impresora no-RAW como esta no sea un ticket legible).
    #[test]
    fn imprimir_en_impresora_virtual_no_falla() {
        let impresoras = listar_impresoras().unwrap();
        let Some(pdf) = impresoras.iter().find(|n| n.contains("PDF")) else {
            eprintln!("No hay 'Microsoft Print to PDF' instalado, se omite.");
            return;
        };
        imprimir_ticket_termico(pdf.clone(), b"prueba de escritura RAW".to_vec())
            .expect("WritePrinter debería aceptar bytes crudos en cualquier impresora instalada");
    }

    /// Verificación real del camino GDI (`imprimir_texto_generico`, el respaldo silencioso sin
    /// térmica ESC/POS): imprime un recibo de mentira con varias líneas de artículos y, al final,
    /// los totales — igual que un ticket real — a "Microsoft Print to PDF" con la salida
    /// redirigida a un archivo, para poder abrir el PDF resultante y confirmar a ojo que los
    /// totales sí aparecen (el bug reportado era que no aparecían). No corre en la suite normal
    /// porque depende de esa impresora virtual estando instalada.
    #[test]
    #[ignore]
    fn imprime_texto_con_totales_a_pdf() {
        let impresoras = listar_impresoras().unwrap();
        let Some(pdf) = impresoras.iter().find(|n| n.contains("PDF")) else {
            eprintln!("No hay 'Microsoft Print to PDF' instalado, se omite.");
            return;
        };

        let mut lineas: Vec<String> = vec![
            "Colmado La Esperanza".into(),
            "RNC: 101023122".into(),
            "Calle Duarte #45, Santiago".into(),
            "----------------------------------------------".into(),
            "Ticket #8              13/08/2026 05:20 p. m.".into(),
            "----------------------------------------------".into(),
        ];
        for i in 1..=5 {
            lineas.push(format!("Producto de prueba {i}"));
            lineas.push("1 x 150.00                              150.00".to_string());
        }
        lineas.push("----------------------------------------------".into());
        lineas.push("Gravado                              RD$ 636.36".into());
        lineas.push("Exento                                 RD$ 0.00".into());
        lineas.push("ITBIS                                RD$ 113.64".into());
        lineas.push("TOTAL                                RD$ 750.00".into());
        lineas.push("----------------------------------------------".into());
        lineas.push("Efectivo                             RD$ 750.00".into());
        lineas.push("Pagado                               RD$ 750.00".into());
        lineas.push("Cambio                                 RD$ 0.00".into());
        lineas.push("----------------------------------------------".into());
        lineas.push("Gracias por su compra!".into());

        let salida = r"C:\Users\saint\AppData\Local\Temp\claude\C--Users-saint-Desktop-Bootcamp-Builder-AA-sistemaDeFacturacionReal\611f880a-1ae3-4019-8fde-9c5982910726\scratchpad\prueba_recibo_totales.pdf";
        let _ = std::fs::remove_file(salida);

        win::imprimir_texto_interno(Some(pdf), &lineas, Some(salida))
            .expect("debería imprimir a PDF sin fallar");

        let metadata = std::fs::metadata(salida).expect("el PDF debería haberse creado");
        println!("PDF generado en {salida} ({} bytes)", metadata.len());
        assert!(metadata.len() > 0, "el PDF no debería estar vacío");
    }
}
