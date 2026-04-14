# Natural Earth Offline Sources (Sea Atlas)

This folder stores local GeoJSON source files used by the offline sea-atlas tile generator.

## Files

- `ne_10m_land.geojson`
  - Global land polygons (existing base layer).
- `ne_10m_admin_0_countries.geojson`
  - Country-level polygons and attributes (for country fill + country labels).
- `ne_10m_admin_1_states_provinces.geojson`
  - State/province boundaries (for regional context lines and labels).
- `ne_10m_populated_places.geojson`
  - City/place point features (for nearby location labels such as ports/cities).

## Source

Downloaded from Natural Earth GeoJSON releases:

- https://github.com/nvkelso/natural-earth-vector/tree/master/geojson

These files are kept local to support fully offline sea-atlas generation.
