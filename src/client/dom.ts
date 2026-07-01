// DOM lookup helpers used by main.ts to resolve its control elements at module
// scope. Extracted so the error branches can be unit-tested; main.ts only ever
// exercises the happy path (a missing element would fail its import outright).
export function getRequiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element;
}

export function getRequiredTypedElement<T extends HTMLElement>(id: string, elementType: new () => T): T {
  const element = getRequiredElement(id);
  if (!(element instanceof elementType)) {
    throw new TypeError(`Expected ${elementType.name} element: ${id}`);
  }

  return element;
}
