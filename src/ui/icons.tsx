/** Iconos de trazo simples (sin dependencias). */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
export const Icon = {
  coche: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M3 15.5v-3l2.2-4.3A2 2 0 0 1 7 7h10a2 2 0 0 1 1.8 1.2L21 12.5v3a1 1 0 0 1-1 1h-1.5" />
      <path d="M5.5 16.5H4a1 1 0 0 1-1-1M8.5 16.5h7" />
      <circle cx="7" cy="16.5" r="1.8" />
      <circle cx="17" cy="16.5" r="1.8" />
      <path d="M4.5 12h15" />
    </svg>
  ),
  pintura: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M12 3c3 4 6 7 6 10.5a6 6 0 0 1-12 0C6 10 9 7 12 3Z" />
      <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
    </svg>
  ),
  llanta: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 3v6.8M12 14.2V21M3 12h6.8M14.2 12H21M5.6 5.6l4.8 4.8M13.6 13.6l4.8 4.8M18.4 5.6l-4.8 4.8M10.4 13.6l-4.8 4.8" />
    </svg>
  ),
  suspension: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M12 2v3M12 19v3M8 5h8M8 19h8" />
      <path d="M9 7.5 15 9l-6 1.5 6 1.5-6 1.5 6 1.5-6 1.5" />
    </svg>
  ),
  entorno: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M3 18 9 9l4 6 3-4 5 7H3Z" />
      <circle cx="17" cy="6" r="2" />
    </svg>
  ),
  garaje: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M3 10 12 4l9 6v10H3V10Z" />
      <path d="M7 20v-6h10v6M7 17h10" />
    </svg>
  ),
  mas: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </svg>
  ),
  giro: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </svg>
  ),
  pantalla: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </svg>
  ),
  camara: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  centrar: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  ),
};
