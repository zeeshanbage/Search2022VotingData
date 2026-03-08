/**
 * Voter Roll Search — Client-side search engine
 * Loads voter_data.json and provides instant name-based search
 */

(function () {
    'use strict';

    // State
    let allData = [];
    let currentResults = [];
    let displayedCount = 0;
    const PAGE_SIZE = 100;
    const DEBOUNCE_MS = 250;

    // DOM refs
    const acSelect = document.getElementById('acSelect');
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearBtn');
    const statusText = document.getElementById('statusText');
    const totalCount = document.getElementById('totalCount');
    const resultsSection = document.getElementById('resultsSection');
    const resultsBody = document.getElementById('resultsBody');
    const emptyState = document.getElementById('emptyState');
    const noResults = document.getElementById('noResults');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    // ─── Data Loading ──────────────────────────────────────
    async function loadData(acCode) {
        // Reset state
        allData = [];
        currentResults = [];
        searchInput.value = '';
        clearBtn.classList.remove('visible');
        resultsSection.classList.remove('active');
        emptyState.style.display = 'none';
        noResults.style.display = 'none';

        loadingOverlay.querySelector('p').textContent = `Loading ${acCode} voter data...`;
        loadingOverlay.classList.remove('hidden');

        try {
            // Using logic: if acCode is empty string it would be voter_data_.json, but default is 198
            // The file should be voter_data_198.json (new format) or fallback to voter_data.json
            // Let's try the new specific format first
            let url = `voter_data_${acCode}.json`;
            let response = await fetch(url);

            // Temporary fallback for backwards compatibility while generating new files
            if (!response.ok && acCode === '198') {
                response = await fetch('voter_data.json');
            }

            if (!response.ok) throw new Error(`HTTP ${response.status} - Data not found for AC ${acCode}`);

            allData = await response.json();
            totalCount.textContent = `${allData.length.toLocaleString()} records`;
            statusText.textContent = `AC ${acCode} loaded — ${allData.length.toLocaleString()} voter records`;

            loadingOverlay.classList.add('hidden');
            emptyState.style.display = '';
            emptyState.classList.remove('hidden');
            searchInput.focus();

        } catch (err) {
            statusText.textContent = `Error: Data for AC ${acCode} not generated yet.`;
            totalCount.textContent = '—';
            loadingOverlay.classList.add('hidden');
            emptyState.style.display = '';
            emptyState.querySelector('.empty-title').textContent = 'माहिती उपलब्ध नाही (Data Not Available)';
            emptyState.querySelector('.empty-subtitle').textContent = `Voter data for AC ${acCode} is currently being processed. Please try another.`;
            console.error('Data load error:', err);
        }
    }

    // ─── Search ────────────────────────────────────────────
    function performSearch(query) {
        query = query.trim();

        if (!query || query.length < 2) {
            showEmptyState();
            return;
        }

        // Search in name and relative fields
        const queryLower = query.toLowerCase();
        currentResults = allData.filter(r =>
            r.name.includes(query) ||
            r.relative.includes(query) ||
            r.name.toLowerCase().includes(queryLower) ||
            r.relative.toLowerCase().includes(queryLower)
        );

        displayedCount = 0;

        if (currentResults.length === 0) {
            showNoResults();
        } else {
            showResults(query);
        }
    }

    function showResults(query) {
        emptyState.style.display = 'none';
        noResults.style.display = 'none';
        resultsSection.classList.add('active');

        statusText.textContent = `"${query}" — ${currentResults.length.toLocaleString()} result${currentResults.length !== 1 ? 's' : ''} found`;
        totalCount.textContent = `${currentResults.length.toLocaleString()} matches`;

        resultsBody.innerHTML = '';
        displayedCount = 0;
        loadMoreResults(query);
    }

    function loadMoreResults(query) {
        const end = Math.min(displayedCount + PAGE_SIZE, currentResults.length);
        const fragment = document.createDocumentFragment();

        for (let i = displayedCount; i < end; i++) {
            const r = currentResults[i];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="yadi-cell"><a href="${escapeHtml(r.pdfLink || '')}" target="_blank" class="pdf-link" title="View PDF">${escapeHtml(r.pdfName || r.yadi)}</a></td>
                <td class="sr-cell">${escapeHtml(r.sr)}</td>
                <td>${escapeHtml(r.house)}</td>
                <td class="name-cell">${highlightMatch(r.name, query)}</td>
                <td>${escapeHtml(r.relation)}</td>
                <td class="relative-cell">${highlightMatch(r.relative, query)}</td>
                <td>${escapeHtml(r.gender)}</td>
                <td class="age-cell">${escapeHtml(r.age)}</td>
                <td class="id-cell">${escapeHtml(r.idCard)}</td>
            `;
            fragment.appendChild(tr);
        }

        resultsBody.appendChild(fragment);
        displayedCount = end;

        // Show/hide load more button
        if (displayedCount < currentResults.length) {
            loadMoreContainer.style.display = 'block';
            loadMoreBtn.textContent = `आणखी पहा (${currentResults.length - displayedCount} remaining)`;
        } else {
            loadMoreContainer.style.display = 'none';
        }
    }

    function showEmptyState() {
        resultsSection.classList.remove('active');
        noResults.style.display = 'none';
        emptyState.style.display = '';
        emptyState.classList.remove('hidden');
        statusText.textContent = allData.length
            ? `AC ${acSelect.value} loaded — ${allData.length.toLocaleString()} voter records`
            : `Data for AC ${acSelect.value} not available.`;

        if (allData.length === 0) {
            emptyState.querySelector('.empty-title').textContent = 'माहिती उपलब्ध नाही (Data Not Available)';
            emptyState.querySelector('.empty-subtitle').textContent = `Voter data for AC ${acSelect.value} is currently being processed.`;
        } else {
            emptyState.querySelector('.empty-title').textContent = 'मतदाराचे नाव टाइप करा';
            emptyState.querySelector('.empty-subtitle').textContent = `Type a voter's name to search in AC ${acSelect.value}`;
        }
        totalCount.textContent = allData.length ? `${allData.length.toLocaleString()} records` : '—';
    }

    function showNoResults() {
        resultsSection.classList.remove('active');
        emptyState.style.display = 'none';
        noResults.style.display = '';
        statusText.textContent = 'No results found';
        totalCount.textContent = '0 matches';
    }

    // ─── Helpers ───────────────────────────────────────────
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function highlightMatch(text, query) {
        if (!text || !query) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const escapedQuery = escapeHtml(query);
        // Case-insensitive highlight
        const regex = new RegExp(`(${escapeRegex(escapedQuery)})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ─── Debounce ──────────────────────────────────────────
    let debounceTimer = null;

    function debounce(fn, ms) {
        return function (...args) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fn(...args), ms);
        };
    }

    // ─── Event Listeners ───────────────────────────────────
    const debouncedSearch = debounce((q) => performSearch(q), DEBOUNCE_MS);

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        clearBtn.classList.toggle('visible', val.length > 0);
        debouncedSearch(val);
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.classList.remove('visible');
        showEmptyState();
        searchInput.focus();
    });

    loadMoreBtn.addEventListener('click', () => {
        const query = searchInput.value.trim();
        loadMoreResults(query);
    });

    // Keyboard shortcut: Escape to clear
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            clearBtn.classList.remove('visible');
            showEmptyState();
            searchInput.focus();
        }
        // Focus search on "/" key
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
    });

    acSelect.addEventListener('change', (e) => {
        loadData(e.target.value);
    });

    // ─── Init ──────────────────────────────────────────────
    loadData(acSelect.value);

})();
