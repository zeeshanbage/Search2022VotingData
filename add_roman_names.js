const fs = require('fs');
const path = require('path');
const Sanscript = require('sanscript');

const DOCS_DIR = path.join(__dirname, 'docs');
const acCodes = ['196', '197', '198', '199', '200', '201', '202'];

function getSearchableRoman(marathiText) {
    if (!marathiText) return "";

    // Convert devanagari to ITRANS script
    let roman = Sanscript.t(marathiText, 'devanagari', 'itrans');

    // Convert to lowercase early
    roman = roman.toLowerCase();

    // Handle ITRANS pronunciation cleanup for naive search
    // "m" followed by p/b/h is often phonetically "m" (e.g. kambaLe -> kambale)
    roman = roman.replace(/m(?=[pbh])/g, 'm');

    // other Anusvaras are usually "n" (e.g. j~nAneshvara or shaMtanu)
    roman = roman.replace(/m/g, 'n');

    // Remove vowel lengths to make search more flexible
    roman = roman.replace(/aa/g, 'a');
    roman = roman.replace(/ii/g, 'i');
    roman = roman.replace(/uu/g, 'u');

    // Remove complex consonant structures rarely typed by a layman searching
    roman = roman.replace(/kshar/g, 'kshar');

    // Keep only english letters and spaces
    roman = roman.replace(/[^a-z0-9 ]/g, '');

    return roman;
}

/**
 * Process a single AC JSON file, appending nameEn and relativeEn,
 * then overwrite the file.
 */
function processFile(ac) {
    const filename = `voter_data_${ac}.json`;
    const filepath = path.join(DOCS_DIR, filename);

    if (!fs.existsSync(filepath)) {
        console.log(`[SKIP] ${filename} not found.`);
        return;
    }

    console.log(`[START] Processing ${filename}...`);
    const rawData = fs.readFileSync(filepath, 'utf8');
    const data = JSON.parse(rawData);

    const enrichedData = data.map(row => {
        const nr = { ...row };

        // Only append English names if they exist
        if (nr.name) {
            nr.nameEn = getSearchableRoman(nr.name);
        }

        if (nr.relative) {
            nr.relativeEn = getSearchableRoman(nr.relative);
        }

        return nr;
    });

    // Write back to the same file
    fs.writeFileSync(filepath, JSON.stringify(enrichedData));

    const origSize = (Buffer.byteLength(rawData, 'utf8') / 1024 / 1024).toFixed(2);
    const newSize = (fs.statSync(filepath).size / 1024 / 1024).toFixed(2);

    console.log(`[DONE] ${filename} — ${data.length} records. Size: ${origSize}MB -> ${newSize}MB`);
}

// Run for all constituencies sequentially to keep memory usage safe
for (const ac of acCodes) {
    processFile(ac);
}

console.log("\nAll files mapped to Roman Hindi successfully!");
