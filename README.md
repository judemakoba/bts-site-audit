# BTS Site Audit System

Field data capture system for telecom BTS (Base Transceiver Station) audits:
- **Excel template** — 3-sheet field capture form (Ground Equipment, DCDB, Tower)
- **Mobile app (Android/iOS)** — Capacitor app with camera, offline storage, and sync
- **Backend API** — Express server with web dashboard and Excel report generation
- **Photos** — Organised into 3 folders matching the audit categories

## Project Structure

```
Asset_Verification/
├── template/
│   └── Site_Audit_Template.xlsx      ← 3-sheet Excel field form
├── backend/
│   ├── server.js                      ← Express API + dashboard
│   ├── scripts/generate-site-template.js ← Template generator
│   ├── data.json                      ← Local JSON store
│   ├── uploads/                      ← Photos (ground/, dcdb/, tower/, general/)
│   └── reports/                      ← Generated Excel audit reports
├── mobile/
│   ├── src/app.ts                    ← 5-tab mobile app (Site, Ground, DCDB, Tower, Sync)
│   ├── src/types.ts                  ← TypeScript interfaces
│   ├── src/style.css                 ← Mobile-first CSS
│   └── android/                      ← Android project
├── Dockerfile                         ← Container for Koyeb/self-host
├── koyeb.toml                        ← Koyeb deployment config
└── app-debug.apk                     ← Latest Android APK
```

## Quick Start

### Backend (local)
```bash
cd backend
npm install
node scripts/generate-site-template.js   # Regenerate field template
node server.js                           # Start API on :3000
```
- Dashboard: `http://localhost:3000/`
- Health: `http://localhost:3000/api/health`
- Report: `GET http://localhost:3000/api/report/excel`

### Mobile App (Android)
```bash
cd mobile
npm install
npx vite build
npx cap sync android
# Build APK:
cd android && .\gradlew.bat assembleDebug
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Mobile App Tabs

| Tab | Purpose |
|-----|---------|
| **Site** | Site ID, ATC No., GPS, Technician, Tenants, Tower info |
| **Ground** | RRU, Cabinet, BTS, IDU, labelling, TRM media, power setup |
| **DCDB** | DCDB breakers, DCDU models, RRU/AAU power & earthing cables |
| **Tower** | Per-sector RF/antenna inventory (manufacturer, azimuth, height, etc.) |
| **Photos** | Camera capture, category-labelled, offline storage |
| **Sync** | Upload all data to backend; mark records as synced |

App works **offline** — data is saved locally until sync is triggered.

### Connecting Mobile to Backend

Update `mobile/src/app.ts` → `API_BASE`:
- Android Emulator: `http://10.0.2.2:3000`
- Physical device (same LAN): `http://<your-pc-ip>:3000`
- Koyeb (production): `https://your-app-name.koyeb.app/api`

## Backend API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/audit/sync` | POST | Sync all 3 data sections at once (mobile primary) |
| `/api/site` | GET/POST | Site info |
| `/api/ground` | GET/POST | Ground equipment records |
| `/api/ground/:id` | PUT/DELETE | Update/delete ground record |
| `/api/dcdb` | GET/POST | DCDB records |
| `/api/dcdb/:id` | PUT/DELETE | Update/delete DCDB record |
| `/api/tower` | GET/POST | Tower equipment entries |
| `/api/tower/:id` | PUT/DELETE | Update/delete tower entry |
| `/api/photos` | GET/POST | List/upload photos (`category` param: ground\|dcdb\|tower\|general) |
| `/api/photos/:id` | DELETE | Delete photo |
| `/api/report/excel` | GET | Download 5-sheet Excel audit report with photo thumbnails |
| `/api/report/generate` | POST | Same as above, returns JSON with download URL |

## Excel Report Sheets

| Sheet | Tab Color | Contents |
|-------|-----------|----------|
| **Site Summary** | Blue | Site ID, GPS, technician, audit counts |
| **Ground Equipment Scope** | Green | RRU, Cabinet, BTS, IDU, labelling, TRM, power |
| **DCDB Information** | Orange | DCDB/DCDU breakers, power cables, earthing cables |
| **Tower Equipment Scope** | Purple | Per-sector RF/antenna inventory |
| **Photo Gallery** | Gold | Embedded photo thumbnails with category labels |

## Photo Folder Routing

Photos uploaded via the mobile app are automatically sorted into:

```
backend/uploads/
├── ground/      ← Site-level / ground equipment photos
├── dcdb/         ← DCDB / power distribution photos
├── tower/        ← Tower-mounted equipment photos
└── general/      ← General site photos
```

## Koyeb Deployment

1. Push this repo to GitHub
2. Update `koyeb.toml` → replace `REPO_OWNER/REPO_NAME` with your GitHub path
3. Connect the repo to Koyeb at https://app.koyeb.com
4. Koyeb auto-deploys on push to `main`

Environment variables (set in Koyeb dashboard):
- `NODE_ENV=production`
- `PORT=3000`

## Deployment (Self-hosted / Proxmox LXC)

```bash
docker build -t bts-audit .
docker run -d -p 3000:3000 --name bts-audit \
  -v $(pwd)/data.json:/app/backend/data.json \
  -v $(pwd)/uploads:/app/backend/uploads \
  -v $(pwd)/reports:/app/backend/reports \
  bts-audit
```

## Ground Equipment Fields

Tower Type, Tower Height, Building Height, Indoor/Outdoor, No. of Tenants, Grid/DG/Solar,
Grid Distance to 3-Phase, Guard at Site, RRU Type, RRU Count, Cabinet Types, Cabinet Count,
Labelling Done, BTS Dimensions, Active IDU Types, IDU Count, Slab Dimensions,
Redundant Equipment, Redundant Count, TRM Media (Fiber), Overall Remarks

## DCDB Fields

DCDB Priority Supply Cable Size (mm²), Load (A), DCDB Breaker A1–A5 ratings,
DCDU Breaker Model 1–5, RRU/AAU Power Cable count/missing/length,
RRU/AAU/BTS Earthing Cable count/missing/length, Earthing Connection status

## Tower Equipment Fields

Airtel Site ID, Site Name, RF/TRM Equipment Type, Antenna Manufacturer, Antenna Model,
Tenant Owner, Antenna per Sector, Sector, Azimuth, Height to Centre, Antenna Count,
Length/Width/Height (mm), Active/Inactive, Equipment Labelling, Remarks
