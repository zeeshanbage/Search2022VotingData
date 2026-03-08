const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const PDF_DIR = path.join(__dirname, 'Beed_198');
const OUTPUT_FILE = path.join(__dirname, 'docs', 'voter_data.json');

// ─── Column boundaries based on exhaustive PDF analysis ─────────────
// From analyzing pages across PDFs 142, 150, 200, 218:
//
// Header positions (consistent across all PDFs):
//   अ.क्र.  starts at x≈37    (col header at y≈782)
//   घर क्र   starts at x≈69    
//   मतदाराचे starts at x≈109
//   नाते     starts at x≈287
//   नातेवाई   starts at x≈313
//   लिंग     starts at x≈428
//   वय       starts at x≈457
//   ओळख     starts at x≈478
//
// Data positions (items that carry actual text):
//   sr:       x = 37-58   (1-4 digit numbers)
//   house:    x = 69-108  (house numbers like "8", "43", "43-1", "75-2")
//   name:     x = 108-287 (voter name, may have multiple word items)
//   relation: x = 287-313 (single char: "ि" or "प")
//   relative: x = 313-428 (relative's name)
//   gender:   x = 427-457 ("पुरु"/"ष" or "स्त्र"/"ी")
//   age:      x = 457-478 (2-3 digit number)
//   idCard:   x = 478+    (MT/34/198/... numbers)
//
// The boundaries below use MIDPOINTS between column ends and next column starts.

const COLUMN_BOUNDARIES = [
    // [minX, maxX, columnName]
    [30, 65, 'sr'],        // अ.क्र.
    [65, 108.5, 'house'],     // घर क्रमांक  
    [108.5, 287, 'name'],      // मतदाराचे पुर्ण नाव
    [287, 312.5, 'relation'],  // नाते
    [312.5, 427, 'relative'],  // नातेवाईकाचे पुर्ण नाव
    [427, 456, 'gender'],    // लिंग (includes "स्त्र" at x≈430 and "पुरु" at x≈428)
    [456, 478, 'age'],       // वय
    [478, 999, 'idCard'],    // ओळख पत्र क्रमांक
];

const HEADER_Y_MIN = 765;
const FOOTER_Y_MAX = 30;

function getColumn(x) {
    for (const [min, max, name] of COLUMN_BOUNDARIES) {
        if (x >= min && x < max) return name;
    }
    return null;
}

function groupItemsByRow(items) {
    const sorted = items.slice().sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 3) return yDiff;
        return a.x - b.x;
    });

    const rows = [];
    let currentRow = [];
    let currentY = null;

    for (const item of sorted) {
        if (currentY === null || Math.abs(item.y - currentY) > 3) {
            if (currentRow.length > 0) rows.push(currentRow);
            currentRow = [item];
            currentY = item.y;
        } else {
            currentRow.push(item);
        }
    }
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
}

function parseRow(items) {
    const record = { sr: '', house: '', name: '', relation: '', relative: '', gender: '', age: '', idCard: '' };

    // Sort items by x position
    const sorted = items.slice().sort((a, b) => a.x - b.x);

    // Strategy: assign each item to a column.
    // Zero-width items (w=0) are conjunct marks — assign them to the column
    // of the *next* non-zero-width item that follows, or previous if at end.
    // 
    // But actually, zero-width items DO have an x position — it's just that
    // the x might be slightly before the visible glyph. We should use their 
    // x position directly for column assignment.

    // Track column assignments per item
    const assignments = [];

    for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        const str = item.str;

        // Skip pure whitespace
        if (!str.trim()) continue;

        let col;

        if (item.w === 0) {
            // Zero-width conjunct: look at *where the next visible character starts*
            // Often the conjunct's x is set to the position where the base character would be,
            // which may be in the previous column. 
            // Better strategy: find the next non-whitespace, non-zero-width item and use its column.
            let nextCol = null;
            for (let j = i + 1; j < sorted.length; j++) {
                if (sorted[j].str.trim() && sorted[j].w > 0) {
                    nextCol = getColumn(sorted[j].x);
                    break;
                }
            }
            // Fallback: try previous item's column
            if (!nextCol && assignments.length > 0) {
                nextCol = assignments[assignments.length - 1].col;
            }
            col = nextCol || getColumn(item.x);
        } else {
            col = getColumn(item.x);
        }

        if (col) {
            assignments.push({ str: str, col: col, x: item.x, w: item.w });
        }
    }

    // Build text per column, inserting spaces between non-adjacent items
    const colItems = {};
    for (const a of assignments) {
        if (!colItems[a.col]) colItems[a.col] = [];
        colItems[a.col].push(a);
    }

    for (const col of Object.keys(colItems)) {
        const items = colItems[col].sort((a, b) => a.x - b.x);
        let text = '';
        let prevEndX = null;

        for (const item of items) {
            const gap = prevEndX !== null ? item.x - prevEndX : 0;

            if (item.w === 0) {
                // Zero-width conjunct — prepend to text directly (no space)
                text += item.str;
            } else {
                // Add space if there's a visible gap (>1.5px)
                // Word separations in these PDFs are ~2.7px
                if (prevEndX !== null && gap > 1.5) {
                    text += ' ';
                }
                text += item.str;
                prevEndX = item.x + item.w;
            }
        }

        record[col] = text.trim();
    }

    return record;
}

async function extractPdf(filePath) {
    const dataBuffer = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data: dataBuffer }).promise;
    const basename = path.basename(filePath, '.pdf');
    const yadi = basename.split('-')[0];
    const pdfName = basename; // e.g. "163-Beed"
    const pdfLink = `https://ceoelection.maharashtra.gov.in/2002/2002/PDFs/Beed/198%20BEED/${encodeURIComponent(basename)}.pdf`;
    const records = [];

    for (let pageNum = 2; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();

        const dataItems = textContent.items
            .filter(item => {
                const y = item.transform[5];
                return y < HEADER_Y_MIN && y > FOOTER_Y_MAX;
            })
            .map(item => ({
                str: item.str,
                x: item.transform[4],
                y: item.transform[5],
                w: item.width
            }));

        const rows = groupItemsByRow(dataItems);

        for (const rowItems of rows) {
            const record = parseRow(rowItems);

            // Skip header number rows (sr=1 house=2 name=3)
            if (/^[1-8]$/.test(record.sr) && /^[1-8]$/.test(record.house) && /^[1-8]$/.test(record.name)) continue;
            // Skip column number rows  
            if (record.sr === '1' && record.house === '2' && record.name === '3') continue;
            // Skip single-digit-only rows that look like column numbers
            if (record.sr === '5' && !record.house && !record.name) continue;

            // Skip footer rows
            if (record.sr.includes('रकाना') || record.name.includes('रकाना') ||
                record.name.includes('पृष्ठ') || record.sr.includes('पृष्ठ')) continue;

            // Skip location description rows (pure text in name column, no structured data)
            if (!record.sr && !record.house && record.name && !record.relation && !record.age) continue;

            // Clean up gender
            const g = record.gender;
            if (g.includes('पुरु') || g.includes('पुरू')) {
                record.gender = 'पुरुष';
            } else if (g.includes('स्त्र') || g === 'ी') {
                record.gender = 'स्त्री';
            }

            // Only add if we have meaningful data
            if (record.name && record.name.length > 1 && record.sr) {
                records.push({ yadi, pdfName, pdfLink, ...record });
            }
        }
    }
    return records;
}

async function main() {
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const files = fs.readdirSync(PDF_DIR)
        .filter(f => f.endsWith('.pdf'))
        .sort((a, b) => parseInt(a) - parseInt(b));

    console.log(`Found ${files.length} PDFs.`);

    let allRecords = [];
    let errorFiles = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const records = await extractPdf(path.join(PDF_DIR, file));
            allRecords = allRecords.concat(records);
            console.log(`[${i + 1}/${files.length}] ${file}: ${records.length} records`);
        } catch (e) {
            console.error(`[${i + 1}/${files.length}] ERROR ${file}: ${e.message}`);
            errorFiles.push(file);
        }
    }

    console.log(`\nTotal: ${allRecords.length} records. Errors: ${errorFiles.length}`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allRecords), 'utf-8');
    const mb = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
    console.log(`Written: ${OUTPUT_FILE} (${mb} MB)`);

    // Verification samples
    console.log('\n=== SAMPLES ===');
    for (const r of allRecords.slice(0, 3)) {
        console.log(JSON.stringify(r));
    }

    // Find user's test record
    const test = allRecords.find(r => r.yadi === '218' && r.sr.includes('1818'));
    if (test) {
        console.log('\n=== TEST RECORD (218/1818) ===');
        console.log(JSON.stringify(test, null, 2));
    }

    // Also check a known-good record from PDF 218 page 2 (sr=1, house=8)
    const test2 = allRecords.find(r => r.yadi === '218' && r.sr === '1');
    if (test2) {
        console.log('\n=== VERIFICATION (218/1) ===');
        console.log(JSON.stringify(test2, null, 2));
    }
}

main().catch(console.error);
