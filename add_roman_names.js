const fs = require('fs');
const path = require('path');
const Sanscript = require('sanscript');

const DOCS_DIR = path.join(__dirname, 'docs');
const acCodes = ['196', '197', '198', '199', '200', '201', '202'];

/**
 * Convert Devanagari to a phonetic search skeleton.
 * Applied to both stored data and search queries for consistent fuzzy matching.
 *
 * Key rules:
 * 1. Collapse aspirates (sh→s, bh→b, kh→k, etc.) — people often omit the 'h'
 * 2. Strip ALL 'a' sounds (the inherent schwa) — biggest source of spelling variation
 *    virsat = virasata = virsaat → all become "vrst"
 * 3. Normalize v/w (Vaman = Waman)
 * 4. Normalize n/m variants from Anusvara
 * 5. Collapse duplicate consonants (ll→l, rr→r)
 */
function toSearchSkeleton(marathiText) {
    if (!marathiText) return '';

    // Step 1: Devanagari → ITRANS (uppercase M = Anusvara ं)
    let s = Sanscript.t(marathiText, 'devanagari', 'itrans');

    // Step 2: Handle Anusvara BEFORE lowercasing (critical!)
    // M before p/b → phonetic 'm' (e.g. kaMpa → kampa)
    s = s.replace(/M(?=[pPbB])/g, 'm');
    // All other anusvaras → 'n' (e.g. shaMtanu → shantanu)
    s = s.replace(/M/g, 'n');

    // Step 3: Lowercase
    s = s.toLowerCase();

    // Step 4: Normalize long vowels → short (aa→a, ii→i, uu→u)
    s = s.replace(/aa/g, 'a');
    s = s.replace(/ii/g, 'i');
    s = s.replace(/uu/g, 'u');

    // Step 5: Collapse aspirate consonants → simple forms
    // So "deshmukh" and "deshamukha" both resolve to same skeleton
    s = s.replace(/sh/g, 's');   // श/ष → s
    s = s.replace(/bh/g, 'b');   // भ → b
    s = s.replace(/ph/g, 'p');   // फ → p
    s = s.replace(/kh/g, 'k');   // ख → k
    s = s.replace(/gh/g, 'g');   // घ → g
    s = s.replace(/th/g, 't');   // थ/ठ → t
    s = s.replace(/dh/g, 'd');   // ध/ढ → d
    s = s.replace(/ch/g, 'c');   // च/छ → c
    s = s.replace(/jh/g, 'j');   // झ → j
    s = s.replace(/lh/g, 'l');   // ळ → l
    s = s.replace(/nh/g, 'n');   // ण → n

    // Step 6: Normalize v/w interchangeability (Vaman = Waman)
    s = s.replace(/w/g, 'v');

    // Step 7: Strip ALL 'a' sounds — the schwa
    // This is the core of the fuzzy matching:
    // virasata and virsat and virsat → all become "vrst"
    // kulakarni and kulkarni → both become "klkrni"
    s = s.replace(/a/g, '');

    // Step 8: Collapse duplicate consecutive consonants (rr→r, ll→l, ss→s)
    s = s.replace(/(.)\1+/g, '$1');

    // Step 9: Clean — keep only lowercase letters
    s = s.replace(/[^b-z0-9 ]/g, '');

    return s;
}

function processFile(ac) {
    const filename = `voter_data_${ac}.json`;
    const filepath = path.join(DOCS_DIR, filename);

    if (!fs.existsSync(filepath)) {
        console.log(`[SKIP] ${filename} not found.`);
        return;
    }

    console.log(`[START] ${filename}...`);
    const rawData = fs.readFileSync(filepath, 'utf8');
    const data = JSON.parse(rawData);

    const enriched = data.map(row => {
        const nr = { ...row };
        if (nr.name)     nr.nameEn     = toSearchSkeleton(nr.name);
        if (nr.relative) nr.relativeEn = toSearchSkeleton(nr.relative);
        return nr;
    });

    fs.writeFileSync(filepath, JSON.stringify(enriched));

    const origMB = (Buffer.byteLength(rawData, 'utf8') / 1024 / 1024).toFixed(2);
    const newMB  = (fs.statSync(filepath).size / 1024 / 1024).toFixed(2);
    console.log(`[DONE] ${filename} — ${data.length.toLocaleString()} records. ${origMB}MB → ${newMB}MB`);
}

for (const ac of acCodes) {
    processFile(ac);
}
console.log('\n✅ All files enriched with fuzzy search skeleton.');
