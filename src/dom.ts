// Utilidades de DOM y formato compartidas.

export const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Falta el elemento ${sel}`);
  return el;
};

// Los textos vienen de nuestro JSON, pero se escapan igual antes de ir a innerHTML.
export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export const fmt = (n: number, decimals: number): string =>
  n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
