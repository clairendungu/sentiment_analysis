"""
Sentiment Analysis Dashboard — Flask Backend
Run: python app.py
"""

import os
import io
import csv
import json
import re
import threading
from collections import Counter
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Model loading (lazy, thread-safe)
# ---------------------------------------------------------------------------
_model_lock = threading.Lock()
_classifier = None
_model_loading = False
_model_error = None

MODEL_ID = "cardiffnlp/twitter-roberta-base-sentiment-latest"

LABEL_MAP = {
    "positive": "Positive",
    "negative": "Negative",
    "neutral":  "Neutral",
}

STOP_WORDS = set("""
a about above after again against all am an and any are aren't as at be
because been before being below between both but by can't cannot could
couldn't did didn't do does doesn't doing don't down during each few for
from further get got had hadn't has hasn't have haven't having he he'd
he'll he's her here here's hers herself him himself his how how's i i'd
i'll i'm i've if in into is isn't it it's its itself let's me more most
mustn't my myself no nor not of off on once only or other ought our ours
ourselves out over own same shan't she she'd she'll she's should shouldn't
so some such than that that's the their theirs them themselves then there
there's these they they'd they'll they're they've this those through to too
under until up very was wasn't we we'd we'll we're we've were weren't what
what's when when's where where's which while who who's whom why why's will
with won't would wouldn't you you'd you'll you're you've your yours yourself
yourselves just like really very much also even though still even
""".split())


def _load_model():
    global _classifier, _model_loading, _model_error
    try:
        from transformers import pipeline
        _classifier = pipeline(
            "text-classification",
            model=MODEL_ID,
            top_k=None,
            truncation=True,
            max_length=512,
        )
    except Exception as exc:
        _model_error = str(exc)
    finally:
        _model_loading = False


def get_classifier():
    global _classifier, _model_loading, _model_error
    with _model_lock:
        if _classifier is None and not _model_loading and _model_error is None:
            _model_loading = True
            t = threading.Thread(target=_load_model, daemon=True)
            t.start()
    return _classifier, _model_loading, _model_error


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def normalize_label(raw_label: str) -> str:
    raw = raw_label.lower().strip()
    for key, val in LABEL_MAP.items():
        if key in raw:
            return val
    return raw.capitalize()


def extract_key_phrases(text: str, top_n: int = 8) -> list[str]:
    """Simple frequency-based key phrase extractor."""
    text_clean = re.sub(r"[^a-zA-Z\s]", " ", text.lower())
    words = [w for w in text_clean.split() if w and w not in STOP_WORDS and len(w) > 3]
    freq = Counter(words)
    return [w for w, _ in freq.most_common(top_n)]


def generate_report(text: str, label: str, confidence: float) -> dict:
    word_count = len(text.split())
    sentence_count = max(1, len(re.findall(r'[.!?]+', text)))
    key_phrases = extract_key_phrases(text)

    tone_map = {
        "Positive": "The text expresses an overall positive sentiment, suggesting satisfaction, optimism, or approval.",
        "Negative": "The text conveys a negative sentiment, indicating dissatisfaction, frustration, or criticism.",
        "Neutral":  "The text appears neutral or factual, without strong emotional indicators in either direction.",
    }
    summary = tone_map.get(label, "Sentiment analysis complete.")
    if confidence >= 0.85:
        confidence_note = "The model is highly confident in this prediction."
    elif confidence >= 0.65:
        confidence_note = "The model is moderately confident in this prediction."
    else:
        confidence_note = "The model has low confidence; the text may be ambiguous."

    return {
        "summary": summary,
        "confidence_note": confidence_note,
        "word_count": word_count,
        "sentence_count": sentence_count,
        "avg_words_per_sentence": round(word_count / sentence_count, 1),
        "key_phrases": key_phrases,
    }


def run_inference(text: str) -> dict:
    classifier, loading, error = get_classifier()
    if error:
        return {"error": f"Model failed to load: {error}"}
    if loading or classifier is None:
        return {"error": "model_loading"}

    results = classifier(text)[0]
    best = max(results, key=lambda x: x["score"])
    label = normalize_label(best["label"])
    confidence = round(best["score"] * 100, 2)
    scores = {normalize_label(r["label"]): round(r["score"] * 100, 2) for r in results}
    return {"label": label, "confidence": confidence, "scores": scores}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/model-status")
def model_status():
    classifier, loading, error = get_classifier()
    if error:
        return jsonify({"status": "error", "message": error})
    if loading or classifier is None:
        return jsonify({"status": "loading"})
    return jsonify({"status": "ready"})


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify({"error": "Please enter some text to analyze."}), 400
    if len(text) > 5000:
        return jsonify({"error": "Text exceeds 5000 character limit."}), 400

    result = run_inference(text)
    if "error" in result:
        if result["error"] == "model_loading":
            return jsonify({"error": "Model is still loading. Please try again in a few seconds."}), 503
        return jsonify(result), 500

    result["report"] = generate_report(text, result["label"], result["confidence"] / 100)
    return jsonify(result)

@app.route("/analyze-bulk", methods=["POST"])
def analyze_bulk():
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400
    file = request.files["file"]
    filename = file.filename.lower()
    texts = []
    if filename.endswith(".csv"):
        content = file.read().decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(content))
        fieldnames = reader.fieldnames or []
        text_col = next(
            (f for f in fieldnames if "text" in f.lower()),
            fieldnames[0] if fieldnames else None,
        )
        if text_col is None:
            return jsonify({"error": "CSV must have at least one column."}), 400
        texts = [(i + 1, row.get(text_col, "").strip()) for i, row in enumerate(reader)]
    elif filename.endswith(".txt"):
        content = file.read().decode("utf-8", errors="replace")
        lines = [l.strip() for l in content.splitlines() if l.strip()]
        texts = [(i + 1, line) for i, line in enumerate(lines)]
    else:
        return jsonify({"error": "Only .txt and .csv files are supported."}), 400
    if not texts:
        return jsonify({"error": "File is empty or contains no valid text."}), 400
    if len(texts) > 200:
        return jsonify({"error": "Bulk limit is 200 rows. Please split your file."}), 400

    rows = []
    label_counts = Counter()

    # Separate empty and valid texts
    valid_texts = [(idx, text) for idx, text in texts if text]
    empty_texts = [(idx, text) for idx, text in texts if not text]

    # Add empty rows immediately
    for idx, text in empty_texts:
        rows.append({"row": idx, "text": "", "label": "—", "confidence": "—", "error": "Empty"})

    # Batch process valid texts
    classifier, loading, error = get_classifier()
    if error:
        return jsonify({"error": f"Model failed to load: {error}"}), 500
    if loading or classifier is None:
        return jsonify({"error": "Model is still loading. Please try again."}), 503

    # Run all texts through model in one batch
    batch_texts = [text[:512] for idx, text in valid_texts]
    batch_results = classifier(batch_texts, batch_size=16)

    for (idx, text), result in zip(valid_texts, batch_results):
        best = max(result, key=lambda x: x["score"])
        label = normalize_label(best["label"])
        confidence = round(best["score"] * 100, 2)
        label_counts[label] += 1
        rows.append({
            "row": idx,
            "text": text[:80] + ("…" if len(text) > 80 else ""),
            "label": label,
            "confidence": confidence,
        })

    # Sort rows by row number to maintain original order
    rows.sort(key=lambda x: x["row"])

    summary = {
        "total": len(texts),
        "positive": label_counts.get("Positive", 0),
        "negative": label_counts.get("Negative", 0),
        "neutral": label_counts.get("Neutral", 0),
    }
    return jsonify({"rows": rows, "summary": summary})
# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Pre-warm model in background
    get_classifier()
    app.run(host="0.0.0.0", port=7860, debug=False)
