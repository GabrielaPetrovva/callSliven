# CallSliven — frontend prototype

Open `index.html` in a browser (or serve the folder with any static server, e.g. VS Code Live Server).

## Structure
```
index.html     home page
auth.html      log in / sign up (tabs: auth.html#login, auth.html#register)
reports.html   all reports: filters + list + map (filters live in the URL, e.g. reports.html?cat=roads&status=progress)
report.html    one report: report.html?id=1075
css/
  base.css     shared: colours, Rubik font, buttons, navigation, footer, status pills, scroll reveal
  home.css     home page only
  auth.css     log in / sign up only
  reports.css  reports list + map
  report.css   single report
js/
  config.js    settings: map key (MAPTILER_KEY) — the only file you need to edit
  common.js    shared: language EN/BG, navigation, mobile menu, scroll reveal, helpers (window.CS)
  data.js      categories / sub-categories / priorities / institutions (from the agreed table),
               districts and SAMPLE reports (window.CSDATA) — replace with API data later
  home.js, auth.js, reports.js, report.js   one script per page
assets/        photos: gerb.png, slide-1.jpg, slide-2.jpg, slide-3.jpg, why-bg.jpg, auth.jpg
```

## External libraries
- Font: Rubik (Google Fonts)
- Map: Leaflet 1.9.4 (cdnjs). Tiles: MapTiler if a key is set in js/config.js, otherwise CARTO light (no key);
  if a provider fails, the next one (CARTO → OpenStreetMap) is tried automatically.
- Open the site through a local server (e.g. VS Code Live Server), not by double-clicking the file:
  some map servers refuse requests from file:// pages.

## Notes
- Forms do not send real requests yet (design only).
- Photos of reports are never shown publicly; the map shows an approximate area.
