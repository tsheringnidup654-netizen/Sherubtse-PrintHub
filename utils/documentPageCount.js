const fs = require('fs');
const path = require('path');
const C = require('../config/constants');
const { countPdfPages } = require('./fileCheck');
const { readWordDocumentProperties, readPowerPointDocumentProperties } = require('./wordPageCount');

async function countDocumentPages(filePath, extension) {
  if (extension === '.pdf') return countPdfPages(filePath);
  if (extension === '.doc' || extension === '.docx') return readWordDocumentProperties(filePath);
  if (extension === '.ppt' || extension === '.pptx') return readPowerPointDocumentProperties(filePath);
  return null;
}

async function refreshSinglePageDocuments(documents, userId, setPages) {
  for (const document of documents) {
    if (Number(document.page_count) !== 1) continue;

    const filePath = path.join(C.DOC_DIR, String(userId), document.stored_name);
    if (!fs.existsSync(filePath)) continue;

    const pageCount = await countDocumentPages(filePath, document.extension);
    if (pageCount && pageCount !== 1) {
      await setPages(document.id, userId, pageCount);
      document.page_count = pageCount;
    }
  }
  return documents;
}

module.exports = { countDocumentPages, refreshSinglePageDocuments };
