"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Map, { MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Camera, X, MapPin, Loader2 } from "lucide-react";
import type { StyleSpecification } from "maplibre-gl";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  importance: number;
  boundingbox: [string, string, string, string]; // [south, north, west, east]
}

// ─── Colour palette extracted from Apple Maps (Linz screenshot) ──────────────
const C = {
  bg:                  "#e8edda",  // light beige-green land base
  water:               "#7ec8e3",  // Donau / lake blue
  waterLine:           "#68b8d8",  // river/stream lines (slightly darker)
  park:                "#c0d490",  // park & recreation green
  grass:               "#c8d9a0",  // grass / meadow
  wood:                "#a8c078",  // forest / woodland (darker green)
  sand:                "#e8e0c0",  // sand / beach
  glacier:             "#ddf0f8",  // glacier / snow
  residential:         "#e4e0d4",  // residential fill (warm light grey)
  commercial:          "#dedad0",  // commercial / retail
  industrial:          "#d4cfc4",  // industrial areas
  building:            "#d8d2c4",  // building footprints
  aeroway:             "#dcd8cc",  // runways / taxiways
  boundary:            "#b8a888",  // administrative boundaries
  // roads
  motorway:            "#fcd577",  // A7/E55 motorway yellow
  motorwayCasing:      "#c8a030",  // motorway outline
  trunk:               "#fce090",  // trunk road (lighter yellow)
  trunkCasing:         "#c8b040",  // trunk outline
  primary:             "#ffffff",  // primary road white
  primaryCasing:       "#ccc8b8",  // primary road outline
  secondary:           "#ffffff",  // secondary road white
  secondaryCasing:     "#d4d0c0",  // secondary outline
  minor:               "#f4f2ec",  // minor roads
  minorCasing:         "#dcdad0",  // minor road outline
  path:                "#d8d4c8",  // footways / paths
  rail:                "#c8c4b8",  // railway lines
};

function applyAppleStyle(raw: any): StyleSpecification {
  const layers = (raw.layers as any[])
    // strip every text / icon layer → no labels whatsoever
    .filter((l) => l.type !== "symbol")
    .map((layer) => {
      const id  = String(layer.id ?? "").toLowerCase();
      const src = String(layer["source-layer"] ?? "").toLowerCase();
      const t   = layer.type as string;
      const l   = { ...layer, paint: { ...(layer.paint ?? {}) } };

      // background
      if (t === "background") {
        l.paint = { "background-color": C.bg };
        return l;
      }

      // water fill (ocean, lakes)
      if (src === "water" && t === "fill") {
        l.paint = { "fill-color": C.water, "fill-opacity": 1 };
        return l;
      }

      // waterway lines (rivers, streams)
      if (src === "waterway" && t === "line") {
        l.paint = { ...l.paint, "line-color": C.waterLine };
        return l;
      }

      // landcover (grass, wood, sand, glacier…)
      if (src === "landcover" && t === "fill") {
        if (id.includes("grass") || id.includes("meadow"))
          l.paint = { ...l.paint, "fill-color": C.grass, "fill-opacity": 0.7 };
        else if (id.includes("wood") || id.includes("forest") || id.includes("tree"))
          l.paint = { ...l.paint, "fill-color": C.wood, "fill-opacity": 0.8 };
        else if (id.includes("sand") || id.includes("beach"))
          l.paint = { ...l.paint, "fill-color": C.sand };
        else if (id.includes("glacier") || id.includes("ice") || id.includes("snow"))
          l.paint = { ...l.paint, "fill-color": C.glacier };
        return l;
      }

      // landuse polygons
      if (src === "landuse" && t === "fill") {
        if (id.includes("park") || id.includes("garden") || id.includes("recreation") || id.includes("cemetery") || id.includes("grass"))
          l.paint = { ...l.paint, "fill-color": C.park, "fill-opacity": 0.8 };
        else if (id.includes("wood") || id.includes("forest"))
          l.paint = { ...l.paint, "fill-color": C.wood, "fill-opacity": 0.7 };
        else if (id.includes("residential"))
          l.paint = { ...l.paint, "fill-color": C.residential };
        else if (id.includes("commercial") || id.includes("retail"))
          l.paint = { ...l.paint, "fill-color": C.commercial };
        else if (id.includes("industrial"))
          l.paint = { ...l.paint, "fill-color": C.industrial };
        return l;
      }

      // dedicated park layer
      if ((src === "park" || id.startsWith("park")) && t === "fill") {
        l.paint = { ...l.paint, "fill-color": C.park, "fill-opacity": 0.8 };
        return l;
      }

      // buildings
      if (src === "building") {
        if (t === "fill")
          l.paint = { "fill-color": C.building, "fill-opacity": 1 };
        else if (t === "fill-extrusion")
          l.paint = { "fill-extrusion-color": C.building, "fill-extrusion-opacity": 0.85 };
        return l;
      }

      // aeroway (runways, taxiways)
      if (src === "aeroway" && t === "fill") {
        l.paint = { ...l.paint, "fill-color": C.aeroway };
        return l;
      }

      // transportation — road lines
      if (src === "transportation" && t === "line") {
        const casing = id.includes("casing") || id.includes("_case") || id.includes("outline");
        if (id.includes("motorway"))
          l.paint = { ...l.paint, "line-color": casing ? C.motorwayCasing : C.motorway };
        else if (id.includes("trunk"))
          l.paint = { ...l.paint, "line-color": casing ? C.trunkCasing : C.trunk };
        else if (id.includes("primary"))
          l.paint = { ...l.paint, "line-color": casing ? C.primaryCasing : C.primary };
        else if (id.includes("secondary") || id.includes("tertiary"))
          l.paint = { ...l.paint, "line-color": casing ? C.secondaryCasing : C.secondary };
        else if (id.includes("path") || id.includes("track") || id.includes("pedestrian") || id.includes("footway") || id.includes("cycleway"))
          l.paint = { ...l.paint, "line-color": C.path };
        else if (id.includes("rail") || id.includes("transit"))
          l.paint = { ...l.paint, "line-color": C.rail };
        else
          l.paint = { ...l.paint, "line-color": casing ? C.minorCasing : C.minor };
        return l;
      }

      // boundaries (country, state…)
      if (src === "boundary" && t === "line") {
        l.paint = { ...l.paint, "line-color": C.boundary, "line-opacity": 0.6 };
        return l;
      }

      return l;
    });

  return { ...raw, layers } as StyleSpecification;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MapView() {
  const mapRef            = useRef<MapRef>(null);
  const inputRef          = useRef<HTMLInputElement>(null);
  const keysRef           = useRef(new Set<string>());
  const rafRef            = useRef<number | null>(null);
  const searchedCoordsRef = useRef<[number, number] | null>(null); // [lng, lat]
  const flyingRef         = useRef(false); // true while fitBounds animation is running

  const [viewState, setViewState] = useState({ longitude: 10, latitude: 30, zoom: 2.5 });
  const [mapStyle,  setMapStyle]  = useState<StyleSpecification | null>(null);

  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState<NominatimResult[]>([]);
  const [isSearching,  setIsSearching]  = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [isCapturing,  setIsCapturing]  = useState(false);
  const [captured,     setCaptured]     = useState(false);

  // ── Load Apple-styled vector map ─────────────────────────────────────────
  useEffect(() => {
    fetch("https://tiles.openfreemap.org/styles/liberty")
      .then((r) => r.json())
      .then((style) => setMapStyle(applyAppleStyle(style)))
      .catch(() => {
        // fallback: plain raster no-label tiles
        setMapStyle({
          version: 8,
          sources: {
            carto: {
              type: "raster",
              tiles: ["https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"],
              tileSize: 256,
              maxzoom: 20,
            },
          },
          layers: [{ id: "base", type: "raster", source: "carto", minzoom: 0, maxzoom: 22 }],
        });
      });
  }, []);

  // ── Debounced Nominatim geocoding ─────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6`,
          { headers: { Accept: "application/json" } },
        );
        setResults(await res.json());
      } catch { setResults([]); }
      finally   { setIsSearching(false); }
    }, 420);
    return () => clearTimeout(t);
  }, [query]);

  // ── Smooth keyboard navigation via RAF ───────────────────────────────────
  // Tracks which keys are held and applies movement every frame — no
  // per-keydown animation calls, so no overlapping easing / stutter.
  useEffect(() => {
    const PAN  = 5;    // px per frame (~300 px/s at 60 fps)
    const ZOOM = 0.03; // zoom units per frame

    const NAV_KEYS = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","+","=","-"]);

    const tick = () => {
      const map  = mapRef.current?.getMap();
      const keys = keysRef.current;

      if (map && keys.size > 0) {
        let dx = 0, dy = 0;
        if (keys.has("ArrowUp"))    dy -= PAN;
        if (keys.has("ArrowDown"))  dy += PAN;
        if (keys.has("ArrowLeft"))  dx -= PAN;
        if (keys.has("ArrowRight")) dx += PAN;
        if (dx || dy) map.panBy([dx, dy], { animate: false });

        if (keys.has("+") || keys.has("="))
          map.zoomTo(map.getZoom() + ZOOM, { animate: false });
        if (keys.has("-"))
          map.zoomTo(map.getZoom() - ZOOM, { animate: false });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (NAV_KEYS.has(e.key)) e.preventDefault();
      keysRef.current.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
    };
  }, []);

  // ── Fly to result using bounding box ─────────────────────────────────────
  // fitBounds automatically picks the right zoom:
  //   - a whole city  → zooms out to show the full city
  //   - a street addr → zooms to ~zoom 17 (capped by maxZoom)
  const flyTo = useCallback((result: NominatimResult) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const [south, north, west, east] = result.boundingbox.map(parseFloat);

    flyingRef.current = true;
    map.fitBounds(
      [[west, south], [east, north]],
      {
        padding:  { top: 80, bottom: 100, left: 60, right: 60 },
        maxZoom:  17,
        duration: 900,
        linear:   true,  // easeTo path — no zoom-out arc, direct and snappy
        essential: true,
      },
    );
    map.once("moveend", () => { flyingRef.current = false; });

    setSelectedName(result.display_name);
    searchedCoordsRef.current = [parseFloat(result.lon), parseFloat(result.lat)];
    setQuery("");
    setResults([]);
    setCaptured(false);
  }, []);

  // Hide the location pill once the searched point leaves the viewport.
  // Skip the check while the automated flight animation is still running —
  // otherwise the pill disappears before the map even reaches the destination.
  const handleMove = useCallback((e: { viewState: typeof viewState }) => {
    setViewState(e.viewState);
    if (flyingRef.current) return;
    const coords = searchedCoordsRef.current;
    if (coords) {
      const map = mapRef.current?.getMap();
      if (map && !map.getBounds().contains(coords)) {
        setSelectedName(null);
        searchedCoordsRef.current = null;
      }
    }
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  }, []);

  // ── Screenshot ────────────────────────────────────────────────────────────
  const capture = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    setIsCapturing(true);
    requestAnimationFrame(() => {
      const src      = map.getCanvas();
      const OUTPUT   = 1000;
      const dpr      = window.devicePixelRatio || 1;
      const physical = OUTPUT * dpr;

      const out = document.createElement("canvas");
      out.width  = OUTPUT;
      out.height = OUTPUT;
      const ctx  = out.getContext("2d")!;

      const sx = Math.max(0, (src.width  - physical) / 2);
      const sy = Math.max(0, (src.height - physical) / 2);
      const sw = Math.min(src.width,  physical);
      const sh = Math.min(src.height, physical);
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, OUTPUT, OUTPUT);

      out.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a   = document.createElement("a");
        a.href     = url;
        a.download = `map-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setIsCapturing(false);
        setCaptured(true);
        setTimeout(() => setCaptured(false), 2000);
      }, "image/png");
    });
  }, []);

  // ── Loading screen ────────────────────────────────────────────────────────
  if (!mapStyle) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-[#e8edda]">
        <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" aria-label="Loading map" />
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#e8edda]">

      {/* Map */}
      <Map
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        mapStyle={mapStyle}
        keyboard={false}
        canvasContextAttributes={{ preserveDrawingBuffer: true }}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        logoPosition="bottom-right"
      />

      {/* Search panel – top center */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-10">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Input row */}
          <div
            className="flex items-center gap-2 bg-white/85 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/10 border border-white/60 px-4 h-12 focus-within:ring-2 focus-within:ring-neutral-300 transition-shadow"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-haspopup="listbox"
            aria-controls="search-results"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 text-neutral-500 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="w-4 h-4 text-neutral-500 shrink-0" aria-hidden="true" />
            )}
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any location…"
              aria-label="Search location"
              aria-autocomplete="list"
              aria-controls="search-results"
              className="border-0 bg-transparent p-0 h-auto shadow-none focus-visible:ring-0 text-sm text-neutral-800 placeholder:text-neutral-500"
            />
            <AnimatePresence>
              {query && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="p-2 -mr-2 text-neutral-500 hover:text-neutral-700 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Results dropdown */}
          <AnimatePresence>
            {results.length > 0 && (
              <motion.ul
                id="search-results"
                role="listbox"
                aria-label="Search results"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="mt-2 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/10 border border-white/60 overflow-hidden list-none p-0"
              >
                {results.map((r, i) => (
                  <motion.li key={r.place_id} role="option" aria-selected="false">
                    <motion.button
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.15 }}
                      onClick={() => flyTo(r)}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-neutral-50/80 active:bg-neutral-100/80 transition-colors text-left group"
                    >
                      <MapPin className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-700 mt-0.5 shrink-0 transition-colors" aria-hidden="true" />
                      <span className="text-sm text-neutral-700 line-clamp-2 leading-snug">
                        {r.display_name}
                      </span>
                    </motion.button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Location name pill */}
      <AnimatePresence>
        {selectedName && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
          >
            <div
              className="bg-black/50 backdrop-blur-md text-white text-xs font-medium rounded-full px-4 py-1.5 max-w-[340px] text-center truncate"
              title={selectedName}
              aria-live="polite"
              aria-label={`Selected location: ${selectedName}`}
            >
              {selectedName}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Capture button – bottom center */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <Button
          onClick={capture}
          disabled={isCapturing}
          variant="outline"
          className="h-11 px-6 bg-white/85 backdrop-blur-xl border-white/60 shadow-xl shadow-black/10 rounded-2xl text-neutral-700 hover:bg-white hover:text-neutral-900 transition-all duration-200 gap-2 font-medium text-sm"
        >
          <AnimatePresence mode="wait">
            {captured ? (
              <motion.span
                key="done"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2"
              >
                <span className="text-green-500" aria-hidden="true">✓</span>
                Saved
              </motion.span>
            ) : (
              <motion.span
                key="capture"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
                Capture
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </motion.div>
    </div>
  );
}
