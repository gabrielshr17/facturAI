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
    use windows::core::PWSTR;
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW,
        StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_LOCAL,
        PRINTER_HANDLE, PRINTER_INFO_4W,
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
}

#[cfg(not(target_os = "windows"))]
mod win {
    pub fn listar() -> Result<Vec<String>, String> {
        Err("La impresión térmica solo está implementada para Windows.".into())
    }

    pub fn imprimir_raw(_nombre_impresora: &str, _datos: &[u8]) -> Result<(), String> {
        Err("La impresión térmica solo está implementada para Windows.".into())
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
}
