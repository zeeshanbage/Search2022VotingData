# SearchSIRMapping — Voter Roll Search

A client-side voter roll search website for **198 BEED Assembly Constituency**, District Beed, Maharashtra (2002 Electoral Roll Data).

## 🔍 Live Demo

Visit: **https://zeeshanbage.github.io/Search2022VotingData/**

## Features

- **91,309 voter records** searchable by name (Marathi/Hindi)
- Instant client-side search — no server needed
- Highlights matching text in voter name and relative name
- Shows **Yadi (Part Number)** for each result
- All 8 columns: अ.क्र, घर क्रमांक, नाव, नाते, नातेवाईक, लिंग, वय, ओळख पत्र
- Premium dark glassmorphism UI
- Mobile responsive

## Data Source

[CEO Election Maharashtra](https://ceoelection.maharashtra.gov.in/2002/2002rolldata.aspx) — District: Beed, Assembly Constituency: 198 BEED, Parts 142–218.

## How It Works

1. `extract_data.js` parses 77 electoral roll PDFs using `pdfjs-dist`
2. Outputs `website/voter_data.json` (91,309 records)
3. `website/` contains a static HTML/CSS/JS app that loads the JSON and searches client-side
