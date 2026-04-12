# Offline Sea Atlas Packs

`assets/maps/packs/` stores the offline sea-atlas packs used by `detail.html`.

- Source coastline / land geometry: Natural Earth `ne_10m_land.geojson`
- Generator: `scripts/generate-sea-atlas-tiles.py`
- Output pattern: `assets/maps/packs/<spot-key>.pack.js` plus `assets/maps/packs/index.json`
- Storage strategy: `1024px` high-density offline tiles packed into one script bundle per sea area, with Leaflet `zoomOffset: -2` preserved at runtime.
- Runtime loader: `detail.js` injects the current sea-area pack as a plain script and reads the tile registry from `window.__YANQI_SEA_ATLAS_PACKS__`

To regenerate:

```powershell
python scripts/generate-sea-atlas-tiles.py
```
