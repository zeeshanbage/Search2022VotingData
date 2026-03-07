const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const PDF_DIR = path.join(__dirname, 'Beed_198');
const OUTPUT_FILE = path.join(__dirname, 'website', 'voter_data.json');

// Column boundaries based on X-coordinates from PDF analysis
// Col 1: अ.क्र. (Serial)  x < 69
// Col 2: घर क्रमांक (House) 69 <= x < 109
// Col 3: मतदाराचे नाव (Name) 109 <= x < 280
// Col 4: नाते (Relation) 280 <= x < 313
// Col 5: नातेवाईकाचे नाव (Relative) 313 <= x < 428
// Col 6: लिंग (Gender) 428 <= x < 457
// Col 7: वय (Age) 457 <= x < 478
// Col 8: ओळख पत्र (ID) 478+

const COL_BOUNDARIES = [
    { name: 'sr', minX: 0, maxX: 69 },
    { name: 'house', minX: 69, maxX: 109 },
    { name: 'name', minX: 109, maxX: 280 },
    { name: 'relation', minX: 280, maxX: 313 },
    { name: 'relative', minX: 313, maxX: 428 },
    { name: 'gender', minX: 428, maxX: 457 },
    { name: 'age', minX: 457, maxX: 478 },
    { name: 'idCard', minX: 478, maxX: 999 },
];

// Header Y-range to skip (column headers appear at y ~782 and column numbers at y ~767)
const HEADER_Y_MIN = 765;
const FOOTER_Y_MAX = 30; // Footer text at the bottom

function getColumn(x) {
    for (const col of COL_BOUNDARIES) {
        if (x >= col.minX && x < col.maxX) return col.name;
    }
    return null;
}

function groupItemsByRow(items) {
    // Sort by Y descending (PDF coordinates: y=0 is bottom), then X ascending
    const sorted = items.slice().sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 3) return yDiff; // different row
        return a.x - b.x; // same row, left to right
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

    for (const item of items) {
        const col = getColumn(item.x);
        if (col) {
            const text = item.str.trim();
            if (text) {
                record[col] = record[col] ? record[col] + text : text;
            }
        }
    }
    return record;
}

async function extractPdf(filePath) {
    const dataBuffer = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data: dataBuffer }).promise;
    const basename = path.basename(filePath, '.pdf');
    // Extract yadi number from filename (e.g., "150-Beed" => "150")
    const yadi = basename.split('-')[0];

    const records = [];

    for (let pageNum = 2; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Filter out header/footer items and empty strings
        const dataItems = textContent.items
            .filter(item => {
                const y = item.transform[5];
                const str = item.str.trim();
                if (!str) return false;
                if (y >= HEADER_Y_MIN) return false; // header area
                if (y <= FOOTER_Y_MAX) return false;  // footer area
                return true;
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

            // Skip rows that are clearly header/column-number rows
            if (!record.sr || record.sr === '1' && record.house === '2' && record.name === '3') continue;
            // Skip footer rows (like "रकाना - 4...")
            if (record.sr.includes('रकाना') || record.name.includes('रकाना') || record.name.includes('पृष्ठ')) continue;

            // Clean up gender field
            if (record.gender.includes('पुरु') || record.gender.includes('पुरू')) {
                record.gender = 'पुरुष';
            } else if (record.gender.includes('स्त्र')) {
                record.gender = 'स्त्री';
            }

            // Only add if we have a meaningful name
            if (record.name && record.name.length > 1) {
                records.push({ yadi, ...record });
            }
        }
    }

    return records;
}

async function main() {
    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Get all PDF files
    const files = fs.readdirSync(PDF_DIR)
        .filter(f => f.endsWith('.pdf'))
        .sort((a, b) => {
            const numA = parseInt(a.split('-')[0]);
            const numB = parseInt(b.split('-')[0]);
            return numA - numB;
        });

    console.log(`Found ${files.length} PDFs to process.`);

    let allRecords = [];
    let errorFiles = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(PDF_DIR, file);
        try {
            const records = await extractPdf(filePath);
            allRecords = allRecords.concat(records);
            console.log(`[${i + 1}/${files.length}] ${file}: ${records.length} records`);
        } catch (e) {
            console.error(`[${i + 1}/${files.length}] ERROR processing ${file}: ${e.message}`);
            errorFiles.push(file);
        }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total records extracted: ${allRecords.length}`);
    console.log(`Files with errors: ${errorFiles.length}`);
    if (errorFiles.length > 0) console.log(`Error files: ${errorFiles.join(', ')}`);

    // Write JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allRecords, null, 0), 'utf-8');
    console.log(`\nData written to: ${OUTPUT_FILE}`);
    console.log(`File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);

    // Print a few sample records
    console.log(`\n=== SAMPLE RECORDS ===`);
    allRecords.slice(0, 5).forEach((r, i) => {
        console.log(`${i + 1}. Yadi ${r.yadi} | ${r.sr} | ${r.house} | ${r.name} | ${r.relation} | ${r.relative} | ${r.gender} | ${r.age} | ${r.idCard}`);
    });
}

main().catch(console.error);
