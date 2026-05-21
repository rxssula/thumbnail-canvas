export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export type ElementType = "text" | "image";

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  content: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  align: CanvasTextAlign;
  lineHeight: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
  objectFit: "cover" | "contain" | "fill";
}

export type CanvasElement = TextElement | ImageElement;

export function createTextElement(overrides?: Partial<TextElement>): TextElement {
  return {
    id: crypto.randomUUID(),
    type: "text",
    x: CANVAS_WIDTH / 2 - 200,
    y: CANVAS_HEIGHT / 2 - 50,
    width: 400,
    height: 100,
    rotation: 0,
    content: "New Text",
    fontSize: 48,
    color: "#000000",
    backgroundColor: "transparent",
    align: "center",
    lineHeight: 1.2,
    ...overrides,
  };
}

export function createImageElement(src: string, overrides?: Partial<ImageElement>): ImageElement {
  return {
    id: crypto.randomUUID(),
    type: "image",
    x: CANVAS_WIDTH / 2 - 150,
    y: CANVAS_HEIGHT / 2 - 150,
    width: 300,
    height: 300,
    rotation: 0,
    src,
    objectFit: "cover",
    ...overrides,
  };
}

export function isPointInElement(
  px: number,
  py: number,
  el: CanvasElement
): boolean {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rad = (-el.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return (
    rx >= -el.width / 2 &&
    rx <= el.width / 2 &&
    ry >= -el.height / 2 &&
    ry <= el.height / 2
  );
}
