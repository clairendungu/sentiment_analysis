/* ── SentimentIQ – Frontend Logic ─────────────────────────────── */

// ── Elements ──────────────────────────────────────────────────────
const textInput        = document.getElementById('textInput');
const charCount        = document.getElementById('charCount');
const analyzeBtn       = document.getElementById('analyzeBtn');
const clearBtn         = document.getElementById('clearBtn');
const resultRow        = document.getElementById('resultRow');
const loadingOverlay   = document.getElementById('loadingOverlay');
const errorBanner      = document.getElementById('errorBanner');
const errorText        = document.getElementById('errorText');

const sentimentDisplay = document.getElementById('sentimentDisplay');
const sentimentEmoji   = document.getElementById('sentimentEmoji');
const sentimentLabel   = document.getElementById('sentimentLabel');
const sentimentConf    = document.getElementById('sentimentConf');
const scoreBars        = document.getElementById('scoreBars');
const reportContent    = document.getElementById('reportContent');

const modelBadge       = document.getElementById('modelBadge');
const badgeDot         = modelBadge.querySelector('.badge-dot');
const badgeLabel       = modelBadge.querySelector('.badge-label');

const fileInput        = document.getElementById('fileInput');
const dropZone         = document.getElementById('dropZone');
const fileInfo         = document.getElementById('fileInfo');
const fileName         = document.getElementById('fileName');
const bulkAnalyzeBtn   = document.getElementById('bulkAnalyzeBtn');
const bulkLoadingOverlay = document.getElementById('bulkLoadingOverlay');
const bulkErrorBanner  = document.getElementById('bulkErrorBanner');
const bulkErrorText    = document.getElementById('bulkErrorText');
const bulkSummaryCard  = document.getElementById('bulkSummaryCard');
const bulkSummary      = document.getElementById('bulkSummary');
const bulkTableCard    = document.getElementById('bulkTableCard');
const resultsBody      = document.getElementById('resultsBody');
const exportBtn        = document.getElementById('exportBtn');

const EMOJIS = { Positive: '😊', Negative: '😞', Neutral: '😐' };
let bulkData = null;

// ── Tabs ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab' + capitalise(tab.dataset.tab)).classList.add('active');
  });
});

function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Model status polling ──────────────────────────────────────────
async function pollModelStatus() {
  try {
    const res = await fetch('/model-status');
    const data = await res.json();
    if (data.status === 'ready') {
      badgeDot.className = 'badge-dot ready';
      badgeLabel.textContent = 'Model ready';
      return;
    }
    if (data.status === 'error') {
      badgeDot.className = 'badge-dot error';
      badgeLabel.textContent = 'Model error';
      return;
    }
  } catch (_) {}
  setTimeout(pollModelStatus, 2500);
}
pollModelStatus();

// ── Char counter ──────────────────────────────────────────────────
textInput.addEventListener('input', () => {
  const len = textInput.value.length;
  charCount.textContent = `${len.toLocaleString()} / 5,000`;
  charCount.style.color = len > 4500 ? '#f59e0b' : '';
});

// ── Clear ─────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  textInput.value = '';
  charCount.textContent = '0 / 5,000';
  hideResults();
  hideError();
});

// ── Analyze ───────────────────────────────────────────────────────
analyzeBtn.addEventListener('click', runSingleAnalysis);
textInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runSingleAnalysis();
});

async function runSingleAnalysis() {
  const text = textInput.value.trim();
  if (!text) { showError('Please enter some text to analyze.'); return; }

  hideError();
  hideResults();
  showLoading(true);
  analyzeBtn.disabled = true;

  try {
    const res = await fetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showError(data.error || 'Analysis failed. Please try again.');
      return;
    }
    renderResult(data);
  } catch (err) {
    showError('Network error. Please check your connection and try again.');
  } finally {
    showLoading(false);
    analyzeBtn.disabled = false;
  }
}

// ── Render result ─────────────────────────────────────────────────
function renderResult(data) {
  const { label, confidence, scores, report } = data;
  const cls = label.toLowerCase();

  sentimentDisplay.className = 'sentiment-display ' + cls;
  sentimentEmoji.textContent = EMOJIS[label] || '🔍';
  sentimentLabel.textContent = label;
  sentimentLabel.className = 'sentiment-label ' + cls;
  sentimentConf.textContent = `${confidence}% confidence`;

  // Score bars
  scoreBars.innerHTML = '';
  ['Positive', 'Neutral', 'Negative'].forEach(lbl => {
    const pct = scores[lbl] ?? 0;
    const c = lbl.toLowerCase();
    scoreBars.innerHTML += `
      <div class="score-row">
        <div class="score-row-top"><span>${lbl}</span><span>${pct.toFixed(1)}%</span></div>
        <div class="score-bar-track">
          <div class="score-bar-fill ${c}" style="width:0%" data-target="${pct}"></div>
        </div>
      </div>`;
  });
  // Animate bars
  requestAnimationFrame(() => {
    document.querySelectorAll('.score-bar-fill[data-target]').forEach(el => {
      el.style.width = el.dataset.target + '%';
    });
  });

  // Report
  if (report) renderReport(report);

  resultRow.style.display = '';
  resultRow.classList.remove('animate-in');
  void resultRow.offsetWidth;
  resultRow.classList.add('animate-in');
}

function renderReport(r) {
  const phrases = (r.key_phrases || []).map(p =>
    `<span class="phrase-chip">${escapeHtml(p)}</span>`
  ).join('');

  reportContent.innerHTML = `
    <div class="report-summary">${escapeHtml(r.summary)} ${escapeHtml(r.confidence_note)}</div>
    <div class="report-stats">
      <div class="stat-chip">
        <div class="stat-value">${r.word_count}</div>
        <div class="stat-label">Words</div>
      </div>
      <div class="stat-chip">
        <div class="stat-value">${r.sentence_count}</div>
        <div class="stat-label">Sentences</div>
      </div>
      <div class="stat-chip">
        <div class="stat-value">${r.avg_words_per_sentence}</div>
        <div class="stat-label">Avg Words/Sent.</div>
      </div>
    </div>
    ${phrases ? `
    <div class="report-phrases">
      <h3>Key Phrases</h3>
      <div class="phrase-list">${phrases}</div>
    </div>` : ''}`;
}

// ── Helpers ───────────────────────────────────────────────────────
function showLoading(on) { loadingOverlay.style.display = on ? '' : 'none'; }
function hideResults()   { resultRow.style.display = 'none'; }
function showError(msg)  { errorText.textContent = msg; errorBanner.style.display = ''; }
function hideError()     { errorBanner.style.display = 'none'; }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Bulk Upload ───────────────────────────────────────────────────
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); 
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

dropZone.addEventListener('click', (e) => {
  if (e.target.tagName === 'INPUT') return;
  fileInput.value = ''; // reset so same file can be reselected
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  handleFile(file);
});


function handleFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['txt','csv'].includes(ext)) {
    showBulkError('Only .txt and .csv files are supported.');
    return;
  }
  fileName.textContent = `📄  ${file.name}  (${(file.size/1024).toFixed(1)} KB)`;
  fileInfo.style.display = '';
  hideBulkError();
  fileInfo._file = file;
}

bulkAnalyzeBtn.addEventListener('click', async () => {
  const file = fileInfo._file;
  if (!file) return;

  hideBulkResults();
  hideBulkError();
  bulkLoadingOverlay.style.display = '';
  bulkAnalyzeBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const res = await fetch('/analyze-bulk', { 
      method: 'POST', 
      body: formData,
      signal: controller.signal
});
clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok || data.error) { showBulkError(data.error || 'Analysis failed.'); return; }
    bulkData = data;
    renderBulkResults(data);
  } catch (err) {
    if (err.name === 'AbortError') {
      showBulkError('Request timed out. Please try again.');
    } else {
    showBulkError('Network error. Please try again.');
  }
  } finally {
    bulkLoadingOverlay.style.display = 'none';
    bulkAnalyzeBtn.disabled = false;
  }
});

function renderBulkResults({ rows, summary }) {
  // Summary chips
  bulkSummary.innerHTML = `
    <div class="summary-chip"><div class="val">${summary.total}</div><div class="lbl">Total</div></div>
    <div class="summary-chip positive"><div class="val">${summary.positive}</div><div class="lbl">Positive</div></div>
    <div class="summary-chip negative"><div class="val">${summary.negative}</div><div class="lbl">Negative</div></div>
    <div class="summary-chip neutral"><div class="val">${summary.neutral}</div><div class="lbl">Neutral</div></div>`;
  bulkSummaryCard.style.display = '';

  // Table rows
  resultsBody.innerHTML = rows.map(r => {
    const cls = (r.label || '').toLowerCase();
    const pillHtml = r.label && r.label !== '—'
      ? `<span class="label-pill ${cls}">${r.label}</span>`
      : `<span style="color:var(--text2)">—</span>`;
    const confHtml = r.confidence && r.confidence !== '—'
      ? `<span class="conf-value">${r.confidence}%</span>`
      : `<span class="conf-value">—</span>`;
    return `<tr>
      <td>${r.row}</td>
      <td>${escapeHtml(r.text || '')}</td>
      <td>${pillHtml}</td>
      <td>${confHtml}</td>
    </tr>`;
  }).join('');

  bulkTableCard.style.display = '';
}

function hideBulkResults() {
  bulkSummaryCard.style.display = 'none';
  bulkTableCard.style.display = 'none';
}
function showBulkError(msg) { bulkErrorText.textContent = msg; bulkErrorBanner.style.display = ''; }
function hideBulkError()    { bulkErrorBanner.style.display = 'none'; }

// ── Export CSV ────────────────────────────────────────────────────
exportBtn.addEventListener('click', () => {
  if (!bulkData) return;
  const headers = ['Row', 'Text', 'Sentiment', 'Confidence (%)'];
  const rows = bulkData.rows.map(r => [r.row, r.text, r.label, r.confidence]);
  const csvContent = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'sentiment_results.csv' });
  a.click(); URL.revokeObjectURL(url);
});

// ── Example placeholder text on load ─────────────────────────────
const examples = [
  "The product exceeded all my expectations! The delivery was fast and the quality is outstanding. Highly recommend to everyone.",
  "Absolutely terrible experience. The app crashed three times and customer support never responded to my emails.",
  "The conference was held downtown on Tuesday. Approximately 200 people attended the keynote session.",
];
textInput.setAttribute('placeholder',
  examples[Math.floor(Math.random() * examples.length)] +
  '\n\n— or type / paste your own text here…');
