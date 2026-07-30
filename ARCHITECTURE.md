# Architecture Documentation: PAFWA Inventory System

## System Overview

The PAFWA Inventory System is a **single-page application (SPA)** built with vanilla JavaScript. It follows an **offline-first architecture** with cloud synchronization capabilities.

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  UI Layer   │  │ App Logic   │  │  Data Layer (Dexie) │  │
│  │  (HTML/CSS) │  │  (app.js)   │  │    (IndexedDB)      │  │
│  └─────────────┘  └──────┬──────┘  └──────────┬──────────┘  │
│                          │                      │              │
│                   ┌──────┴──────┐               │              │
│                   │  Data Facade │◄──────────────┘              │
│                   │    (Data)    │                             │
│                   └──────┬──────┘                              │
├──────────────────────────┼────────────────────────────────────┤
│                   ┌──────┴──────┐                              │
│                   │  Supabase   │                              │
│                   │   Client    │                              │
│                   └──────┬──────┘                              │
└──────────────────────────┼────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │  Supabase   │
                    │   Backend   │
                    │ (PostgreSQL)│
                    └─────────────┘
```

---

## Layer Architecture

### 1. UI Layer (`index.html`)

The HTML file contains:
- **Overlay screens** — Login, Admin setup, Config setup
- **App shell** — Sidebar, Header, Main content area, Footer status bar
- **Mobile navigation** — Bottom nav bar for mobile devices
- **Modal system** — Reusable popup modal container
- **Toast notifications** — User feedback display area

**Key Screen States:**
| State | Description |
|-------|-------------|
| `LOAD` | Initial loading spinner |
| `CFG-SCREEN` | First-time Supabase configuration |
| `ADMIN-SCREEN` | Initial admin account creation |
| `LOGIN` | User authentication |
| `APP` | Main application interface |

### 2. Application Logic Layer (`app.js`)

Core modules (by line ranges):

| Module | Lines | Purpose |
|--------|-------|---------|
| Configuration | 4-8 | Hardcoded Supabase credentials |
| Supabase Init | 10-16 | Client setup and state variables |
| Utilities | 17-184 | Helper functions, toast, modals, badges |
| Authentication | 202-333 | Login, logout, signup, auth listener |
| Navigation | 344-362 | Page routing and permission checks |
| Dashboard | 364-449 | Stats, alerts, recent sales, search |
| Inventory | 451-914 | CRUD operations, filtering, Excel import |
| POS | (loadPOS) | Cart, checkout, receipt generation |
| Accounting | (loadAcct) | Liabilities management |
| Reports | (loadRep) | Analytics and data visualization |
| Maintenance | (loadMaint) | Repair tracking |
| Users | (loadUsers) | User management |
| Backup | (loadBkp) | Data export/import |
| Settings | (loadCfg) | System configuration |

### 3. Local Database Layer (`db.js` / Dexie)

Dexie.js provides IndexedDB abstraction with sync status tracking.

**Stores:**
```javascript
categories   → id, name, _sync_status
items        → id, name, serial_number, category_id, archived, _sync_status
sales        → id, receipt_no, customer_name, created_at, _sync_status
sale_items   → id, sale_id, item_id, _sync_status
liabilities  → id, amount, _sync_status
logs         → id, action, created_at, _sync_status
maintenance  → id, item_id, item_name, status, date_sent, _sync_status
settings     → key, value
```

**Sync Status Values:**
| Value | Meaning |
|-------|---------|
| `synced` | Data matches cloud |
| `pending` | Local changes not yet uploaded |
| `deleted` | Marked for deletion on sync |

---

## Data Flow

### Online Mode
```
User Action → app.js handler → Data API → Supabase Client → Supabase Backend
                ↓
           addLog() → logs table
```

### Offline Mode
```
User Action → app.js handler → Local Dexie DB → Queue for sync
                ↓
           Toast: "Saved locally"
```

### Sync Process
```
User clicks "Sync with Cloud" →
  For each pending item in IndexedDB →
    POST/PUT/DELETE to Supabase →
    Update sync status to 'synced'
```

---

## Authentication Flow

```
1. App Init → Check for stored Supabase credentials
2. Load Credentials → From localStorage or hardcoded config
3. Initialize Supabase Client → With session persistence
4. Auth State Change Listener → Active on every state change
5. Session Valid?
   ├─ Yes → Load user profile → Check role/permissions → Show APP
   └─ No → Show LOGIN or ADMIN-SCREEN
```

**Email Format:** `{username}@pafwa.local` (virtual email, not real)

---

## Inventory Data Model

```
Item {
  id                 UUID (primary key)
  serial_number      String (unique, auto-generated if blank)
  name               String (required)
  category_id        UUID (FK to categories)
  description        Text
  location           String
  cost_price         Numeric
  sale_price         Numeric
  stock_qty          Integer
  min_stock_threshold Integer
  unit               String (default: 'pcs')
  discount_pct       Numeric
  date_of_boc        Date
  image_url          Text
  image_path         Text
  archived           Boolean
  created_at         Timestamp
  updated_at         Timestamp
}
```

**Stock Status Indicators:**
| Condition | Badge |
|-----------|-------|
| stock_qty = 0 | Out (red) |
| stock_qty ≤ min_stock_threshold | Low: {qty} (orange) |
| stock_qty > threshold | {qty} (green) |

---

## POS Transaction Flow

```
1. User navigates to POS / Shop
2. Search/select items → Add to cart
3. Optional: Apply discount, change quantity, remove items
4. Enter customer name
5. Select payment method (Cash, Mess Bill, PAFWA Home Store, Special Case)
6. Click "Complete Sale"
   ├─ Generate receipt number (atomic from settings)
   ├─ Create sale record
   ├─ Create sale_items records (one per cart item)
   ├─ Update inventory stock_qty
   └─ Add activity log
7. Show success toast with receipt number
8. (Optional) Print receipt
```

---

## Permission System

Permissions are stored in the `profiles` table and checked at navigation time.

**Available Permissions:**
| Key | Purpose |
|-----|---------|
| `users_view` | View user management page |
| `act_view` | View activity logs |
| `acct_view` | View accounting page |
| `rcpt_gen` | Access POS/shop |
| `inv_edit` | Edit inventory |

**Check Flow:**
```javascript
goTo(page) {
  if (page requires permission AND user lacks permission) {
    toast('Access denied', 'e');
    return;
  }
  // ... proceed
}
```

---

## Excel Import Process

```
1. User uploads .xlsx/.xls file
2. Parse workbook with SheetJS (all sheets)
3. For each sheet:
   ├─ Detect "Item Code" header row
   ├─ Find Cost/Bal/Sale price columns
   ├─ Parse row-by-row:
   │  ├─ First column = Date (DD-MM-YYYY or YYYY-MM-DD)
   │  ├─ Second column = Item Name
   │  ├─ C/Bal column = Quantity
   │  ├─ Cost Price column = Cost
   │  └─ Sale Price column = Price
   └─ Upsert to Supabase (insert or update on duplicate SN)
4. Show progress overlay with log
5. Display summary: imported count, error count
```

**Smart Features:**
- Auto-generates serial number from category + sequence
- Inherits item name from parent row to child rows
- Handles Excel serial date format (25569 offset)
- Updates existing items if serial number matches

---

## Image Processing

```
1. User selects image file
2. processImage() called:
   ├─ Read as FileReader → DataURL
   ├─ Create Image element
   ├─ On load:
   │  ├─ Create 400x400 canvas (black fill)
   │  ├─ Calculate contain proportions
   │  ├─ Center and draw image
   │  └─ Export as JPEG @ 70% quality
   └─ Returns Blob (< 200KB target)
3. Upload to Supabase Storage bucket 'item-images'
4. Store public URL in item.image_url
```

---

## State Management

Global variables in `app.js`:

```javascript
let sb = null;           // Supabase client instance
let CU = null;           // Current user object {id, username, fullName, role, permissions}
let _cats = [];          // Categories cache
let _items = [];         // Items cache
let _posItems = [];      // POS available items
let _cart = [];          // Current cart items
let _repData = [];       // Reports data
let _repType = 'sales';  // Current report type
let _invFilter = null;   // Inventory filter state
let _rcptFilter = null;  // Receipt filter state
let _maintRecords = [];   // Maintenance records cache
```

---

## Utility Functions

| Function | Purpose |
|----------|---------|
| `$(id)` | Shorthand for `document.getElementById` |
| `esc(str)` | HTML-safe string escaping |
| `fmtM(num)` | Format as Pakistani Rupees |
| `fmtD(dateStr)` | Format date as DD-MM-YYYY |
| `fmtDT(dateStr)` | Format date + time |
| `toast(msg, type)` | Show toast notification (s=success, e=error, w=warning, i=info) |
| `openM(html, width)` | Open modal with content |
| `closeM()` | Close modal |
| `stBadge(qty, min)` | Stock status badge |
| `payBadge(paid)` | Payment status badge |
| `roleBadge(role)` | Role display badge |
| `pmBadge(method)` | Payment method badge |

---

## Database Schema (Supabase)

See `schema.sql` for complete PostgreSQL schema including:

- **Tables:** profiles, categories, items, sales, sale_items, liabilities, logs, settings, maintenance
- **Triggers:** Auto-create profile on signup, auto-update updated_at
- **Functions:** get_next_receipt_no() for atomic receipt numbering
- **RLS Policies:** Row-level security for all tables
- **Storage:** item-images bucket for image uploads

---

## Environment Variables / Configuration

| Variable | Source | Description |
|----------|--------|-------------|
| `HARDCODED_URL` | app.js | Default Supabase project URL |
| `HARDCODED_KEY` | app.js | Default Supabase anon key |
| `pafwa_sb_url` | localStorage | Per-device Supabase URL |
| `pafwa_sb_key` | localStorage | Per-device Supabase key |

---

## Error Handling Strategy

1. **User-facing errors** → Toast notification with message
2. **Critical errors** → Alert box with details
3. **Auth errors** → Redirect to login
4. **Network errors** → Fallback to local storage, queue for retry
5. **Console errors** → Log with context, don't expose to user

---

## Performance Considerations

- **Lazy loading** — Page content loaded only when navigated
- **Progress bars** — Long operations show progress (Excel import, data fetch)
- **Image compression** — All images compressed to ≤200KB before upload
- **IndexedDB caching** — Frequently accessed data cached locally
- **Debounced search** — Inventory search debounced to reduce DB queries

---

## Security Measures

| Measure | Implementation |
|---------|----------------|
| **RLS** | Row-level security policies on all tables |
| **Input sanitization** | `esc()` function for all user input |
| **SQL injection** | Supabase client handles parameterization |
| **XSS prevention** | All dynamic HTML uses escaped content |
| **Password hashing** | Handled by Supabase Auth |
| **Session management** | Supabase handles token refresh |

---

## Future Considerations

Potential enhancements for other vibe coding apps:

1. **Real-time subscriptions** — Supabase channels for live updates across devices
2. **Push notifications** — Low stock alerts, sync status
3. **Offline mutations** — Better conflict resolution for concurrent edits
4. **Progressive Web App (PWA)** — Install to desktop, service worker
5. **Multi-tenant** — Support multiple PAFWA branches
6. **API layer** — REST endpoints for third-party integrations