// QR Code Generator Tool
// Run this to generate a QR code for your Supabase credentials

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================
// YOUR CREDENTIALS - FILL THESE IN
// ============================================
const SUPABASE_URL = 'https://isxefzwqtsiimhsfiuet.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzeGVmendxdHNpaW1oc2ZpdWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNjYxOTksImV4cCI6MjA5Mjg0MjE5OX0.c7rxoBQOPzOrfB9WAc-UXR9bS5GkSUA-nxA5pQwysXc';
// ============================================

// Encode credentials
const combined = SUPABASE_URL + '|' + SUPABASE_KEY;
const encoded = Buffer.from(combined).toString('base64');

console.log('=== PAFWA INVENTORY SYSTEM - QR CODE GENERATOR ===\n');
console.log('Encoded Credentials:');
console.log(encoded);
console.log('\n');

// Generate a simple HTML page with embedded QR code
// Using an online API so we don't need to install packages
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(encoded)}`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PAFWA QR Code Setup</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: 'Segoe UI', sans-serif; 
            background: linear-gradient(135deg, #0f172a, #1e293b);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: rgba(30, 41, 59, 0.9);
            backdrop-filter: blur(20px);
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.1);
            max-width: 500px;
            width: 100%;
        }
        h1 { 
            color: #3b82f6; 
            margin-bottom: 10px;
            font-size: 28px;
            letter-spacing: 1px;
        }
        .subtitle {
            color: #94a3b8;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .qr-box {
            background: white;
            border-radius: 16px;
            padding: 20px;
            display: inline-block;
            margin: 20px 0;
        }
        .qr-box img {
            display: block;
        }
        .instructions {
            color: #cbd5e1;
            font-size: 13px;
            line-height: 1.8;
            text-align: left;
            background: rgba(0,0,0,0.3);
            padding: 20px;
            border-radius: 12px;
            margin-top: 20px;
        }
        .instructions strong { color: #3b82f6; }
        .warning {
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid #f59e0b;
            color: #fbbf24;
            padding: 15px;
            border-radius: 10px;
            margin-top: 20px;
            font-size: 12px;
        }
        .download-btn {
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            border: none;
            padding: 14px 28px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 20px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);
        }
        .encoded-key {
            background: rgba(15, 23, 42, 0.5);
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 11px;
            word-break: break-all;
            margin-top: 15px;
            color: #06b6d4;
            max-height: 80px;
            overflow-y: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 PAFWA INVENTORY</h1>
        <p class="subtitle">Scan this QR code to connect automatically</p>
        
        <div class="qr-box">
            <img src="${qrUrl}" alt="QR Code" width="300" height="300">
        </div>
        
        <button class="download-btn" onclick="downloadQR()">
            ⬇️ Download QR Code Image
        </button>
        
        <div class="instructions">
            <strong>📋 How to use:</strong><br>
            1. Save this QR code image<br>
            2. Give it to your clients along with the app link<br>
            3. Clients scan the QR using the app's "Scan QR" option<br>
            4. They will be automatically connected!
        </div>
        
        <div class="warning">
            ⚠️ Keep this QR code private! Anyone who scans it can access your database.
        </div>
        
        <div class="encoded-key">
            <strong>Encoded Data:</strong><br>
            ${encoded}
        </div>
    </div>
    
    <script>
        function downloadQR() {
            const link = document.createElement('a');
            link.href = '${qrUrl}';
            link.download = 'PAFWA_QR_Code.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'qr-setup.html'), html);

console.log('✅ QR Code Generator page created: qr-setup.html');
console.log('\n📋 NEXT STEPS:');
console.log('1. Open qr-setup.html in your browser');
console.log('2. Download the QR code image');
console.log('3. Share the QR image + app URL with your clients');
console.log('\n🔗 YOUR APP URL:');
console.log('https://maverick1427.github.io/Google-Antigravity-V1/');