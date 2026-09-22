mod impresora;

use tauri_plugin_deep_link::DeepLinkExt;

// Punto de entrada de la app Tauri. Registra el plugin SQL (SQLite local),
// que expone la base de datos al frontend por la misma interfaz `SqlDriver`
// que implementa el paquete `core`.
pub fn run() {
    tauri::Builder::default()
        // Windows/Linux abren una instancia NUEVA del proceso al invocar el deep link — sin esto,
        // completar el login con la app ya abierta dejaría la sesión actualizada en una ventana
        // huérfana en vez de en la que el usuario está usando. `single-instance` va PRIMERO
        // (requisito de Tauri) y reenvía el `code` a la instancia ya corriendo vía
        // `handle_cli_arguments`, que dispara el mismo `onOpenUrl` del lado JS.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            app.deep_link().handle_cli_arguments(argv.into_iter());
        }))
        .plugin(tauri_plugin_sql::Builder::default().build())
        // Sign in with Google (§ Fase 2 opcional): `opener` abre la URL de Supabase/Google en el
        // navegador del sistema (Google bloquea el login dentro del WebView de la app), y
        // `deep-link` recibe de vuelta `facturai://auth-callback?code=...` — el `code` se
        // intercambia por la sesión en el lado JS (ver `completarInicioSesionDesktop`, @sfr/core).
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            impresora::listar_impresoras,
            impresora::imprimir_ticket_termico,
            impresora::imprimir_texto_generico
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Tauri");
}
