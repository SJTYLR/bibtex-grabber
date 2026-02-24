/**
 * background.js — BibTeX Grabber service worker
 * Handles extension lifecycle events.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('BibTeX Grabber installed.');
});
