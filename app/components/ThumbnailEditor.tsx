"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useHistory } from "@/app/hooks/useHistory";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  type CanvasElement,
  type TextElement,
  type ImageElement,
  createTextElement,
  createImageElement,
  isPointInElement,
} from "@/app/lib/thumbnail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  RiAddLine,
  RiImageLine,
  RiText,
  RiDeleteBinLine,
  RiDownloadLine,
  RiStackLine,
  RiSettings3Line,
  RiBringToFront,
  RiSendToBack,
  RiArrowUpLine,
  RiArrowDownLine,
  RiZoomInLine,
  RiZoomOutLine,
  RiResetLeftLine,
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
} from "@remixicon/react";
import { getCachedImage, preloadImage } from "@/app/lib/image-cache";

type DragState = {
  elementId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
} | null;

type ResizeState = {
  elementId: string;
  handle: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
} | null;

type GuideState = {
  vertical: number | null;
  horizontal: number | null;
};

export default function ThumbnailEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    present,
    set,
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<{ elements: CanvasElement[]; backgroundColor: string }>({
    elements: [],
    backgroundColor: "#ffffff",
  });

  const elements = present.elements;
  const backgroundColor = present.backgroundColor;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setElements = useCallback(
    (updater: React.SetStateAction<CanvasElement[]>) => {
      set((prev) => ({
        ...prev,
        elements:
          typeof updater === "function"
            ? (updater as (prev: CanvasElement[]) => CanvasElement[])(
                prev.elements
              )
            : updater,
      }));
    },
    [set]
  );

  const setBackgroundColor = useCallback(
    (value: string) => {
      set((prev) => ({ ...prev, backgroundColor: value }));
    },
    [set]
  );
  const [dragState, setDragState] = useState<DragState>(null);
  const [resizeState, setResizeState] = useState<ResizeState>(null);
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [imageVersion, setImageVersion] = useState(0);
  const [guides, setGuides] = useState<GuideState>({ vertical: null, horizontal: null });

  const selectedElement = elements.find((el) => el.id === selectedId) ?? null;

  // Force canvas redraw when images finish loading
  useEffect(() => {
    const onImageLoad = () => setImageVersion((v) => v + 1);
    window.addEventListener("image-loaded", onImageLoad);
    return () => window.removeEventListener("image-loaded", onImageLoad);
  }, []);

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      };
    },
    [scale]
  );

  const findElementAt = useCallback(
    (x: number, y: number): CanvasElement | null => {
      for (let i = elements.length - 1; i >= 0; i--) {
        if (isPointInElement(x, y, elements[i])) return elements[i];
      }
      return null;
    },
    [elements]
  );

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (const el of elements) {
      ctx.save();
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-el.width / 2, -el.height / 2);

      if (el.type === "text") {
        drawTextElement(ctx, el);
      } else {
        drawImageElement(ctx, el);
      }

      ctx.restore();
    }

    if (selectedId) {
      const sel = elements.find((e) => e.id === selectedId);
      if (sel) drawSelection(ctx, sel);
    }

    // Draw alignment guides
    if (guides.vertical !== null) {
      ctx.save();
      ctx.strokeStyle = "rgba(212, 163, 115, 0.9)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(guides.vertical, 0);
      ctx.lineTo(guides.vertical, CANVAS_HEIGHT);
      ctx.stroke();
      ctx.restore();
    }
    if (guides.horizontal !== null) {
      ctx.save();
      ctx.strokeStyle = "rgba(212, 163, 115, 0.9)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, guides.horizontal);
      ctx.lineTo(CANVAS_WIDTH, guides.horizontal);
      ctx.stroke();
      ctx.restore();
    }
  }, [elements, selectedId, backgroundColor, imageVersion, guides]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      if (!container) return;
      const maxW = container.clientWidth - 32;
      const maxH = container.clientHeight - 32;
      const s = Math.min(maxW / CANVAS_WIDTH, maxH / CANVAS_HEIGHT, 0.55);
      setFitScale(s);
      setScale(s);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const zoomIn = () => setScale((s) => Math.min(s * 1.2, 5));
  const zoomOut = () => setScale((s) => Math.max(s / 1.2, 0.1));
  const zoomReset = () => setScale(fitScale);

  // Native wheel listener with { passive: false } so we can preventDefault()
  // and stop the browser from zooming the whole page on Ctrl+wheel / trackpad pinch
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          setScale((s) => Math.min(s * 1.1, 5));
        } else if (e.deltaY > 0) {
          setScale((s) => Math.max(s / 1.1, 0.1));
        }
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  // Load persisted state or initialize with default text
  useEffect(() => {
    let loaded = false;
    const saved = localStorage.getItem("thumbnail-editor-state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.elements) && parsed.elements.length > 0) {
          set((prev) => ({ ...prev, elements: parsed.elements }));
          loaded = true;
        }
        if (parsed.backgroundColor) {
          set((prev) => ({ ...prev, backgroundColor: parsed.backgroundColor }));
        }
      } catch {
        // ignore parse errors
      }
    }
    if (!loaded) {
      const el = createTextElement({
        content: "Thumbnail Title",
        fontSize: 72,
        x: CANVAS_WIDTH / 2 - 300,
        y: CANVAS_HEIGHT / 2 - 60,
        width: 600,
        height: 120,
        color: "#111111",
      });
      set((prev) => ({ ...prev, elements: [el] }));
    }
  }, []);

  // Persist state to localStorage
  useEffect(() => {
    const state = { elements, backgroundColor };
    localStorage.setItem("thumbnail-editor-state", JSON.stringify(state));
  }, [elements, backgroundColor]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pt = getCanvasPoint(e.clientX, e.clientY);
      const clicked = findElementAt(pt.x, pt.y);

      if (clicked) {
        setSelectedId(clicked.id);
        commit();

        const handle = getResizeHandle(pt.x, pt.y, clicked);
        if (handle) {
          setResizeState({
            elementId: clicked.id,
            handle,
            startX: pt.x,
            startY: pt.y,
            origX: clicked.x,
            origY: clicked.y,
            origW: clicked.width,
            origH: clicked.height,
          });
          return;
        }

        setDragState({
          elementId: clicked.id,
          startX: pt.x,
          startY: pt.y,
          origX: clicked.x,
          origY: clicked.y,
        });
      } else {
        setSelectedId(null);
      }
    },
    [getCanvasPoint, findElementAt]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pt = getCanvasPoint(e.clientX, e.clientY);

      if (resizeState) {
        const dx = pt.x - resizeState.startX;
        const dy = pt.y - resizeState.startY;
        setElements((prev) =>
          prev.map((el) => {
            if (el.id !== resizeState.elementId) return el;
            let { x, y, width, height } = el;
            const h = resizeState.handle;

            if (h.includes("e")) width = Math.max(20, resizeState.origW + dx);
            if (h.includes("w")) {
              const nw = Math.max(20, resizeState.origW - dx);
              x = resizeState.origX + resizeState.origW - nw;
              width = nw;
            }
            if (h.includes("s")) height = Math.max(20, resizeState.origH + dy);
            if (h.includes("n")) {
              const nh = Math.max(20, resizeState.origH - dy);
              y = resizeState.origY + resizeState.origH - nh;
              height = nh;
            }

            if (el.type === "text") {
              const textEl = el as TextElement;
              return { ...textEl, x, y, width, height };
            }
            return { ...(el as ImageElement), x, y, width, height };
          })
        );
        return;
      }

      if (dragState) {
        const dx = pt.x - dragState.startX;
        const dy = pt.y - dragState.startY;
        const rawX = dragState.origX + dx;
        const rawY = dragState.origY + dy;
        const el = elements.find((e) => e.id === dragState.elementId);

        let finalX = rawX;
        let finalY = rawY;
        let newGuides: GuideState = { vertical: null, horizontal: null };

        if (el) {
          const snap = computeSnap(el, rawX, rawY, elements);
          finalX = snap.x;
          finalY = snap.y;
          newGuides = { vertical: snap.vertical, horizontal: snap.horizontal };
        }

        setGuides(newGuides);
        setElements((prev) =>
          prev.map((el) =>
            el.id === dragState.elementId
              ? { ...el, x: finalX, y: finalY }
              : el
          )
        );
        return;
      }

      const hovered = findElementAt(pt.x, pt.y);
      setHoveredId(hovered?.id ?? null);

      const canvas = canvasRef.current;
      if (canvas) {
        if (hovered) {
          const handle = getResizeHandle(pt.x, pt.y, hovered);
          if (handle) {
            canvas.style.cursor = getResizeCursor(handle);
          } else {
            canvas.style.cursor = "move";
          }
        } else {
          canvas.style.cursor = "default";
        }
      }
    },
    [dragState, resizeState, getCanvasPoint, findElementAt, elements]
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
    setResizeState(null);
    setGuides({ vertical: null, horizontal: null });
  }, []);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    commit();
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, commit, setElements]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const isEditing =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedId &&
        !isEditing
      ) {
        handleDelete();
      }

      if (
        !isEditing &&
        (e.metaKey || e.ctrlKey) &&
        e.key === "z" &&
        !e.shiftKey
      ) {
        e.preventDefault();
        undo();
      }
      if (
        !isEditing &&
        (e.metaKey || e.ctrlKey) &&
        ((e.key === "z" && e.shiftKey) || e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, handleDelete, undo, redo]);

  const addText = () => {
    commit();
    const el = createTextElement();
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        let w = 400;
        let h = w / aspect;
        if (h > 400) {
          h = 400;
          w = h * aspect;
        }
        const el = createImageElement(src, {
          width: w,
          height: h,
          x: CANVAS_WIDTH / 2 - w / 2,
          y: CANVAS_HEIGHT / 2 - h / 2,
        });
        commit();
        setElements((prev) => [...prev, el]);
        setSelectedId(el.id);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "thumbnail.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const moveLayer = (id: string, direction: "up" | "down") => {
    commit();
    setElements((prev) => {
      const idx = prev.findIndex((el) => el.id === id);
      if (idx === -1) return prev;
      if (direction === "up" && idx < prev.length - 1) {
        const next = [...prev];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        return next;
      }
      if (direction === "down" && idx > 0) {
        const next = [...prev];
        [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
        return next;
      }
      return prev;
    });
  };

  const bringToFront = (id: string) => {
    commit();
    setElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (!el) return prev;
      return [...prev.filter((e) => e.id !== id), el];
    });
  };

  const sendToBack = (id: string) => {
    commit();
    setElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (!el) return prev;
      return [el, ...prev.filter((e) => e.id !== id)];
    });
  };

  const updateElement = <T extends CanvasElement>(
    id: string,
    updates: Partial<T>
  ) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id ? ({ ...el, ...updates } as T) : el))
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0c0c0c] text-[#e8e8e8]">
      {/* Left Sidebar */}
      <div className="w-64 flex flex-col border-r border-[#1f1f1f] bg-[#111111]">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-[#1f1f1f]">
          <div className="w-2 h-2 rounded-full bg-[#d4a373]" />
          <span className="text-xs font-medium tracking-widest uppercase text-[#888] whitespace-nowrap">
            Thumbnail Maker
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-wider text-[#666]">
              Add Elements
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={addText}
                className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] hover:border-[#3a3a3a] text-[#ccc] text-xs h-9"
              >
                <RiText className="w-3.5 h-3.5 mr-1.5" />
                Text
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  document.getElementById("image-upload")?.click()
                }
                className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] hover:border-[#3a3a3a] text-[#ccc] text-xs h-9"
              >
                <RiImageLine className="w-3.5 h-3.5 mr-1.5" />
                Image
              </Button>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
          </div>

          <Separator className="bg-[#222]" />

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-wider text-[#666]">
              Background
            </Label>
            <div className="flex gap-2">
              <input
                type="color"
                value={backgroundColor}
                onFocus={() => commit()}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-8 h-8 rounded border-0 p-0 bg-transparent cursor-pointer"
              />
              <Input
                value={backgroundColor}
                onFocus={() => commit()}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="flex-1 h-8 bg-[#1a1a1a] border-[#2a2a2a] text-xs text-[#ccc]"
              />
            </div>
          </div>

          <Separator className="bg-[#222]" />

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <RiStackLine className="w-3.5 h-3.5 text-[#666]" />
              <Label className="text-[10px] uppercase tracking-wider text-[#666]">
                Layers
              </Label>
            </div>
            <div className="space-y-1">
              {elements.length === 0 && (
                <div className="text-[10px] text-[#444] py-2 text-center">
                  No layers yet
                </div>
              )}
              {[...elements].reverse().map((el) => (
                <button
                  key={el.id}
                  onClick={() => setSelectedId(el.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] flex items-center gap-2 transition-colors ${
                    selectedId === el.id
                      ? "bg-[#d4a373]/10 text-[#d4a373] border border-[#d4a373]/20"
                      : "text-[#888] hover:bg-[#1a1a1a] border border-transparent"
                  }`}
                >
                  {el.type === "text" ? (
                    <RiText className="w-3 h-3 shrink-0" />
                  ) : (
                    <RiImageLine className="w-3 h-3 shrink-0" />
                  )}
                  <span className="truncate">
                    {el.type === "text"
                      ? (el as TextElement).content
                      : "Image"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-[#1f1f1f]">
          <Button
            onClick={download}
            className="w-full h-9 bg-[#d4a373] text-[#111] hover:bg-[#c49464] text-xs font-medium"
          >
            <RiDownloadLine className="w-3.5 h-3.5 mr-1.5" />
            Export PNG
          </Button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 h-12 border-b border-[#1f1f1f]">
          <span className="text-xs font-medium tracking-widest uppercase text-[#888]">
            {CANVAS_WIDTH} × {CANVAS_HEIGHT} px
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#666] w-12 text-right">
              {Math.round((scale / fitScale) * 100)}%
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                variant="outline"
                size="sm"
                onClick={zoomOut}
                className="h-7 w-7 p-0 border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] text-[#ccc]"
              >
                <RiZoomOutLine className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={zoomReset}
                className="h-7 w-7 p-0 border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] text-[#ccc]"
              >
                <RiResetLeftLine className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={zoomIn}
                className="h-7 w-7 p-0 border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] text-[#ccc]"
              >
                <RiZoomInLine className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={!canUndo}
                className="h-7 w-7 p-0 border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] text-[#ccc] disabled:opacity-30"
              >
                <RiArrowGoBackLine className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={redo}
                disabled={!canRedo}
                className="h-7 w-7 p-0 border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] text-[#ccc] disabled:opacity-30"
              >
                <RiArrowGoForwardLine className="w-3.5 h-3.5" />
              </Button>
            </div>
            <span className="text-xs font-medium tracking-widest uppercase text-[#888]">
              {elements.length} element{elements.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-[#0a0a0a] p-4 flex items-center justify-center"
          style={{ touchAction: "none" }}
        >
          <div className="relative shadow-2xl shadow-black shrink-0">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              style={{
                width: CANVAS_WIDTH * scale,
                height: CANVAS_HEIGHT * scale,
                imageRendering: "auto",
              }}
              className="block cursor-default"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            {/* Pixel grid overlay for dark backgrounds */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
                backgroundSize: `${40 * scale}px ${40 * scale}px`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Right Sidebar - Properties */}
      <div className="w-64 flex flex-col border-l border-[#1f1f1f] bg-[#111111]">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-[#1f1f1f]">
          <RiSettings3Line className="w-3.5 h-3.5 text-[#666]" />
          <span className="text-xs font-medium tracking-widest uppercase text-[#888]">
            Properties
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!selectedElement && (
            <div className="text-[10px] text-[#444] text-center py-8">
              Select an element to edit its properties
            </div>
          )}

          {selectedElement && (
            <div className="space-y-4">
              {/* Common: Position & Size */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-[#666]">
                  Position & Size
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[9px] text-[#555]">X</Label>
                    <Input
                      type="number"
                      value={Math.round(selectedElement.x)}
                      onFocus={() => commit()}
                      onChange={(e) =>
                        updateElement(selectedElement.id, {
                          x: Number(e.target.value),
                        })
                      }
                      className="h-7 bg-[#1a1a1a] border-[#2a2a2a] text-xs text-[#ccc]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] text-[#555]">Y</Label>
                    <Input
                      type="number"
                      value={Math.round(selectedElement.y)}
                      onFocus={() => commit()}
                      onChange={(e) =>
                        updateElement(selectedElement.id, {
                          y: Number(e.target.value),
                        })
                      }
                      className="h-7 bg-[#1a1a1a] border-[#2a2a2a] text-xs text-[#ccc]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] text-[#555]">W</Label>
                    <Input
                      type="number"
                      value={Math.round(selectedElement.width)}
                      onFocus={() => commit()}
                      onChange={(e) =>
                        updateElement(selectedElement.id, {
                          width: Number(e.target.value),
                        })
                      }
                      className="h-7 bg-[#1a1a1a] border-[#2a2a2a] text-xs text-[#ccc]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] text-[#555]">H</Label>
                    <Input
                      type="number"
                      value={Math.round(selectedElement.height)}
                      onFocus={() => commit()}
                      onChange={(e) =>
                        updateElement(selectedElement.id, {
                          height: Number(e.target.value),
                        })
                      }
                      className="h-7 bg-[#1a1a1a] border-[#2a2a2a] text-xs text-[#ccc]"
                    />
                  </div>
                </div>
              </div>

              <Separator className="bg-[#222]" />

              {/* Layer Ordering */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-[#666]">
                  Layer
                </Label>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      commit();
                      sendToBack(selectedElement.id);
                    }}
                    className="flex-1 h-7 border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] text-[#888] text-[10px]"
                  >
                    <RiSendToBack className="w-3 h-3 mr-1" />
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      commit();
                      moveLayer(selectedElement.id, "down");
                    }}
                    className="flex-1 h-7 border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] text-[#888] text-[10px]"
                  >
                    <RiArrowDownLine className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      commit();
                      moveLayer(selectedElement.id, "up");
                    }}
                    className="flex-1 h-7 border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] text-[#888] text-[10px]"
                  >
                    <RiArrowUpLine className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      commit();
                      bringToFront(selectedElement.id);
                    }}
                    className="flex-1 h-7 border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#252525] text-[#888] text-[10px]"
                  >
                    <RiBringToFront className="w-3 h-3 mr-1" />
                    Front
                  </Button>
                </div>
              </div>

              <Separator className="bg-[#222]" />

              {/* Type-specific properties */}
              {selectedElement.type === "text" && (
                <TextProperties
                  element={selectedElement as TextElement}
                  onChange={(updates) =>
                    updateElement<TextElement>(selectedElement.id, updates)
                  }
                  commit={commit}
                />
              )}
              {selectedElement.type === "image" && (
                <ImageProperties
                  element={selectedElement as ImageElement}
                  onChange={(updates) =>
                    updateElement<ImageElement>(selectedElement.id, updates)
                  }
                  commit={commit}
                />
              )}

              <Separator className="bg-[#222]" />

              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="w-full h-8 border-red-900/40 bg-red-950/20 text-red-400 hover:bg-red-950/40 hover:text-red-300 text-xs"
              >
                <RiDeleteBinLine className="w-3.5 h-3.5 mr-1.5" />
                Delete Element
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TextProperties({
  element,
  onChange,
  commit,
}: {
  element: TextElement;
  onChange: (u: Partial<TextElement>) => void;
  commit: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-[#666]">
          Content
        </Label>
        <textarea
          value={element.content}
          onFocus={() => commit()}
          onChange={(e) => onChange({ content: e.target.value })}
          rows={3}
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-2.5 py-1.5 text-[11px] text-[#ccc] resize-none focus:outline-none focus:ring-1 focus:ring-[#d4a373]/30"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[9px] text-[#555]">Font Size</Label>
          <Input
            type="number"
            min={8}
            max={200}
            value={element.fontSize}
            onFocus={() => commit()}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="h-7 bg-[#1a1a1a] border-[#2a2a2a] text-xs text-[#ccc]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[9px] text-[#555]">Line Height</Label>
          <Input
            type="number"
            min={0.8}
            max={3}
            step={0.1}
            value={element.lineHeight}
            onFocus={() => commit()}
            onChange={(e) => onChange({ lineHeight: Number(e.target.value) })}
            className="h-7 bg-[#1a1a1a] border-[#2a2a2a] text-xs text-[#ccc]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[9px] text-[#555]">Color</Label>
          <div className="flex gap-1.5">
            <input
              type="color"
              value={element.color}
              onFocus={() => commit()}
              onChange={(e) => onChange({ color: e.target.value })}
              className="w-6 h-6 rounded border-0 p-0 bg-transparent cursor-pointer shrink-0"
            />
            <Input
              value={element.color}
              onFocus={() => commit()}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-6 bg-[#1a1a1a] border-[#2a2a2a] text-[10px] text-[#ccc] px-1.5"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[9px] text-[#555]">Background</Label>
          <div className="flex gap-1.5">
            <input
              type="color"
              value={element.backgroundColor === "transparent" ? "#000000" : element.backgroundColor}
              onFocus={() => commit()}
              onChange={(e) => onChange({ backgroundColor: e.target.value })}
              className="w-6 h-6 rounded border-0 p-0 bg-transparent cursor-pointer shrink-0"
            />
            <Input
              value={element.backgroundColor}
              onFocus={() => commit()}
              onChange={(e) => onChange({ backgroundColor: e.target.value })}
              className="h-6 bg-[#1a1a1a] border-[#2a2a2a] text-[10px] text-[#ccc] px-1.5"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[9px] text-[#555]">Align</Label>
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              onClick={() => {
                commit();
                onChange({ align });
              }}
              className={`flex-1 py-1 text-[10px] rounded border transition-colors ${
                element.align === align
                  ? "bg-[#d4a373]/10 border-[#d4a373]/30 text-[#d4a373]"
                  : "bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:bg-[#252525]"
              }`}
            >
              {align === "left" && "Left"}
              {align === "center" && "Center"}
              {align === "right" && "Right"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImageProperties({
  element,
  onChange,
  commit,
}: {
  element: ImageElement;
  onChange: (u: Partial<ImageElement>) => void;
  commit: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-[#666]">
          Object Fit
        </Label>
        <div className="flex gap-1">
          {(["cover", "contain", "fill"] as const).map((fit) => (
            <button
              key={fit}
              onClick={() => {
                commit();
                onChange({ objectFit: fit });
              }}
              className={`flex-1 py-1 text-[10px] rounded border transition-colors ${
                element.objectFit === fit
                  ? "bg-[#d4a373]/10 border-[#d4a373]/30 text-[#d4a373]"
                  : "bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:bg-[#252525]"
              }`}
            >
              {fit.charAt(0).toUpperCase() + fit.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Canvas Drawing Helpers */

function drawTextElement(ctx: CanvasRenderingContext2D, el: TextElement) {
  // Auto-shrink font so all text fits inside the box, capped at the user-set fontSize
  const fontSize = computeFitFontSize(
    ctx,
    el.content,
    el.width,
    el.height,
    el.fontSize,
    el.lineHeight
  );

  const lines = wrapText(ctx, el.content, el.width, fontSize);
  const lineH = fontSize * el.lineHeight;
  const totalH = lines.length * lineH;

  if (el.backgroundColor && el.backgroundColor !== "transparent") {
    ctx.fillStyle = el.backgroundColor;
    ctx.fillRect(0, 0, el.width, el.height);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, el.width, el.height);
  ctx.clip();

  ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = el.color;
  ctx.textAlign = el.align;
  ctx.textBaseline = "middle";

  let x = el.width / 2;
  if (el.align === "left") x = 0;
  if (el.align === "right") x = el.width;

  const startY = (el.height - totalH) / 2 + lineH / 2;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineH);
  }
  ctx.restore();
}

function computeFitFontSize(
  ctx: CanvasRenderingContext2D,
  content: string,
  maxWidth: number,
  maxHeight: number,
  preferredSize: number,
  lineHeight: number
): number {
  let low = 4;
  let high = preferredSize;
  let best = 4;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const lines = wrapText(ctx, content, maxWidth, mid);
    const lineH = mid * lineHeight;
    const totalH = lines.length * lineH;

    let fits = totalH <= maxHeight;
    if (fits) {
      for (const line of lines) {
        if (ctx.measureText(line).width > maxWidth + 0.5) {
          fits = false;
          break;
        }
      }
    }

    if (fits) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number
): string[] {
  ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? currentLine + " " + word : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  if (lines.length === 0) lines.push(text);
  return lines;
}

function drawImageElement(ctx: CanvasRenderingContext2D, el: ImageElement) {
  const img = getCachedImage(el.src);
  if (!img) {
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.fillStyle = "#555";
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText("Loading...", el.width / 2, el.height / 2);
    preloadImage(el.src).then(() => {
      // Force re-render when image loads
      window.dispatchEvent(new Event("image-loaded"));
    });
    return;
  }

  const imgAspect = img.naturalWidth / img.naturalHeight;
  const elAspect = el.width / el.height;
  let sx = 0,
    sy = 0,
    sw = img.naturalWidth,
    sh = img.naturalHeight;
  let dx = 0,
    dy = 0,
    dw = el.width,
    dh = el.height;

  if (el.objectFit === "cover") {
    if (imgAspect > elAspect) {
      sw = img.naturalHeight * elAspect;
      sx = (img.naturalWidth - sw) / 2;
    } else {
      sh = img.naturalWidth / elAspect;
      sy = (img.naturalHeight - sh) / 2;
    }
  } else if (el.objectFit === "contain") {
    if (imgAspect > elAspect) {
      dh = el.width / imgAspect;
      dy = (el.height - dh) / 2;
    } else {
      dw = el.height * imgAspect;
      dx = (el.width - dw) / 2;
    }
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawSelection(ctx: CanvasRenderingContext2D, el: CanvasElement) {
  ctx.save();
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((el.rotation * Math.PI) / 180);
  ctx.translate(-el.width / 2, -el.height / 2);

  ctx.strokeStyle = "#d4a373";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(0, 0, el.width, el.height);
  ctx.setLineDash([]);

  const handleSize = 8;
  const handles = [
    { x: 0, y: 0 },
    { x: el.width / 2, y: 0 },
    { x: el.width, y: 0 },
    { x: el.width, y: el.height / 2 },
    { x: el.width, y: el.height },
    { x: el.width / 2, y: el.height },
    { x: 0, y: el.height },
    { x: 0, y: el.height / 2 },
  ];

  for (const h of handles) {
    ctx.fillStyle = "#d4a373";
    ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
  }

  ctx.restore();
}

function getResizeHandle(px: number, py: number, el: CanvasElement): string | null {
  const handleSize = 12 / 1;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rad = (-el.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  const rx = dx * cos - dy * sin + el.width / 2;
  const ry = dx * sin + dy * cos + el.height / 2;

  const handles: { key: string; x: number; y: number }[] = [
    { key: "nw", x: 0, y: 0 },
    { key: "n", x: el.width / 2, y: 0 },
    { key: "ne", x: el.width, y: 0 },
    { key: "e", x: el.width, y: el.height / 2 },
    { key: "se", x: el.width, y: el.height },
    { key: "s", x: el.width / 2, y: el.height },
    { key: "sw", x: 0, y: el.height },
    { key: "w", x: 0, y: el.height / 2 },
  ];

  for (const h of handles) {
    if (
      Math.abs(rx - h.x) <= handleSize &&
      Math.abs(ry - h.y) <= handleSize
    ) {
      return h.key;
    }
  }
  return null;
}

function getResizeCursor(handle: string): string {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  return "default";
}

const SNAP_THRESHOLD = 8;

function computeSnap(
  el: CanvasElement,
  rawX: number,
  rawY: number,
  allElements: CanvasElement[]
): { x: number; y: number; vertical: number | null; horizontal: number | null } {
  const vCandidates: { dist: number; value: number; guide: number }[] = [];
  const hCandidates: { dist: number; value: number; guide: number }[] = [];

  // Vertical alignment points on dragged element
  const vDrag = [
    { val: rawX + el.width / 2, snap: (t: number) => t - el.width / 2 },
    { val: rawX, snap: (t: number) => t },
    { val: rawX + el.width, snap: (t: number) => t - el.width },
  ];

  const vTargets = [CANVAS_WIDTH / 2];
  for (const other of allElements) {
    if (other.id === el.id) continue;
    vTargets.push(other.x + other.width / 2, other.x, other.x + other.width);
  }

  for (const dp of vDrag) {
    for (const target of vTargets) {
      const dist = Math.abs(dp.val - target);
      if (dist <= SNAP_THRESHOLD) {
        vCandidates.push({ dist, value: dp.snap(target), guide: target });
      }
    }
  }

  // Horizontal alignment points on dragged element
  const hDrag = [
    { val: rawY + el.height / 2, snap: (t: number) => t - el.height / 2 },
    { val: rawY, snap: (t: number) => t },
    { val: rawY + el.height, snap: (t: number) => t - el.height },
  ];

  const hTargets = [CANVAS_HEIGHT / 2];
  for (const other of allElements) {
    if (other.id === el.id) continue;
    hTargets.push(other.y + other.height / 2, other.y, other.y + other.height);
  }

  for (const dp of hDrag) {
    for (const target of hTargets) {
      const dist = Math.abs(dp.val - target);
      if (dist <= SNAP_THRESHOLD) {
        hCandidates.push({ dist, value: dp.snap(target), guide: target });
      }
    }
  }

  // Pick closest candidate per axis
  const bestV = vCandidates.sort((a, b) => a.dist - b.dist)[0] ?? null;
  const bestH = hCandidates.sort((a, b) => a.dist - b.dist)[0] ?? null;

  return {
    x: bestV ? bestV.value : rawX,
    y: bestH ? bestH.value : rawY,
    vertical: bestV ? bestV.guide : null,
    horizontal: bestH ? bestH.guide : null,
  };
}
