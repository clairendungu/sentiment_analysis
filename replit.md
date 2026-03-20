# SentimentIQ — Sentiment Analysis Dashboard

## Overview
A production-ready, full-stack sentiment analysis web application. Users can analyze text sentiment (Positive / Negative / Neutral) with confidence scores, key phrase extraction, and statistics reports. Supports single text analysis and bulk file uploads (.txt / .csv).

## Architecture
- **Backend**: Python 3.11 + Flask (`app.py`)
- **Frontend**: Vanilla HTML/CSS/JS served by Flask (`templates/index.html`, `static/`)
- **AI Model**: `cardiffnlp/twitter-roberta-base-sentiment-latest` via HuggingFace Transformers pipeline
- **Port**: 5000 (0.0.0.0)

## Project Structure
```
app.py                  — Flask backend + API endpoints
templates/index.html    — Dashboard UI
static/css/style.css    — Dark theme styling
static/js/app.js        — Frontend logic
sentiment_analysis (1).ipynb  — Original training notebook (DistilBERT fine-tuning)
```

## API Endpoints
- `GET  /`               — Serve dashboard
- `GET  /model-status`   — Model loading status (loading/ready/error)
- `POST /analyze`        — Single text analysis → `{label, confidence, scores, report}`
- `POST /analyze-bulk`   — File upload (.txt/.csv) → `{rows[], summary}`

## Key Features
- 3-class sentiment (Positive / Negative / Neutral)
- Confidence scores with animated bar charts
- Sentiment report: word count, sentence count, key phrases
- Bulk file upload: up to 200 rows, CSV export
- Live model status indicator
- Dark dashboard-style UI, fully responsive

## Dependencies
- `flask` — web framework
- `transformers` — HuggingFace pipeline for inference
- `torch` (CPU-only build) — PyTorch backend
- `numpy`, `matplotlib`, `seaborn`, `pandas`, `scikit-learn` — data/ML utilities
- `datasets`, `accelerate`, `evaluate` — HuggingFace ecosystem (for notebook training)

## Workflow
- **Start application**: `python app.py` on port 5000

## Notes
- Model (`cardiffnlp/twitter-roberta-base-sentiment-latest`) is downloaded from HuggingFace on first run and cached.
- PyTorch installed as CPU-only build to reduce disk usage.
- Model loads lazily in a background thread on startup; the UI shows a status badge.
- The original Jupyter notebook fine-tunes DistilBERT on `tweet_eval`; the web app uses the pre-trained RoBERTa model directly for immediate inference.
