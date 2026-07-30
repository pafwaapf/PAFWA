// Dexie Local Database Schema for PAFWA Inventory
const db = new Dexie('PAFWA_DB');

db.version(3).stores({
  categories: 'id, name, _sync_status',
  items: 'id, name, serial_number, category_id, archived, _sync_status',
  sales: 'id, receipt_no, customer_name, created_at, _sync_status',
  sale_items: 'id, sale_id, item_id, _sync_status',
  liabilities: 'id, amount, _sync_status',
  logs: 'id, action, created_at, _sync_status',
  maintenance: 'id, item_id, item_name, status, date_sent, _sync_status',
  settings: 'key, value'
});

// Helper to track sync status
const SYNC_STATUS = {
  SYNCED: 'synced',
  PENDING: 'pending',
  DELETED: 'deleted'
};

console.log('Local Database Initialized');
