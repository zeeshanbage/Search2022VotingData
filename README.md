# SearchSIRMapping — Beed District Voter Search

A client-side voter roll search website for **all 7 Assembly Constituencies** of District Beed, Maharashtra (2002 Electoral Roll Data). 
[196 GEORAI, 197 MAJALGAON, 198 BEED, 199 ASHTI, 200 CHOUSALA, 201 KAIJ, 202 RENAPUR].

## 🚀 Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzeeshanbage%2FSearch2022VotingData)

## 🔍 Live Demo

Visit:
**https://beed-matdar-yadi-2002.vercel.app/**
**https://zeeshanbage.github.io/Search2022VotingData/**

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
