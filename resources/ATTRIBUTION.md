# Location suggestions

Derived from GeoNames cities15000, admin1CodesASCII, and countryInfo, downloaded September 20, 2026.

Source: https://download.geonames.org/export/dump/

GeoNames data is licensed under Creative Commons Attribution 4.0: https://creativecommons.org/licenses/by/4.0/

The local index combines city, administrative-region and country names. It includes major cities and administrative capitals rather than every settlement. Region membership uses GeoNames country and administrative codes; city identity uses the GeoNames locality ID, independently of display names. The directory version displayed in the app is `GeoNames cities15000 · 2026-09-20`.

Region searches let users review and select these cities and add missing towns manually. A selected area list does not imply complete market coverage. Rebuild using scripts/build-locations.mjs after updating data/geonames files and update the directory version in lib/locations.mjs when the source changes. Existing queued jobs retain their saved area list.
