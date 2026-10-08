"use client";

/**
 * The eyes: MapLibre globe → Georgia → Atlanta, satellite or dark base,
 * optional 3D terrain, one point per property styled by the active mission.
 * Free sources only, each credited on the map: Esri World Imagery, CARTO dark
 * basemap (OpenStreetMap data), AWS Terrain Tiles (Mapzen terrarium).
 */
import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  score: number;
  /** 0–100 for the active mission (drives size + color). */
  focus: number;
  dim: boolean;
  label: string;
}

export type Basemap = "satellite" | "dark";

export interface CompPoint {
  id: string;
  lat: number;
  lng: number;
  renovated: boolean;
  label: string;
}

function compGeo(comps: CompPoint[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: comps.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lng, c.lat] }, properties: { renovated: c.renovated ? 1 : 0, label: c.label } })) };
}

const ATL: [number, number] = [-84.39, 33.75];

/**
 * Self-contained builds (the browser preview) can't reach tile servers, so they
 * ship terrain tiles inline and the map draws a shaded-relief basemap from them.
 */
let embedded: { tiles: Record<string, string>; bounds: [number, number, number, number]; minzoom: number; maxzoom: number } | null = null;
export function embedTerrain(e: NonNullable<typeof embedded>) {
  embedded = e;
  maplibregl.addProtocol("embedded", async (params) => {
    const key = params.url.replace("embedded://", "");
    const b64 = e.tiles[key];
    if (!b64) throw new Error(`no embedded tile ${key}`);
    return { data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer };
  });
}

function embeddedStyle(): maplibregl.StyleSpecification {
  const e = embedded!;
  return {
    version: 8,
    projection: { type: "globe" },
    sources: {
      dem: { type: "raster-dem", tiles: ["embedded://{z}/{x}/{y}"], tileSize: 256, encoding: "terrarium", bounds: e.bounds, minzoom: e.minzoom, maxzoom: e.maxzoom, attribution: "Terrain: AWS Terrain Tiles (Mapzen) · embedded" },
    },
    terrain: { source: "dem", exaggeration: 2.2 },
    sky: { "sky-color": "#04070F", "horizon-color": "#0B2A3A", "fog-color": "#04070F", "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 7, 0.4, 10, 0] },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#050B14" } },
      { id: "relief", type: "hillshade", source: "dem", paint: { "hillshade-shadow-color": "#01030A", "hillshade-highlight-color": "#2DD4BF", "hillshade-accent-color": "#0E7490", "hillshade-exaggeration": 0.85, "hillshade-illumination-direction": 315 } },
    ],
  };
}

function style(base: Basemap, terrain: boolean): maplibregl.StyleSpecification {
  if (embedded) return embeddedStyle();
  return {
    version: 8,
    projection: { type: "globe" },
    sources: {
      sat: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      },
      dark: {
        type: "raster",
        tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png", "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
        tileSize: 256,
        maxzoom: 20,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
      labels: {
        type: "raster",
        tiles: ["https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png"],
        tileSize: 256,
        maxzoom: 20,
      },
      ...(terrain
        ? {
            dem: {
              type: "raster-dem" as const,
              tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
              tileSize: 256,
              encoding: "terrarium" as const,
              maxzoom: 14,
              attribution: "Terrain: AWS Terrain Tiles (Mapzen)",
            },
          }
        : {}),
    },
    ...(terrain ? { terrain: { source: "dem", exaggeration: 1.6 } } : {}),
    sky: { "sky-color": "#04070F", "horizon-color": "#0B2A3A", "fog-color": "#04070F", "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 7, 0.4, 10, 0] },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#02040A" } },
      { id: "base", type: "raster", source: base === "satellite" ? "sat" : "dark", paint: base === "satellite" ? { "raster-saturation": -0.35, "raster-brightness-max": 0.8, "raster-contrast": 0.1 } : {} },
      ...(base === "satellite" ? [{ id: "labels", type: "raster" as const, source: "labels", paint: { "raster-opacity": 0.85 } }] : []),
    ],
  };
}

function toGeo(points: MapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({ type: "Feature", id: p.id, geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { id: p.id, score: p.score, focus: p.focus, dim: p.dim ? 1 : 0, label: p.label } })),
  };
}

function addLayers(map: MLMap, points: MapPoint[], comps: CompPoint[]) {
  if (map.getSource("props")) return;
  map.addSource("comps", { type: "geojson", data: compGeo(comps) });
  map.addLayer({
    id: "comps-dot",
    type: "circle",
    source: "comps",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 17, 7],
      "circle-color": ["case", ["==", ["get", "renovated"], 1], "#C9A84C", "#0F172A"],
      "circle-stroke-color": ["case", ["==", ["get", "renovated"], 1], "#FDE68A", "#94A3B8"],
      "circle-stroke-width": 1.5,
    },
  });
  map.addSource("props", { type: "geojson", data: toGeo(points), promoteId: "id" });
  map.addLayer({
    id: "props-halo",
    type: "circle",
    source: "props",
    filter: ["==", ["get", "dim"], 0],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, ["+", 4, ["/", ["get", "focus"], 12]], 16, ["+", 14, ["/", ["get", "focus"], 4]]],
      "circle-color": ["interpolate", ["linear"], ["get", "focus"], 0, "#0EA5E9", 50, "#F59E0B", 80, "#EF4444"],
      "circle-opacity": 0.18,
      "circle-blur": 0.6,
    },
  });
  map.addLayer({
    id: "props-dot",
    type: "circle",
    source: "props",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 16, 7],
      "circle-color": ["case", ["==", ["get", "dim"], 1], "#334155", ["interpolate", ["linear"], ["get", "focus"], 0, "#22D3EE", 50, "#FBBF24", 80, "#F87171"]],
      "circle-stroke-color": ["case", ["boolean", ["feature-state", "selected"], false], "#FFFFFF", "#020617"],
      "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 1],
      "circle-opacity": ["case", ["==", ["get", "dim"], 1], 0.45, 1],
    },
  });
}

export function GodsEyeMap({
  points,
  selectedId,
  onSelect,
  basemap,
  terrain,
  comps = [],
  home = { center: ATL, zoom: 10.6, pitch: 50 },
  selectZoom = 15.4,
}: {
  comps?: CompPoint[];
  /** Where the orbit → ground entrance lands, and how close a selection flies. */
  home?: { center: [number, number]; zoom: number; pitch: number };
  selectZoom?: number;
  points: MapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  basemap: Basemap;
  terrain: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const pointsRef = useRef(points);
  const compsRef = useRef(comps);
  compsRef.current = comps;
  const selRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  pointsRef.current = points;

  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: style(basemap, terrain),
      center: [-83.4, 32.7], // Georgia from orbit
      zoom: 2.2,
      pitch: 0,
      attributionControl: { compact: true },
      maxPitch: 80,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("style.load", () => {
      addLayers(map, pointsRef.current, compsRef.current);
      if (selRef.current) map.setFeatureState({ source: "props", id: selRef.current }, { selected: true });
    });
    map.once("load", () => {
      // Orbit → Georgia → Atlanta: the cinematic entrance.
      map.flyTo({ center: home.center, zoom: home.zoom, pitch: home.pitch, bearing: -18, duration: 4200, essential: true });
    });
    map.on("click", "props-dot", (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) onSelectRef.current(String(id));
    });
    map.on("mouseenter", "props-dot", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "props-dot", () => (map.getCanvas().style.cursor = ""));
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "ge-popup", offset: 10 });
    map.on("mousemove", "props-dot", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      popup.setLngLat(e.lngLat).setText(`${f.properties?.score} · ${f.properties?.label}`).addTo(map);
    });
    map.on("mouseleave", "props-dot", () => popup.remove());
    map.on("mousemove", "comps-dot", (e) => {
      const f = e.features?.[0];
      if (f) popup.setLngLat(e.lngLat).setText(`${f.properties?.renovated ? "◆ renovated comp" : "◇ as-is comp"} · ${f.properties?.label}`).addTo(map);
    });
    map.on("mouseleave", "comps-dot", () => popup.remove());
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const styled = useRef(`${basemap}:${terrain}`);
  useEffect(() => {
    const map = mapRef.current;
    const key = `${basemap}:${terrain}`;
    if (!map || styled.current === key) return; // the constructor already applied this style
    styled.current = key;
    map.setStyle(style(basemap, terrain));
  }, [basemap, terrain]);

  useEffect(() => {
    const src = mapRef.current?.getSource("props") as GeoJSONSource | undefined;
    src?.setData(toGeo(points));
  }, [points]);

  useEffect(() => {
    const src = mapRef.current?.getSource("comps") as GeoJSONSource | undefined;
    src?.setData(compGeo(comps));
  }, [comps]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const prev = selRef.current;
    selRef.current = selectedId;
    if (map.getSource("props")) {
      if (prev) map.setFeatureState({ source: "props", id: prev }, { selected: false });
      if (selectedId) map.setFeatureState({ source: "props", id: selectedId }, { selected: true });
    }
    const p = pointsRef.current.find((x) => x.id === selectedId);
    if (p) map.flyTo({ center: [p.lng, p.lat], zoom: selectZoom, pitch: 58, bearing: map.getBearing() - 25, duration: 2600, essential: true });
  }, [selectedId]);

  return <div ref={el} className="absolute inset-0" />;
}
