"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils";

export type MapField = {
  id: string;
  code: string;
  name: string;
  geometry: GeoJSON.Polygon;
  centroidLat: number;
  centroidLng: number;
  /** Blue highlight (the log's field). */
  highlighted?: boolean;
  /** Red — restricted-entry interval still active. */
  reiActive?: boolean;
  /** Optional marker label under the field code. */
  label?: string;
};

type Props = {
  fields: MapField[];
  /** Fit the viewport to this field only (else all fields). */
  focusCode?: string;
  interactive?: boolean;
  showLabels?: boolean;
  onSelect?: (field: MapField) => void;
  className?: string;
};

// maplibre v6 spawns its worker as a module via `import.meta.url`, which the
// Next/Turbopack dev server can't serve. Serve the worker from /public instead
// (copied by the `postinstall` script; see package.json).
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
}

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

export function FieldMap({ fields, focusCode, interactive = true, showLabels = true, onSelect, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      interactive,
      attributionControl: { compact: true },
      center: [fields[0]?.centroidLng ?? -93.7, fields[0]?.centroidLat ?? 41.96],
      zoom: 14,
    });
    if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    // The container is often laid out after the map is created (dynamic import,
    // dialogs, expanding rows) — keep the canvas in sync with its box.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync data whenever fields / focus change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: fields.map((f) => ({
          type: "Feature",
          geometry: f.geometry,
          properties: { id: f.id, code: f.code, highlighted: !!f.highlighted, rei: !!f.reiActive },
        })),
      };

      const src = map.getSource("fields") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(fc);
      else {
        map.addSource("fields", { type: "geojson", data: fc });
        map.addLayer({
          id: "fields-fill",
          type: "fill",
          source: "fields",
          paint: {
            "fill-color": [
              "case",
              ["get", "highlighted"], "#3b82f6",
              ["get", "rei"], "#ef4444",
              "#ffffff",
            ],
            "fill-opacity": ["case", ["get", "highlighted"], 0.38, ["get", "rei"], 0.35, 0.08],
          },
        });
        map.addLayer({
          id: "fields-line",
          type: "line",
          source: "fields",
          paint: {
            "line-color": [
              "case",
              ["get", "highlighted"], "#93c5fd",
              ["get", "rei"], "#fca5a5",
              "#ffffff",
            ],
            "line-width": ["case", ["get", "highlighted"], 2.5, 1.5],
            "line-opacity": 0.9,
          },
        });
        if (interactive) {
          map.on("click", "fields-fill", (e) => {
            const id = e.features?.[0]?.properties?.id;
            const f = fields.find((x) => x.id === id);
            if (f) onSelectRef.current?.(f);
          });
          map.on("mouseenter", "fields-fill", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "fields-fill", () => (map.getCanvas().style.cursor = ""));
        }
      }

      // Markers: a dot on the highlighted field (as in the design), labels elsewhere.
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      for (const f of fields) {
        const el = document.createElement("div");
        if (f.highlighted) {
          el.className = "size-4 rounded-full border-[3px] border-white bg-blue-500 shadow";
        } else if (showLabels) {
          el.className =
            "rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white shadow backdrop-blur-sm whitespace-nowrap" +
            (f.reiActive ? " ring-1 ring-red-400" : "");
          el.textContent = f.label ? `${f.code} · ${f.label}` : f.code;
        } else continue;
        const m = new maplibregl.Marker({ element: el }).setLngLat([f.centroidLng, f.centroidLat]).addTo(map);
        markersRef.current.push(m);
      }

      // Fit viewport.
      const target = focusCode ? fields.filter((f) => f.code === focusCode) : fields;
      if (target.length) {
        const b = bounds(target.flatMap((f) => f.geometry.coordinates[0] as [number, number][]));
        map.fitBounds(b, { padding: focusCode ? 48 : 40, duration: 0, maxZoom: 16.5 });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [fields, focusCode, interactive, showLabels]);

  return <div ref={containerRef} className={cn("h-full w-full overflow-hidden rounded-xl", className)} />;
}

function bounds(coords: [number, number][]): LngLatBoundsLike {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}
