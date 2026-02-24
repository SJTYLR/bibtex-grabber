/**
 * popup.js — BibTeX Grabber popup logic
 * Orchestrates: extraction → metadata display → tag/label UI → BibTeX generation → copy
 */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────

let extractedData    = null;
let selectedTags     = new Set();   // keywords  → keywords = {...}
let suggestedTagList = [];
let selectedLabels   = new Set();   // pp labels → note = {pp-labels: ...}
let suggestedLabelList = [];        // pre-populated from stored labels

// ── DOM refs ───────────────────────────────────────────────────────────────

const statusBar        = document.getElementById('status-bar');
const statusText       = document.getElementById('status-text');
const spinner          = document.getElementById('spinner');
const errorSection     = document.getElementById('error-section');
const errorDetail      = document.getElementById('error-detail');
const metaSection      = document.getElementById('meta-section');
const tagsSection      = document.getElementById('tags-section');
const labelsSection    = document.getElementById('labels-section');
const bibtexSection    = document.getElementById('bibtex-section');
const actionsDiv       = document.getElementById('actions');
const tagsContainer    = document.getElementById('tags-container');
const labelsContainer  = document.getElementById('labels-container');
const bibtexOutput     = document.getElementById('bibtex-output');
const customTagInput   = document.getElementById('custom-tag-input');
const addTagBtn        = document.getElementById('add-tag-btn');
const customLabelInput = document.getElementById('custom-label-input');
const addLabelBtn      = document.getElementById('add-label-btn');
const btnCopy          = document.getElementById('btn-copy');
const btnGenerate      = document.getElementById('btn-generate');
const btnRefresh       = document.getElementById('btn-refresh');
const divTags          = document.getElementById('div-tags');
const divLabels        = document.getElementById('div-labels');
const divBibtex        = document.getElementById('div-bibtex');

// Metadata fields
const fType      = document.getElementById('f-type');
const fKey       = document.getElementById('f-key');
const fTitle     = document.getElementById('f-title');
const fAuthors   = document.getElementById('f-authors');
const fYear      = document.getElementById('f-year');
const fDoi       = document.getElementById('f-doi');
const fVenue     = document.getElementById('f-venue');
const fPublisher = document.getElementById('f-publisher');
const fVolume    = document.getElementById('f-volume');
const fNumber    = document.getElementById('f-number');
const fPages     = document.getElementById('f-pages');
const fUrl       = document.getElementById('f-url');
const fAbstract  = document.getElementById('f-abstract');

// ── Persisted labels ────────────────────────────────────────────────────────
// We remember the user's previous Paperpile labels across popups so they
// can quickly re-apply them without typing. Stored in chrome.storage.local.

const STORAGE_KEY_LABELS = 'pp_saved_labels';

async function loadSavedLabels() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY_LABELS, result => {
      resolve(result[STORAGE_KEY_LABELS] || []);
    });
  });
}

function saveLabels(labels) {
  chrome.storage.local.set({ [STORAGE_KEY_LABELS]: [...labels] });
}

// ── Utility ─────────────────────────────────────────────────────────────────

function setStatus(msg, loading = false) {
  statusText.textContent = msg;
  spinner.style.display = loading ? 'block' : 'none';
}

function showError(msg, detail = '') {
  statusBar.style.display = 'none';
  errorSection.style.display = 'block';
  errorDetail.textContent = detail;
  metaSection.style.display = 'none';
  tagsSection.style.display = 'none';
  labelsSection.style.display = 'none';
  bibtexSection.style.display = 'none';
  divTags.style.display = 'none';
  divLabels.style.display = 'none';
  divBibtex.style.display = 'none';
}

function showUI() {
  statusBar.style.display = 'flex';
  errorSection.style.display = 'none';
  metaSection.style.display = 'block';
  tagsSection.style.display = 'block';
  labelsSection.style.display = 'block';
  bibtexSection.style.display = 'block';
  divTags.style.display = 'block';
  divLabels.style.display = 'block';
  divBibtex.style.display = 'block';
  actionsDiv.style.display = 'flex';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── BibTeX generation ───────────────────────────────────────────────────────

function buildBibtex() {
  const type      = fType.value.trim() || 'misc';
  const key       = fKey.value.trim() || 'unknown2024';
  const title     = fTitle.value.trim();
  const authors   = fAuthors.value.trim();
  const year      = fYear.value.trim();
  const doi       = fDoi.value.trim();
  const venue     = fVenue.value.trim();
  const publisher = fPublisher.value.trim();
  const volume    = fVolume.value.trim();
  const number    = fNumber.value.trim();
  const pages     = fPages.value.trim();
  const url       = fUrl.value.trim();
  const abstract  = fAbstract.value.trim();

  const keywords  = [...selectedTags].join(', ');
  const ppLabels  = [...selectedLabels].join(', ');

  const isConf   = ['inproceedings', 'proceedings'].includes(type);
  const isBook   = ['book', 'incollection'].includes(type);
  const isThesis = ['phdthesis', 'mastersthesis'].includes(type);

  const fields = [];
  const add = (name, val) => { if (val) fields.push([name, val]); };

  add('title',  title  ? `{${title}}` : '');
  add('author', authors);
  add('year',   year);

  if (isConf) {
    add('booktitle', venue);
  } else if (isBook) {
    add('publisher', publisher || venue);
  } else if (isThesis) {
    add('school', publisher || venue);
  } else {
    add('journal',   venue);
    add('volume',    volume);
    add('number',    number);
    add('pages',     pages);
    add('publisher', publisher);
  }

  // arXiv extras
  if (type === 'misc' && extractedData && extractedData.archivePrefix) {
    add('archivePrefix', extractedData.archivePrefix);
    add('eprint',        extractedData.eprint || '');
  }

  add('doi',      doi);
  add('url',      url);
  add('abstract', abstract ? `{${abstract}}` : '');
  add('keywords', keywords);

  // Paperpile labels — stored in `note` with a parseable prefix
  if (ppLabels) {
    add('note', `{pp-labels: ${ppLabels}}`);
  }

  // Build string
  const lines = [`@${type}{${key},`];
  for (const [name, val] of fields) {
    if (!val) continue;
    const wrapped = val.startsWith('{') || val.startsWith('"') ? val : `{${val}}`;
    lines.push(`  ${name.padEnd(14)} = ${wrapped},`);
  }
  lines.push('}');
  return lines.join('\n');
}

// ── Syntax highlighting ─────────────────────────────────────────────────────

function highlightBibtex(raw) {
  return raw
    .split('\n')
    .map(line => {
      if (/^@\w+\{/.test(line)) {
        return line.replace(
          /^(@\w+)\{([^,]+)(,?)$/,
          (_, t, k, c) =>
            `<span class="bib-type">${t}</span>{<span class="bib-key">${escapeHtml(k)}</span>${c}`
        );
      }
      const fieldMatch = line.match(/^(\s*)(\w+)(\s*=\s*)(.*)(,?)$/);
      if (fieldMatch) {
        const [, indent, name, eq, val, comma] = fieldMatch;
        // Special colour for the note/pp-labels line
        const valClass = name === 'note' ? 'bib-label-val' : 'bib-value';
        return `${indent}<span class="bib-field">${name}</span>${escapeHtml(eq)}<span class="${valClass}">${escapeHtml(val)}</span>${comma}`;
      }
      return escapeHtml(line);
    })
    .join('\n');
}

function renderBibtex() {
  const raw = buildBibtex();
  bibtexOutput.innerHTML = highlightBibtex(raw);
}

// ── Fill form from extracted data ──────────────────────────────────────────

function fillForm(data) {
  fType.value      = data.entry_type || 'misc';
  fKey.value       = data.cite_key   || '';
  fTitle.value     = data.title      || '';
  fAuthors.value   = data.authors    || '';
  fYear.value      = data.year       || '';
  fDoi.value       = data.doi        || '';
  fVenue.value     = data.journal || data.conference || '';
  fPublisher.value = data.publisher  || '';
  fVolume.value    = data.volume     || '';
  fNumber.value    = data.issue      || '';
  fPages.value     = data.pages      || '';
  fUrl.value       = data.url        || data.page_url || '';
  fAbstract.value  = data.abstract   || '';
}

// ── Keyword pill rendering ──────────────────────────────────────────────────

function renderTags() {
  tagsContainer.innerHTML = '';
  const allTags = new Set([...suggestedTagList, ...selectedTags]);

  for (const tag of allTags) {
    const el = document.createElement('button');
    const isSelected = selectedTags.has(tag);
    el.className = 'pill ' + (isSelected ? 'kw-selected' : 'kw-suggested');
    el.textContent = tag;
    el.title = isSelected ? 'Click to deselect' : 'Click to add to keywords';
    el.addEventListener('click', () => {
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
      } else {
        selectedTags.add(tag);
      }
      renderTags();
      renderBibtex();
    });
    tagsContainer.appendChild(el);
  }

  if (allTags.size === 0) {
    tagsContainer.innerHTML =
      '<span style="color:var(--text-muted);font-size:12px">No keywords suggested — add below</span>';
  }
}

function computeTagSuggestions(data) {
  const searchText = [
    data.title, data.abstract, data.keywords, data.journal, data.conference,
  ].filter(Boolean).join(' ');

  suggestedTagList = suggestTags(searchText);
  for (const t of suggestedTagList) selectedTags.add(t);
}

// ── Label pill rendering ────────────────────────────────────────────────────

function renderLabels() {
  labelsContainer.innerHTML = '';
  // Show all saved labels as suggestions; selected ones highlighted purple
  const allLabels = new Set([...suggestedLabelList, ...selectedLabels]);

  for (const label of allLabels) {
    const el = document.createElement('button');
    const isSelected = selectedLabels.has(label);
    el.className = 'pill ' + (isSelected ? 'lbl-selected' : 'lbl-suggested');
    el.textContent = label;
    el.title = isSelected ? 'Click to remove label' : 'Click to add label';
    el.addEventListener('click', () => {
      if (selectedLabels.has(label)) {
        selectedLabels.delete(label);
      } else {
        selectedLabels.add(label);
      }
      renderLabels();
      renderBibtex();
      // Persist the full known label set whenever it changes
      saveLabels(new Set([...suggestedLabelList, ...selectedLabels]));
    });
    labelsContainer.appendChild(el);
  }

  if (allLabels.size === 0) {
    labelsContainer.innerHTML =
      '<span style="color:var(--text-muted);font-size:12px">No saved labels — add your Paperpile labels below</span>';
  }
}

// ── Add custom keyword ──────────────────────────────────────────────────────

function addCustomTag() {
  const raw = customTagInput.value.trim();
  if (!raw) return;
  const tag = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (tag) {
    selectedTags.add(tag);
    if (!suggestedTagList.includes(tag)) suggestedTagList.push(tag);
    renderTags();
    renderBibtex();
  }
  customTagInput.value = '';
  customTagInput.focus();
}

// ── Add custom label ────────────────────────────────────────────────────────

function addCustomLabel() {
  const raw = customLabelInput.value.trim();
  if (!raw) return;
  // Labels can have spaces and mixed case — preserve them, just sanitise slightly
  const label = raw.replace(/[{},]/g, '').trim();
  if (label) {
    selectedLabels.add(label);
    if (!suggestedLabelList.includes(label)) suggestedLabelList.push(label);
    renderLabels();
    renderBibtex();
    saveLabels(new Set([...suggestedLabelList, ...selectedLabels]));
  }
  customLabelInput.value = '';
  customLabelInput.focus();
}

// ── Extraction ──────────────────────────────────────────────────────────────

async function extract() {
  setStatus('Extracting metadata…', true);

  let tab;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab;
  } catch (e) {
    showError('Cannot access the current tab.', e.message);
    return;
  }

  // Inject content script if not already present
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (e) { /* already injected or restricted */ }

  // Load saved labels before rendering
  const savedLabels = await loadSavedLabels();
  suggestedLabelList = [...new Set(savedLabels)];

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action: 'extract' }, resp => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Unknown extraction error');
    }

    extractedData = response.data;
    selectedTags = new Set();
    suggestedTagList = [];
    selectedLabels = new Set();

    fillForm(extractedData);
    computeTagSuggestions(extractedData);
    renderTags();
    renderLabels();
    renderBibtex();
    showUI();
    setStatus(`Extracted from: ${(tab.url || '').slice(0, 50)}…`, false);

  } catch (e) {
    // Fallback: tab info only
    extractedData = {
      title:      tab.title || '',
      url:        tab.url   || '',
      page_url:   tab.url   || '',
      entry_type: 'misc',
      cite_key:   'unknown' + new Date().getFullYear(),
    };
    selectedTags = new Set();
    suggestedTagList = [];
    selectedLabels = new Set();

    fillForm(extractedData);
    computeTagSuggestions(extractedData);
    renderTags();
    renderLabels();
    renderBibtex();
    showUI();
    setStatus('Limited extraction — fill in fields manually', false);
  }
}

// ── Copy to clipboard ───────────────────────────────────────────────────────

async function copyBibtex() {
  const raw = buildBibtex();
  try {
    await navigator.clipboard.writeText(raw);
    btnCopy.textContent = '✓ Copied!';
    btnCopy.className = 'btn btn-success';
    setTimeout(() => {
      btnCopy.textContent = '📋 Copy BibTeX';
      btnCopy.className = 'btn btn-primary';
    }, 2000);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = raw;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btnCopy.textContent = '✓ Copied!';
    setTimeout(() => { btnCopy.textContent = '📋 Copy BibTeX'; }, 2000);
  }
}

// ── Live re-render on field edits ──────────────────────────────────────────

[fType, fKey, fTitle, fAuthors, fYear, fDoi, fVenue, fPublisher,
 fVolume, fNumber, fPages, fUrl, fAbstract].forEach(el => {
  el.addEventListener('input', () => renderBibtex());
});

// ── Event listeners ─────────────────────────────────────────────────────────

btnCopy.addEventListener('click', copyBibtex);
btnGenerate.addEventListener('click', renderBibtex);
btnRefresh.addEventListener('click', extract);

addTagBtn.addEventListener('click', addCustomTag);
customTagInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') addCustomTag();
});

addLabelBtn.addEventListener('click', addCustomLabel);
customLabelInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') addCustomLabel();
});

// ── Boot ─────────────────────────────────────────────────────────────────────

extract();
