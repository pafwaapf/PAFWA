// Legacy PDF Receipt Parser using PDF.js

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * Extract fallback Receipt No and Customer Name from filename.
 * E.g. "05 MD APF.pdf" -> { receipt_no: "05", customer_name: "MD APF" }
 * E.g. "042_Mrs_Ayesha_Khan.pdf" -> { receipt_no: "042", customer_name: "Mrs Ayesha Khan" }
 */
function parseFilenameMetadata(filename) {
  const nameOnly = filename.replace(/\.pdf$/i, '').trim();
  const match = nameOnly.match(/^(\d{1,5})[\s_\-]+(.+)$/);
  if (match) {
    return {
      receipt_no: match[1].trim(),
      customer_name: match[2].replace(/_/g, ' ').trim()
    };
  }
  return { receipt_no: '', customer_name: nameOnly };
}

/**
 * Parses a Legacy Receipt PDF File and returns extracted metadata & raw PDF base64.
 */
async function parseLegacyPdfFile(file) {
  const fileMeta = parseFilenameMetadata(file.name);
  const arrayBuffer = await file.arrayBuffer();
  
  // Convert ArrayBuffer to Base64 for storing the original PDF
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const pdfDataBase64 = 'data:application/pdf;base64,' + window.btoa(binary);

  let fullText = '';
  const lines = [];

  if (window.pdfjsLib) {
    try {
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Group items by vertical position (Y coordinate) to preserve text lines
        const itemsByY = {};
        textContent.items.forEach(item => {
          const y = Math.round(item.transform[5]); // Y coordinate
          if (!itemsByY[y]) itemsByY[y] = [];
          itemsByY[y].push(item.str);
        });

        // Sort lines top-to-bottom (descending Y)
        const sortedY = Object.keys(itemsByY).sort((a, b) => Number(b) - Number(a));
        sortedY.forEach(y => {
          const lineStr = itemsByY[y].join(' ').trim();
          if (lineStr) {
            lines.push(lineStr);
            fullText += lineStr + '\n';
          }
        });
      }
    } catch (err) {
      console.warn('PDF.js parsing warning, using fallback text parsing:', err);
    }
  }

  // Regex extractors
  let receiptNo = fileMeta.receipt_no;
  const rcptMatch = fullText.match(/Receipt\s*No\.?\s*[:\s]*([0-9A-Za-z\-]+)/i);
  if (rcptMatch && rcptMatch[1]) {
    receiptNo = rcptMatch[1].trim();
  }

  let receiptDate = new Date().toISOString().split('T')[0];
  const dateMatch = fullText.match(/Dated?\s*[:\s]*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i);
  if (dateMatch && dateMatch[1]) {
    const rawDate = dateMatch[1].trim();
    const parts = rawDate.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const dd = parts[0].padStart(2, '0');
      const mm = parts[1].padStart(2, '0');
      let yyyy = parts[2];
      if (yyyy.length === 2) yyyy = '20' + yyyy;
      receiptDate = `${yyyy}-${mm}-${dd}`;
    }
  }

  let customerName = fileMeta.customer_name;
  const nameMatch = fullText.match(/Name\s*[:\s]*_*([^\n\r_]+)/i);
  if (nameMatch && nameMatch[1]) {
    const extractedName = nameMatch[1].replace(/_+/g, '').trim();
    if (extractedName.length > 1) {
      customerName = extractedName;
    }
  }

  let totalAmount = 0;
  const totalMatch = fullText.match(/Total\s*[:\s]*([0-9,]+)/i);
  if (totalMatch && totalMatch[1]) {
    totalAmount = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;
  }

  // Parse items table
  const items = [];
  lines.forEach(line => {
    // Pattern: SNo Description Qty Rate Amount (e.g. "1 Fruit Basket (Baan) 2 800 1600")
    const itemMatch = line.match(/^(\d+)\s+(.+?)\s+(\d+)\s+([\d,]+)\s+([\d,]+)$/);
    if (itemMatch) {
      items.push({
        sno: parseInt(itemMatch[1], 10),
        item_name: itemMatch[2].trim(),
        quantity: parseInt(itemMatch[3], 10),
        unit_price: parseFloat(itemMatch[4].replace(/,/g, '')),
        total: parseFloat(itemMatch[5].replace(/,/g, ''))
      });
    }
  });

  return {
    receipt_no: receiptNo,
    customer_name: customerName,
    receipt_date: receiptDate,
    total: totalAmount,
    items_json: items,
    file_name: file.name,
    pdf_data: pdfDataBase64
  };
}
