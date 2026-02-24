/**
 * content.js — BibTeX Grabber content script
 * Extracts bibliographic metadata from the current page using:
 *  1. Dublin Core / OpenGraph / Twitter meta tags
 *  2. Highwire Press meta tags (used by Google Scholar, many journals)
 *  3. Eprints / BE Press meta tags
 *  4. JSON-LD structured data (schema.org ScholarlyArticle, Article, Book)
 *  5. DOI detection from URL and page text
 *  6. arXiv-specific extraction
 *  7. PubMed-specific extraction
 *  8. Semantic Scholar extraction
 *  9. Fallback: page title, URL, domain heuristics
 */

(function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getMeta(name) {
    const sel = [
      `meta[name="${name}"]`,
      `meta[property="${name}"]`,
      `meta[name="${name.toLowerCase()}"]`,
      `meta[property="${name.toLowerCase()}"]`,
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el && el.content) return el.content.trim();
    }
    return '';
  }

  function getAllMeta(name) {
    const results = [];
    const sels = [
      `meta[name="${name}"]`,
      `meta[property="${name}"]`,
    ];
    for (const s of sels) {
      document.querySelectorAll(s).forEach(el => {
        if (el.content) results.push(el.content.trim());
      });
    }
    return results;
  }

  function extractDOI(text) {
    const match = text.match(/\b(10\.\d{4,}(?:\.\d+)*\/\S+?)(?:[)\]}>,"'\s]|$)/);
    return match ? match[1] : '';
  }

  function cleanText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function titleCase(str) {
    return str; // keep as-is; BibTeX consumers handle casing
  }

  const MONTH_MAP = {
    '01': 'jan', '02': 'feb', '03': 'mar', '04': 'apr',
    '05': 'may', '06': 'jun', '07': 'jul', '08': 'aug',
    '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dec',
    'january': 'jan', 'february': 'feb', 'march': 'mar', 'april': 'apr',
    'june': 'jun', 'july': 'jul', 'august': 'aug', 'september': 'sep',
    'october': 'oct', 'november': 'nov', 'december': 'dec',
  };

  function parseDateParts(dateStr) {
    if (!dateStr) return {};
    // ISO: 2024-03-15 or 2024/03/15
    const isoMatch = dateStr.match(/(\d{4})[-/](\d{2})(?:[-/](\d{2}))?/);
    if (isoMatch) {
      return {
        year:  isoMatch[1],
        month: MONTH_MAP[isoMatch[2]] || isoMatch[2],
        day:   isoMatch[3] ? String(parseInt(isoMatch[3], 10)) : '',
      };
    }
    // Year only
    const yearOnly = dateStr.match(/\b(19|20)\d{2}\b/);
    if (yearOnly) return { year: yearOnly[0], month: '', day: '' };
    return {};
  }

  function toAuthorBib(raw) {
    // Accepts "First Last", "Last, First", semicolon-separated lists,
    // or "and"-separated lists — normalises to " and " for BibTeX
    if (!raw) return '';
    const parts = raw
      .split(/\s*;\s*|\s+and\s+/i)
      .map(s => s.trim())
      .filter(Boolean);
    return parts.join(' and ');
  }

  // ── Extract from JSON-LD ───────────────────────────────────────────────────

  // JSON-LD @type → BibTeX entry type
  const JSONLD_TYPE_MAP = {
    'scholararticle': 'article',
    'article':        'article',
    'newsarticle':    'article-newspaper',
    'blogposting':    'article-blog',
    'blogentry':      'article-blog',
    'book':           'book',
    'thesis':         'phdthesis',
    'report':         'report',
    'techreport':     'techreport',
    'softwaresourcecode': 'software',
    'softwareapplication': 'software',
    'dataset':        'dataset',
    'videoobject':    'video',
    'webpage':        'online',
    'webpageelement': 'online',
    'website':        'online',
  };

  function fromJsonLd() {
    const result = {};
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        // Handle @graph arrays (common on news sites)
        let items = Array.isArray(data) ? data : [data];
        if (data['@graph']) items = [...items, ...data['@graph']];

        for (const item of items) {
          const rawType = (item['@type'] || '').toLowerCase();
          const mappedType = JSONLD_TYPE_MAP[rawType];
          if (!mappedType) continue;

          if (!result.entry_type) result.entry_type = mappedType;

          // Title
          if (item.headline && !result.title) result.title = cleanText(item.headline);
          if (item.name && !result.title)     result.title = cleanText(item.name);

          // Authors / creators
          if (item.author && !result.authors) {
            const authors = Array.isArray(item.author) ? item.author : [item.author];
            result.authors = authors.map(a => {
              if (typeof a === 'string') return a;
              return cleanText(a.name || '');
            }).filter(Boolean).join(' and ');
          }

          // Date
          const dateStr = item.datePublished || item.uploadDate || item.dateCreated;
          if (dateStr && !result.year) {
            const dp = parseDateParts(String(dateStr));
            result.year  = dp.year  || String(dateStr).slice(0, 4);
            result.month = dp.month || '';
            result.day   = dp.day   || '';
          }

          // Publisher / organization
          if (item.publisher && !result.publisher) {
            const pub = item.publisher;
            result.publisher = cleanText(typeof pub === 'string' ? pub : pub.name || '');
          }
          if (item.productionCompany && !result.publisher) {
            result.publisher = cleanText(item.productionCompany.name || item.productionCompany);
          }

          // Description / abstract
          if (item.description && !result.abstract) {
            result.abstract = cleanText(item.description);
          }

          // Identifiers
          if (item.identifier) {
            const ids = Array.isArray(item.identifier) ? item.identifier : [item.identifier];
            for (const i of ids) {
              const val = typeof i === 'string' ? i : (i.value || '');
              if (val.startsWith('10.') && !result.doi) result.doi = val;
              if ((val.startsWith('978') || val.startsWith('979')) && !result.isbn) result.isbn = val;
            }
          }
          if (item.sameAs) {
            const sameAs = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
            for (const s of sameAs) {
              const doi = extractDOI(s);
              if (doi && !result.doi) result.doi = doi;
            }
          }

          // Journal / publication (isPartOf)
          if (item.isPartOf && !result.journal) {
            const part = item.isPartOf;
            result.journal = cleanText(typeof part === 'string' ? part : part.name || '');
          }

          // Site name / organization for web types
          if (item.copyrightHolder && !result.site_name) {
            result.site_name = cleanText(typeof item.copyrightHolder === 'string'
              ? item.copyrightHolder : item.copyrightHolder.name || '');
          }
        }
      } catch (e) { /* skip malformed JSON-LD */ }
    }
    return result;
  }

  // ── Extract from Highwire / Dublin Core / OG meta tags ────────────────────

  function fromMeta() {
    const result = {};

    // Title
    result.title = getMeta('citation_title') ||
                   getMeta('dc.title') ||
                   getMeta('DC.title') ||
                   getMeta('og:title') ||
                   '';

    // Authors — collect multiple citation_author tags
    const hwAuthors = getAllMeta('citation_author');
    if (hwAuthors.length) {
      result.authors = hwAuthors.join(' and ');
    } else {
      result.authors = getMeta('dc.creator') ||
                       getMeta('DC.Creator') ||
                       getMeta('author') ||
                       '';
    }

    // Year / Month / Day from date fields
    const dateFields = [
      'citation_publication_date', 'citation_date',
      'dc.date', 'DC.date', 'article:published_time', 'og:updated_time',
      'date', 'pubdate',
    ];
    for (const f of dateFields) {
      const v = getMeta(f);
      if (v) {
        const parts = parseDateParts(v);
        if (parts.year) { result.year = parts.year; result.month = parts.month || ''; result.day = parts.day || ''; break; }
      }
    }

    // Site name for web sources
    result.site_name = getMeta('og:site_name') || '';

    // Journal / Booktitle
    result.journal = getMeta('citation_journal_title') ||
                     getMeta('dc.source') ||
                     getMeta('DC.source') ||
                     '';
    result.conference = getMeta('citation_conference_title') || '';
    result.volume     = getMeta('citation_volume') || '';
    result.issue      = getMeta('citation_issue') || '';
    result.pages      = getMeta('citation_firstpage') ?
      `${getMeta('citation_firstpage')}--${getMeta('citation_lastpage')}` : '';
    result.doi        = getMeta('citation_doi') ||
                        getMeta('dc.identifier') ||
                        getMeta('DC.Identifier') ||
                        '';
    if (result.doi && !result.doi.startsWith('10.')) result.doi = '';

    result.abstract   = getMeta('citation_abstract') ||
                        getMeta('dc.description') ||
                        getMeta('DC.description') ||
                        getMeta('og:description') ||
                        getMeta('description') ||
                        '';

    result.publisher  = getMeta('citation_publisher') ||
                        getMeta('dc.publisher') ||
                        getMeta('DC.publisher') ||
                        '';

    result.isbn       = getMeta('citation_isbn') || '';
    result.issn       = getMeta('citation_issn') || '';
    result.pdf_url    = getMeta('citation_pdf_url') || '';

    // Keywords from meta
    result.keywords   = getMeta('citation_keywords') ||
                        getMeta('keywords') ||
                        getMeta('Keywords') ||
                        '';

    return result;
  }

  // ── arXiv ─────────────────────────────────────────────────────────────────

  function fromArxiv() {
    if (!location.hostname.includes('arxiv.org')) return {};
    const result = { source: 'arxiv' };

    const titleEl = document.querySelector('h1.title, .title.mathjax');
    if (titleEl) {
      result.title = cleanText(titleEl.textContent.replace(/^Title:?\s*/i, ''));
    }

    const authorsEl = document.querySelector('.authors');
    if (authorsEl) {
      const names = [...authorsEl.querySelectorAll('a')].map(a => cleanText(a.textContent));
      result.authors = names.join(' and ');
    }

    const absEl = document.querySelector('.abstract, blockquote.abstract');
    if (absEl) {
      result.abstract = cleanText(absEl.textContent.replace(/^Abstract:?\s*/i, ''));
    }

    const submitted = document.querySelector('.dateline');
    if (submitted) {
      const txt = submitted.textContent;
      // e.g. "Submitted on 14 Mar 2024"
      const fullDate = txt.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
      if (fullDate) {
        result.year  = fullDate[3];
        result.month = MONTH_MAP[fullDate[2].toLowerCase()] || fullDate[2].toLowerCase().slice(0, 3);
        result.day   = String(parseInt(fullDate[1], 10));
      } else {
        const m = txt.match(/(\d{4})/);
        if (m) result.year = m[1];
      }
    }

    // arXiv ID from URL
    const idMatch = location.pathname.match(/abs\/([\d.]+)/);
    if (idMatch) {
      result.arxiv_id = idMatch[1];
      result.url = `https://arxiv.org/abs/${idMatch[1]}`;
      result.entry_type = 'misc';
      result.eprint = idMatch[1];
      result.archivePrefix = 'arXiv';
    }

    return result;
  }

  // ── PubMed ────────────────────────────────────────────────────────────────

  function fromPubmed() {
    if (!location.hostname.includes('pubmed.ncbi.nlm.nih.gov')) return {};
    const result = { source: 'pubmed' };

    const titleEl = document.querySelector('h1.heading-title, .article-title');
    if (titleEl) result.title = cleanText(titleEl.textContent);

    const authorsEl = document.querySelectorAll('.authors-list .full-name, .authors .author-name');
    if (authorsEl.length) {
      result.authors = [...authorsEl].map(el => cleanText(el.textContent)).join(' and ');
    }

    const abstractEl = document.querySelector('#abstract, .abstract-content');
    if (abstractEl) result.abstract = cleanText(abstractEl.textContent);

    const journalEl = document.querySelector('.journal-title, .cit .title-item');
    if (journalEl) result.journal = cleanText(journalEl.textContent);

    const yearEl = document.querySelector('.cit');
    if (yearEl) {
      const txt = yearEl.textContent;
      const fullDate = txt.match(/(\d{4})\s+([A-Za-z]+)(?:\s+(\d{1,2}))?/);
      if (fullDate) {
        result.year  = fullDate[1];
        result.month = MONTH_MAP[fullDate[2].toLowerCase()] || fullDate[2].toLowerCase().slice(0, 3);
        if (fullDate[3]) result.day = String(parseInt(fullDate[3], 10));
      } else {
        const m = txt.match(/\b(19|20)\d{2}\b/);
        if (m) result.year = m[0];
      }
    }

    const doiEl = document.querySelector('[data-ga-action="DOI"] .id-link, a[href*="doi.org"]');
    if (doiEl) {
      const href = doiEl.href || doiEl.textContent;
      result.doi = extractDOI(href);
    }

    const pmidMatch = location.pathname.match(/(\d{6,})/);
    if (pmidMatch) result.pmid = pmidMatch[1];

    return result;
  }

  // ── Semantic Scholar ───────────────────────────────────────────────────────

  function fromSemanticScholar() {
    if (!location.hostname.includes('semanticscholar.org')) return {};
    const result = { source: 'semantic_scholar' };

    const titleEl = document.querySelector('h1[data-heap-id="paper_title"], h1.sv-text-display1');
    if (titleEl) result.title = cleanText(titleEl.textContent);

    const authorsEl = document.querySelectorAll('[data-heap-id="author_name"], .author-list .author-name');
    if (authorsEl.length) {
      result.authors = [...authorsEl].map(el => cleanText(el.textContent)).join(' and ');
    }

    const abstractEl = document.querySelector('[data-heap-id="paper_abstract_text"], .abstract__text');
    if (abstractEl) result.abstract = cleanText(abstractEl.textContent);

    return result;
  }

  // ── Springer / Elsevier / Wiley / ACM / IEEE heuristics ───────────────────

  function fromPublisherHeuristics() {
    const host = location.hostname;
    const result = {};

    // Volume / Issue often in breadcrumb or citation block
    const volMatch = document.body.innerText.match(/\bVolume?\s*(\d+)/i);
    const issMatch = document.body.innerText.match(/\bIssue?\s*(\d+)/i);
    if (volMatch && !result.volume) result.volume = volMatch[1];
    if (issMatch && !result.issue) result.issue = issMatch[1];

    // Pages
    const pagesMatch = document.body.innerText.match(/\bpp?\.?\s*(\d+)\s*[–—-]\s*(\d+)/i);
    if (pagesMatch) result.pages = `${pagesMatch[1]}--${pagesMatch[2]}`;

    return result;
  }

  // ── DOI from URL / page ────────────────────────────────────────────────────

  function extractDoiFromPage() {
    // Try URL first
    const urlDoi = extractDOI(decodeURIComponent(location.href));
    if (urlDoi) return urlDoi;

    // Scan visible text in citation/doi elements
    const selectors = [
      '[class*="doi"]', '[id*="doi"]', 'a[href*="doi.org"]',
      '[class*="citation"]', '[class*="article-info"]',
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const doi = extractDOI(el.textContent + ' ' + (el.href || ''));
        if (doi) return doi;
      }
    }
    return '';
  }

  // ── Generic webpage / news / blog scraping ────────────────────────────────

  function fromWebpage() {
    const result = {};
    const host = location.hostname.replace(/^www\./, '');

    // Site name from OG or domain
    result.site_name = getMeta('og:site_name') || host;

    // Published date from common patterns
    const dateSelectors = [
      'time[datetime]', '[class*="publish"] time', '[class*="date"] time',
      '[itemprop="datePublished"]', '[property="article:published_time"]',
      '[class*="post-date"]', '[class*="article-date"]', '[class*="pubdate"]',
      '.date', '.published', '.post-meta time',
    ];
    for (const sel of dateSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const raw = el.getAttribute('datetime') || el.getAttribute('content') || el.textContent;
        const parts = parseDateParts(raw);
        if (parts.year) { result.year = parts.year; result.month = parts.month || ''; result.day = parts.day || ''; break; }
      }
    }

    // Author from byline
    const authorSelectors = [
      '[rel="author"]', '[class*="author-name"]', '[class*="byline"] [class*="name"]',
      '[itemprop="author"]', '.author', '.byline', '[class*="author"] a',
    ];
    for (const sel of authorSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length) {
        const names = [...els].map(el => cleanText(el.textContent)).filter(n => n && n.length < 60);
        if (names.length) { result.authors = names.join(' and '); break; }
      }
    }

    // Description / abstract from OG or meta description
    result.abstract = getMeta('og:description') || getMeta('description') || '';

    // For web types the site_name doubles as the organization/venue
    result.organization = result.site_name;

    return result;
  }

  // ── Determine entry type ───────────────────────────────────────────────────

  function guessEntryType(data) {
    if (data.entry_type) return data.entry_type;
    const host = location.hostname.replace(/^www\./, '');

    // Use JSON-LD type hint if available
    if (data._jsonld_type) return data._jsonld_type;

    // Preprint servers
    if (host.includes('arxiv.org') || host.includes('biorxiv.org') ||
        host.includes('medrxiv.org') || host.includes('ssrn.com') ||
        host.includes('osf.io')) return 'misc';

    // Academic journals / conferences
    if (data.conference) return 'inproceedings';
    if (data.isbn && !data.journal) return 'book';
    if (data.journal) return 'article';

    // Thesis
    if (host.includes('thesis') || document.title.toLowerCase().includes('thesis')) return 'phdthesis';

    // News / blogs / magazines
    const ogType = getMeta('og:type');
    if (ogType === 'article') {
      const newsHosts = ['nytimes.com', 'theguardian.com', 'bbc.', 'reuters.com',
        'washingtonpost.com', 'apnews.com', 'bloomberg.com', 'ft.com', 'economist.com'];
      if (newsHosts.some(h => host.includes(h))) return 'article-newspaper';
      const blogIndicators = ['medium.com', 'substack.com', 'wordpress.com',
        'blogspot.com', 'ghost.io', 'beehiiv.com'];
      if (blogIndicators.some(h => host.includes(h))) return 'article-blog';
      return 'article-magazine';
    }

    // Software / dataset repos
    if (host.includes('github.com') || host.includes('gitlab.com') ||
        host.includes('pypi.org') || host.includes('npmjs.com') ||
        host.includes('cran.r-project.org')) return 'software';
    if (host.includes('zenodo.org') || host.includes('figshare.com') ||
        host.includes('kaggle.com') || host.includes('huggingface.co')) return 'dataset';

    // Video
    if (host.includes('youtube.com') || host.includes('youtu.be') ||
        host.includes('vimeo.com') || host.includes('ted.com')) return 'video';

    // Generic website
    if (data.site_name && !data.doi) return 'online';

    if (data.publisher && !data.journal) return 'book';
    return 'misc';
  }

  // ── Generate cite key ──────────────────────────────────────────────────────

  function generateCiteKey(data) {
    const firstAuthor = (data.authors || '').split(/\s+and\s+|\s*;\s*/i)[0].trim();
    // Last name: last token, or before comma
    let lastName = '';
    if (firstAuthor.includes(',')) {
      lastName = firstAuthor.split(',')[0].trim();
    } else {
      const parts = firstAuthor.split(/\s+/);
      lastName = parts[parts.length - 1] || '';
    }
    lastName = lastName.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'unknown';

    const year = data.year || 'XXXX';

    // First significant word of title
    const titleWords = (data.title || '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !/^(the|and|for|with|from|that|this|are|was|were|has|have|been|about|into|over|after|under|between|through)$/i.test(w));
    const titleWord = (titleWords[0] || 'untitled').replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 10);

    return `${lastName}${year}${titleWord}`;
  }

  // ── Main extraction ────────────────────────────────────────────────────────

  function extract() {
    const meta   = fromMeta();
    const jsonld = fromJsonLd();
    const arxiv  = fromArxiv();
    const pubmed = fromPubmed();
    const ss     = fromSemanticScholar();
    const pub    = fromPublisherHeuristics();
    const web    = fromWebpage();

    // Merge: site-specific > Highwire meta > JSON-LD > webpage heuristics
    function pick(...vals) { return vals.find(v => v && v.trim && v.trim()) || ''; }

    const data = {
      title:        pick(arxiv.title, pubmed.title, ss.title, meta.title, jsonld.title, document.title),
      authors:      pick(arxiv.authors, pubmed.authors, ss.authors, meta.authors, jsonld.authors, web.authors),
      year:         pick(arxiv.year, pubmed.year, meta.year, jsonld.year, web.year),
      month:        pick(arxiv.month, pubmed.month, meta.month, jsonld.month, web.month),
      day:          pick(arxiv.day, pubmed.day, meta.day, jsonld.day, web.day),
      journal:      pick(pubmed.journal, meta.journal, jsonld.journal),
      conference:   pick(meta.conference),
      volume:       pick(meta.volume, pub.volume),
      issue:        pick(meta.issue, pub.issue),
      pages:        pick(meta.pages, pub.pages),
      doi:          pick(pubmed.doi, meta.doi, jsonld.doi) || extractDoiFromPage(),
      abstract:     pick(arxiv.abstract, pubmed.abstract, ss.abstract, meta.abstract, jsonld.abstract, web.abstract),
      publisher:    pick(meta.publisher, jsonld.publisher, web.publisher),
      organization: pick(web.organization),
      isbn:         pick(meta.isbn, jsonld.isbn),
      issn:         pick(meta.issn),
      keywords:     pick(meta.keywords),
      url:          pick(arxiv.url, location.href),
      pdf_url:      pick(meta.pdf_url),
      source:       pick(arxiv.source, pubmed.source, ss.source),
      site_name:    pick(meta.site_name, jsonld.site_name, web.site_name),
      // arXiv specific
      eprint:        arxiv.eprint || '',
      archivePrefix: arxiv.archivePrefix || '',
      arxiv_id:      arxiv.arxiv_id || '',
    };

    // entry_type: arxiv/pubmed hard-set first, then JSON-LD hint, then heuristic
    if (arxiv.entry_type) {
      data.entry_type = arxiv.entry_type;
    } else {
      // Pass jsonld.entry_type as a hint into guessEntryType via a temporary field
      data._jsonld_type = jsonld.entry_type || '';
      data.entry_type = guessEntryType(data);
      delete data._jsonld_type;
    }

    data.cite_key  = generateCiteKey(data);
    data.page_url  = location.href;

    return data;
  }

  // Listen for extraction request from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extract') {
      try {
        sendResponse({ success: true, data: extract() });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    }
    return true; // keep channel open for async
  });

})();
