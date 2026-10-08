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

const ATL: [number, number] = [-84.39, 33.75];

function style(base: Basemap, terrain: boolean): maplibregl.StyleSpecification {
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

function addLayers(map: MLMap, points: MapPoint[]) {
  if (map.getSource("props")) return;
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
}: {
  points: MapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  basemap: Basemap;
  terrain: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const pointsRef = useRef(points);
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
      addLayers(map, pointsRef.current);
      if (selRef.current) map.setFeatureState({ source: "props", id: selRef.current }, { selected: true });
    });
    map.once("load", () => {
      // Orbit → Georgia → Atlanta: the cinematic entrance.
      map.flyTo({ center: ATL, zoom: 10.6, pitch: 50, bearing: -18, duration: 4200, essential: true });
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
    const map = mapRef.current;
    if (!map) return;
    const prev = selRef.current;
    selRef.current = selectedId;
    if (map.getSource("props")) {
      if (prev) map.setFeatureState({ source: "props", id: prev }, { selected: false });
      if (selectedId) map.setFeatureState({ source: "props", id: selectedId }, { selected: true });
    }
    const p = pointsRef.current.find((x) => x.id === selectedId);
    if (p) map.flyTo({ center: [p.lng, p.lat], zoom: 17.2, pitch: 62, bearing: map.getBearing() - 25, duration: 2600, essential: true });
  }, [selectedId]);

  return <div ref={el} className="absolute inset-0" />;
}
