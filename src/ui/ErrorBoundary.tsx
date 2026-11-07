import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="fatal inline">
          <p>No se pudo mostrar el modelo 3D.</p>
          <small>{this.state.error.message}</small>
          <p>
            Comprueba que el navegador admite WebGL 2 y que el archivo GLB existe. Si es un modelo personalizado, revisa la
            ruta en <code>custom/catalog.json</code>.
          </p>
        </div>
      );
    return this.props.children;
  }
}
