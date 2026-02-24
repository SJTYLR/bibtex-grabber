/**
 * popup.js — BibTeX Grabber popup logic
 * Orchestrates: extraction → metadata display → BibTeX generation → copy
 */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────

let extractedData = null;

// ── DOM refs ───────────────────────────────────────────────────────────────

const statusBar    = document.getElementById('status-bar');
const statusText   = document.getElementById('status-text');
const spinner      = document.getElementById('spinner');
const errorSection = document.getElementById('error-section');
const errorDetail  = document.getElementById('error-detail');
const metaSection  = document.getElementById('meta-section');
const bibtexSection = document.getElementById('bibtex-section');
const actionsDiv   = document.getElementById('actions');
const bibtexOutput = document.getElementById('bibtex-output');
const btnCopy      = document.getElementById('btn-copy');
const btnRefresh   = document.getElementById('btn-refresh');
const divBibtex    = document.getElementById('div-bibtex');
const venueLabel   = document.getElementById('venue-label');
const publisherLabel = document.getElementById('publisher-label');

// Metadata fields
const fType      = document.getElementById('f-type');
const fKey       = document.getElementById('f-key');
const fTitle     = document.getElementById('f-title');
const fAuthors   = document.getElementById('f-authors');
const fYear      = document.getElementById('f-year');
const fMonth     = document.getElementById('f-month');
const fDay       = document.getElementById('f-day');
const fDoi       = document.getElementById('f-doi');
const fVenue     = document.getElementById('f-venue');
const fPublisher = document.getElementById('f-publisher');
const fVolume    = document.getElementById('f-volume');
const fNumber    = document.getElementById('f-number');
const fPages     = document.getElementById('f-pages');
const fUrl       = document.getElementById('f-url');
const fAbstract  = document.getElementById('f-abstract');

// ── Venue label + BibTeX field name per entry type ──────────────────────────
//
// Each entry maps to:
//   venueLabel     — human-readable label shown in the UI
//   venueBibField  — the BibTeX field name to emit (journaltitle, booktitle, …)
//   publisherLabel — human-readable label for the publisher/org field
//   pubBibField    — BibTeX field name for publisher row
//
const TYPE_VENUE_MAP = {
  'article':           { venueLabel: 'Journal',                 venueBibField: 'journal',      publisherLabel: 'Publisher',      pubBibField: 'publisher' },
  'inproceedings':     { venueLabel: 'Conference / Booktitle',  venueBibField: 'booktitle',    publisherLabel: 'Publisher',      pubBibField: 'publisher' },
  'proceedings':       { venueLabel: 'Conference / Booktitle',  venueBibField: 'booktitle',    publisherLabel: 'Publisher',      pubBibField: 'publisher' },
  'book':              { venueLabel: 'Series',                  venueBibField: 'series',       publisherLabel: 'Publisher',      pubBibField: 'publisher' },
  'incollection':      { venueLabel: 'Book Title',              venueBibField: 'booktitle',    publisherLabel: 'Publisher',      pubBibField: 'publisher' },
  'phdthesis':         { venueLabel: 'Institution / School',    venueBibField: 'school',       publisherLabel: 'Address',        pubBibField: 'address'   },
  'mastersthesis':     { venueLabel: 'Institution / School',    venueBibField: 'school',       publisherLabel: 'Address',        pubBibField: 'address'   },
  'techreport':        { venueLabel: 'Institution',             venueBibField: 'institution',  publisherLabel: 'Report Number',  pubBibField: 'number'    },
  'report':            { venueLabel: 'Institution',             venueBibField: 'institution',  publisherLabel: 'Report Number',  pubBibField: 'number'    },
  'online':            { venueLabel: 'Website',                 venueBibField: 'organization', publisherLabel: 'Publisher / Org',pubBibField: 'publisher' },
  'misc':              { venueLabel: 'How Published',           venueBibField: 'howpublished', publisherLabel: 'Publisher',      pubBibField: 'publisher' },
  'software':          { venueLabel: 'Repository / Platform',   venueBibField: 'organization', publisherLabel: 'Publisher / Org',pubBibField: 'publisher' },
  'dataset':           { venueLabel: 'Repository / Platform',   venueBibField: 'organization', publisherLabel: 'Publisher / Org',pubBibField: 'publisher' },
  'video':             { venueLabel: 'Channel / Platform',      venueBibField: 'organization', publisherLabel: 'Publisher / Org',pubBibField: 'publisher' },
  'article-newspaper': { venueLabel: 'Newspaper',               venueBibField: 'journaltitle', publisherLabel: 'Publisher',      pubBibField: 'publisher' },
  'article-magazine':  { venueLabel: 'Magazine',                venueBibField: 'journaltitle', publisherLabel: 'Publisher',      pubBibField: 'publisher' },
  'article-blog':      { venueLabel: 'Blog / Website',          venueBibField: 'journaltitle', publisherLabel: 'Publisher / Org',pubBibField: 'publisher' },
  'patent':            { venueLabel: 'Patent Office',           venueBibField: 'organization', publisherLabel: 'Holder',         pubBibField: 'holder'    },
  'standard':          { venueLabel: 'Standards Body',          venueBibField: 'organization', publisherLabel: 'Number',         pubBibField: 'number'    },
  'manual':            { venueLabel: 'Organisation',            venueBibField: 'organization', publisherLabel: 'Address',        pubBibField: 'address'   },
  'unpublished':       { venueLabel: 'Note / Venue',            venueBibField: 'note',         publisherLabel: 'Address',        pubBibField: 'address'   },
};

function getTypeConfig(type) {
  return TYPE_VENUE_MAP[type] || TYPE_VENUE_MAP['article'];
}

function updateVenueLabels() {
  const cfg = getTypeConfig(fType.value);
  venueLabel.textContent   = cfg.venueLabel;
  publisherLabel.textContent = cfg.publisherLabel;
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
  bibtexSection.style.display = 'none';
  divBibtex.style.display = 'none';
}

function showUI() {
  statusBar.style.display = 'flex';
  errorSection.style.display = 'none';
  metaSection.style.display = 'block';
  bibtexSection.style.display = 'block';
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
  const type   = fType.value.trim() || 'misc';
  const key    = fKey.value.trim()  || 'unknown2024';
  const title  = fTitle.value.trim();

  // Authors: UI uses ";" separator → BibTeX uses " and "
  const authors = fAuthors.value.trim()
    .split(/\s*;\s*/)
    .map(s => s.trim())
    .filter(Boolean)
    .join(' and ');

  const year      = fYear.value.trim();
  const month     = fMonth.value.trim();
  const day       = fDay.value.trim();
  const doi       = fDoi.value.trim();
  const venue     = fVenue.value.trim();
  const publisher = fPublisher.value.trim();
  const volume    = fVolume.value.trim();
  const number    = fNumber.value.trim();
  const pages     = fPages.value.trim();
  const url       = fUrl.value.trim();
  const abstract  = fAbstract.value.trim();

  const cfg = getTypeConfig(type);

  const fields = [];
  const add = (name, val) => { if (val) fields.push([name, val]); };

  add('title',  title ? `{${title}}` : '');
  add('author', authors);
  add('year',   year);
  add('month',  month);
  add('day',    day);

  // Venue field — name depends on type
  add(cfg.venueBibField, venue);

  // Volume / number / pages — only for types that use them
  const usesVolumePages = ['article', 'inproceedings', 'proceedings', 'incollection',
    'article-newspaper', 'article-magazine', 'article-blog'].includes(type);
  if (usesVolumePages) {
    add('volume', volume);
    add('number', number);
    add('pages',  pages);
  }

  // Publisher / org field — name depends on type
  if (cfg.pubBibField !== cfg.venueBibField) {
    add(cfg.pubBibField, publisher);
  }

  // arXiv extras
  if (type === 'misc' && extractedData && extractedData.archivePrefix) {
    add('archivePrefix', extractedData.archivePrefix);
    add('eprint',        extractedData.eprint || '');
  }

  add('doi',    doi);
  add('url',    url);

  // Access date for web/online sources
  const isWebType = ['online', 'software', 'dataset', 'video', 'article-blog',
    'article-newspaper', 'article-magazine'].includes(type);
  if (isWebType && url) {
    add('urldate', new Date().toISOString().slice(0, 10));
  }

  add('abstract', abstract ? `{${abstract}}` : '');

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
      if (/^@[\w-]+\{/.test(line)) {
        return line.replace(
          /^(@[\w-]+)\{([^,]+)(,?)$/,
          (_, t, k, c) =>
            `<span class="bib-type">${t}</span>{<span class="bib-key">${escapeHtml(k)}</span>${c}`
        );
      }
      const fieldMatch = line.match(/^(\s*)([\w-]+)(\s*=\s*)(.*)(,?)$/);
      if (fieldMatch) {
        const [, indent, name, eq, val, comma] = fieldMatch;
        return `${indent}<span class="bib-field">${name}</span>${escapeHtml(eq)}<span class="bib-value">${escapeHtml(val)}</span>${comma}`;
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
  // Convert "and"-separated authors from content.js to ";" for the UI
  fAuthors.value   = (data.authors || '')
    .split(/\s+and\s+/i)
    .map(s => s.trim())
    .filter(Boolean)
    .join('; ');
  fYear.value      = data.year      || '';
  fMonth.value     = data.month     || '';
  fDay.value       = data.day       || '';
  fDoi.value       = data.doi       || '';
  // Venue: use journal, conference, or site_name depending on what was found
  fVenue.value     = data.journal || data.conference || data.site_name || '';
  fPublisher.value = data.publisher || data.organization || '';
  fVolume.value    = data.volume    || '';
  fNumber.value    = data.issue     || '';
  fPages.value     = data.pages     || '';
  fUrl.value       = data.url       || data.page_url || '';
  fAbstract.value  = data.abstract  || '';

  updateVenueLabels();
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
    fillForm(extractedData);
    renderBibtex();
    showUI();
    setStatus(`Extracted from: ${(tab.url || '').slice(0, 55)}…`, false);

  } catch (e) {
    // Fallback: use tab title + URL
    extractedData = {
      title:      tab.title || '',
      url:        tab.url   || '',
      page_url:   tab.url   || '',
      entry_type: 'online',
      cite_key:   'unknown' + new Date().getFullYear(),
    };
    fillForm(extractedData);
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

fType.addEventListener('change', () => {
  updateVenueLabels();
  renderBibtex();
});

[fKey, fTitle, fAuthors, fYear, fMonth, fDay, fDoi, fVenue, fPublisher,
 fVolume, fNumber, fPages, fUrl, fAbstract].forEach(el => {
  el.addEventListener('input', () => renderBibtex());
});

// ── Event listeners ─────────────────────────────────────────────────────────

btnCopy.addEventListener('click', copyBibtex);
btnRefresh.addEventListener('click', extract);

// ── Boot ─────────────────────────────────────────────────────────────────────

extract();
