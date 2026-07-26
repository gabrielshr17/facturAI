mod impresora;

// Punto de entrada de la app Tauri. Registra el plugin SQL (SQLite local),
// que expone la base de datos al frontend por la misma interfaz `SqlDriver`
// que implementa el paquete `core`.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            impresora::listar_impresoras,
            impresora::imprimir_ticket_termico
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Tauri");
}
