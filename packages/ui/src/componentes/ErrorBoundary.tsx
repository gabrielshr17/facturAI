import { Component, type ReactNode } from "react";
import { s, c } from "../estilos.js";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Red de seguridad para usuarios no técnicos (cajeros): sin esto, un error de
 * JavaScript en cualquier pantalla deja TODA la ventana en blanco sin ninguna
 * pista de qué pasó ni cómo seguir. `AppShell` la vuelve a montar por cada
 * módulo (key={activo}), así que cambiar de pantalla en la barra lateral ya
 * alcanza para salir de un error sin tener que reiniciar la aplicación.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Error atrapado por ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ ...s.tarjeta, maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
          <h3 style={{ marginTop: 0, color: c.rojo }}>Ocurrió un error inesperado</h3>
          <p style={{ color: c.gris, fontSize: 14 }}>
            Esta pantalla tuvo un problema. Puedes intentar con otra sección desde el menú de la
            izquierda, o reiniciar la aplicación si el problema sigue.
          </p>
          <button style={s.boton} onClick={() => window.location.reload()}>
            Reiniciar aplicación
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
