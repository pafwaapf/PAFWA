# PAFWA Inventory & Management System

A professional offline-first inventory, Point of Sale (POS), and accounting management system designed for **Pakistan Air Force Women Association (PAFWA)** at PAC Kamra.

> **Version:** 3.2 | **Built with:** HTML5, JavaScript, Supabase, Dexie.js (IndexedDB)

---

## Overview

PAFWA Inventory System is a complete business management solution that works **both online and offline**. It supports multiple users with role-based access control, real-time cloud synchronization, and Excel import capabilities.

### Key Features

| Feature | Description |
|---------|-------------|
| **Inventory Management** | Add, edit, archive items with images, categories, serial numbers, and stock tracking |
| **Point of Sale (POS)** | Fast checkout with cart management, multiple payment methods, receipt generation |
| **Offline-First Architecture** | Full functionality without internet using IndexedDB; syncs when online |
| **Multi-User Support** | Admin and staff roles with granular permissions |
| **Accounting & Liabilities** | Track financial liabilities and expenses |
| **Maintenance Tracking** | Monitor items sent for repair with status and estimated return dates |
| **Excel Import** | Bulk import stock from Excel spreadsheets with smart parsing |
| **Cloud Sync** | Real-time synchronization via Supabase PostgreSQL |
| **Reports & Analytics** | Sales, inventory, and financial reports with export capabilities |
| **Receipt Management** | Browse, search, and track all sales receipts |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| **Backend/Database** | Supabase (PostgreSQL) |
| **Local Database** | Dexie.js (IndexedDB wrapper) |
| **Authentication** | Supabase Auth |
| **File Storage** | Supabase Storage |
| **Excel Processing** | SheetJS (xlsx) |
| **Deployment** | Static hosting / Portable EXE (Electron-style) |

---

## Project Structure

```
PAFWA-Inventory/
├── index.html          # Main application shell
├── app.js              # Core application logic
├── db.js               # Dexie local database schema
├── style.css           # Stylesheet (loaded from root or v6 suffix)
├── schema.sql          # Supabase PostgreSQL database schema
├── logo.png            # Primary logo (200x200px recommended)
├── logo_160.png        # Fallback logo
├── BUILD_GUIDE.md      # Build & deployment instructions
├── README.md           # This file
└── ARCHITECTURE.md     # Technical architecture details
```

---

## Quick Start

### Option 1: Run Locally (No Build Required)

```powershell
# Install dependencies
npm install

# Start development server
npm start
```

Open `http://localhost:3000` in your browser.

### Option 2: Build Portable EXE

```powershell
npm run build
```

The executable will be created in the `dist/` folder.

---

## First-Time Setup

1. **Run the application**
2. **Configure Supabase** — Enter your Supabase Project URL and Anon Key
3. **Create Database** — Run `schema.sql` in Supabase SQL Editor
4. **Create Admin Account** — Sign up with username, password, and full name
5. **Start Using** — Add items, make sales, generate receipts

---

## User Roles & Permissions

| Role | Capabilities |
|------|-------------|
| **Admin** | Full access: inventory, POS, accounting, reports, user management, settings, logs |
| **Staff** | Inventory view, POS transactions, limited to assigned permissions |

---

## Offline Capabilities

The system uses **IndexedDB via Dexie.js** to store all data locally:

- **Read operations** always use local cache first
- **Write operations** save locally and queue for sync
- **Sync indicator** in status bar shows connection status
- **Manual sync** via the "Sync with Cloud" button in sidebar

---

## Data Schema

Core tables: `profiles`, `categories`, `items`, `sales`, `sale_items`, `liabilities`, `logs`, `settings`, `maintenance`

See `schema.sql` for complete PostgreSQL schema including Row Level Security (RLS) policies.

---

## Configuration

Supabase credentials can be set in two ways:

1. **Hardcoded** — Edit `HARDCODED_URL` and `HARDCODED_KEY` in `app.js`
2. **Per-Device** — Enter credentials in the Setup screen on first launch

---

## Development

To extend or customize this system:

1. **Adding new pages** — Add `<div id="page-{name}" class="pg"></div>` in `index.html`
2. **Adding navigation** — Add `<button class="ni" data-p="name">` in sidebar
3. **Adding loaders** — Add `name: loadName` to `LOADERS` object in `app.js`
4. **New tables** — Add to `schema.sql` and `db.js`
5. **New permissions** — Update permission checks in `goTo()` and auth listener

---

## License

**Author:** FL Abbas Khan  
**Organization:** PAFWA APF PAC Kamra  
**License:** ISC

---

## Support

For issues or feature requests, contact the development team or create an issue in the repository.