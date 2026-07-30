# Build & Deployment Guide: PAFWA Inventory System

Complete instructions for building, deploying, and maintaining the PAFWA Inventory System as a standalone Windows executable.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development Mode](#development-mode)
- [Building the EXE](#building-the-exe)
- [Deployment](#deployment)
- [Supabase Configuration](#supabase-configuration)
- [Offline-First Features](#offline-first-features)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

---

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Node.js** | 18.x LTS or higher | JavaScript runtime for build tools |
| **npm** | 9.x or higher | Package manager (comes with Node.js) |

### Installation Steps

1. Download Node.js from [https://nodejs.org/](https://nodejs.org/)
2. Select the **LTS** version (long-term support)
3. Run the installer and follow the prompts
4. Verify installation by opening PowerShell and running:

```powershell
node --version
npm --version
```

You should see version numbers like `v18.x.x` and `9.x.x`.

---

## Installation

### 1. Open Terminal

Open **PowerShell** or **Command Prompt** and navigate to the project folder:

```powershell
# Using PowerShell
cd "C:\Users\A Khan\OneDrive\Desktop\PAFWA Inventory Software\Google Antigravity V1"

# Verify you're in the correct folder
Get-ChildItem
```

### 2. Install Dependencies

```powershell
npm install
```

This will install:
- `@supabase/supabase-js` — Cloud database client
- `dexie` — IndexedDB wrapper for offline storage

---

## Development Mode

Run the application without building to test changes:

```powershell
npm start
```

This launches a local development server. Open your browser to `http://localhost:3000`.

**Note:** Changes to `.js`, `.html`, and `.css` files require a page refresh.

---

## Building the EXE

### Using Electron (Recommended)

To create a portable Windows executable:

```powershell
npm install electron electron-builder --save-dev
```

Add the following script to `package.json`:

```json
"scripts": {
  "start": "npx serve .",
  "build": "electron-builder --win portable",
  "build:dir": "electron-builder --win portable --dir"
}
```

Then run:

```powershell
npm run build
```

### Build Output

After successful build, the `dist/` folder will contain:

```
dist/
└── PAFWA Inventory.exe    # Portable executable (~100-150MB)
```

### Alternative: Build Without Electron

For a simpler deployment, simply host the files on any web server:

1. Copy all project files to a web server
2. Configure for HTTPS (required for IndexedDB)
3. Users access via browser

---

## Deployment

### Portable USB Deployment

The `.exe` file is fully portable:

1. Copy `PAFWA Inventory.exe` to a USB drive
2. Create a `pafwa-data` folder next to the EXE on the USB
3. Launch on any Windows computer

**Data Location:** The application creates a `pafwa-data` folder in the same directory as the EXE. This folder contains:
- Local IndexedDB database
- Settings and preferences
- Session data

**Important:** Keep `pafwa-data` with the EXE to preserve data between sessions.

### Network Installation

For multiple computers in the same organization:

1. Create a shared network folder
2. Copy the EXE and a pre-created `pafwa-data` folder
3. Users launch from the network share
4. Each user's data is stored locally in their AppData folder

---

## Supabase Configuration

### What is Supabase?

Supabase is an open-source Firebase alternative providing:
- PostgreSQL database
- Authentication
- File storage
- Real-time subscriptions

### Creating a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up for free or log in
3. Click **New Project**
4. Enter details:
   - **Name:** PAFWA Inventory
   - **Database Password:** (generate secure password, save it!)
   - **Region:** Choose nearest to your location
5. Wait for project to be created (~2 minutes)

### Getting Your Credentials

1. In your Supabase project, go to **Settings** → **API**
2. Copy the following:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key (long JWT token)

### Setting Up the Database

1. In Supabase dashboard, go to **SQL Editor**
2. Copy the entire contents of `schema.sql`
3. Paste and click **Run**
4. This creates all tables, triggers, and security policies

### Connecting the App to Supabase

**Option A: Per-Device Configuration (Recommended for sharing)**

1. Run the application
2. On first launch, click **⚙️ Change Config**
3. Paste your **Project URL**
4. Paste your **Anon Key**
5. Click **Connect & Start**

**Option B: Hardcoded Configuration**

Edit `app.js` lines 7-8:

```javascript
const HARDCODED_URL = 'https://your-project.supabase.co';
const HARDCODED_KEY = 'eyJhbG...';
```

This connects automatically on every device without prompting.

---

## Offline-First Features

The system is designed to work **without internet connectivity**:

### How It Works

| Mode | Behavior |
|------|----------|
| **Online** | All data syncs to Supabase in real-time |
| **Offline** | Data saved to local IndexedDB, operations continue |
| **Reconnected** | Click "🔄 Sync with Cloud" to upload pending changes |

### Sync Indicator

The status bar shows connection status:

- 🟢 **Connected to Supabase** — Online mode active
- 🔴 **Offline Mode** — Working locally, sync pending

### Manual Sync

To force sync after being offline:

1. Ensure internet connection is active
2. Click the **🔄 Sync with Cloud** button in the sidebar
3. Wait for confirmation toast

### Data Conflict Resolution

When syncing after offline use:
- **New items** are uploaded
- **Existing items** are updated with latest changes
- **Conflicting edits** — Last-write-wins (most recent timestamp)

---

## Troubleshooting

### Build Fails

**Error:** `electron-builder not found`

**Solution:**
```powershell
npm install electron electron-builder --save-dev
```

### EXE Won't Start

**Error:** Application fails to launch

**Solution:**
1. Ensure Visual C++ Redistributable is installed
2. Run as Administrator
3. Check Windows Event Viewer for error details

### Database Connection Errors

**Error:** `Invalid API key` or `URL not valid`

**Solution:**
1. Verify Supabase URL ends with `.supabase.co`
2. Verify you're using the **anon public** key, not service role
3. Check that your Supabase project is not paused

### Offline Data Lost

**Error:** Local data disappeared after reinstall

**Solution:**
- The `pafwa-data` folder contains your local database
- Always keep a backup of this folder
- Data can be re-synced from Supabase if available

### Excel Import Not Working

**Error:** Import fails or shows errors

**Solution:**
- Ensure Excel file has columns: Item Code, Item Name, Cost Price, Sale Price, C/Bal
- Check that headers match expected format
- Verify date format is DD-MM-YYYY or YYYY-MM-DD

---

## Maintenance

### Updating the Application

1. Download the latest version
2. Replace the EXE file
3. Keep the existing `pafwa-data` folder
4. Launch — data and settings will persist

### Database Backup (Supabase)

1. Go to Supabase Dashboard
2. Navigate to your project
3. Go to **Database** → **Backups**
4. Manual backup is available anytime

### Local Data Backup

To backup local IndexedDB:
1. Close the application
2. Copy the `pafwa-data` folder
3. Store in a safe location

### Monitoring Performance

Watch these indicators in the application:

| Metric | Location | Healthy Range |
|--------|----------|---------------|
| Sync Status | Status bar | 🟢 Connected |
| Pending Sync | Sidebar | 0 items |
| Low Stock Alerts | Dashboard | < 10% of items |
| Error Logs | Activity Logs page | No critical errors |

---

## Security Considerations

- **Never commit** your Supabase URL/key to version control
- **Use environment variables** for production deployments
- **Enable Row Level Security** (already configured in schema.sql)
- **Regular backups** prevent data loss
- **Strong admin passwords** prevent unauthorized access

---

## Support

- **Documentation:** See `README.md` and `ARCHITECTURE.md`
- **Database Issues:** Check Supabase Dashboard logs
- **App Errors:** Check browser console (F12 → Console tab)
- **Author:** FL Abbas Khan, PAFWA APF PAC Kamra

---

## Quick Reference

```powershell
# Install dependencies
npm install

# Run in browser (development)
npm start

# Build EXE
npm run build

# Configuration location
app.js lines 7-8 (HARDCODED_URL, HARDCODED_KEY)

# Database schema
schema.sql

# Local data folder
pafwa-data/
```