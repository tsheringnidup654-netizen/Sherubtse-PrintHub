const fs = require('fs');
const zlib = require('zlib');

const FREE_SECTOR = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;
const FAT_SECTOR = 0xfffffffd;
const DIFAT_SECTOR = 0xfffffffc;
const MAX_APP_PROPERTIES_BYTES = 64 * 1024;
const MAX_WORD_DOCUMENT_XML_BYTES = 12 * 1024 * 1024;

function readWordDocumentProperties(filePath) {
  const file = fs.readFileSync(filePath);
  if (file.length >= 4 && file.readUInt32LE(0) === 0x04034b50) {
    return readDocxProperties(file);
  }
  if (file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    return readDocProperties(file);
  }
  return null;
}

function readPowerPointDocumentProperties(filePath) {
  const file = fs.readFileSync(filePath);
  if (file.length >= 4 && file.readUInt32LE(0) === 0x04034b50) {
    return readPptxSlideCount(file);
  }
  if (file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    return readDocProperties(file, '\u0005DocumentSummaryInformation', 7);
  }
  return null;
}

function readZipDirectory(file) {
  const minEndOffset = Math.max(0, file.length - 22 - 0xffff);
  let endOffset = -1;
  for (let i = file.length - 22; i >= minEndOffset; i -= 1) {
    if (file.readUInt32LE(i) === 0x06054b50) {
      endOffset = i;
      break;
    }
  }
  if (endOffset < 0 || endOffset + 22 > file.length) return null;
  if (file.readUInt16LE(endOffset + 4) !== 0 || file.readUInt16LE(endOffset + 6) !== 0) return null;
  const entryCount = file.readUInt16LE(endOffset + 10);
  const centralSize = file.readUInt32LE(endOffset + 12);
  const centralOffset = file.readUInt32LE(endOffset + 16);
  if (entryCount === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) return null;
  if (centralOffset + centralSize > endOffset) return null;

  const entries = [];
  let cursor = centralOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > centralOffset + centralSize || file.readUInt32LE(cursor) !== 0x02014b50) return null;
    const nameLength = file.readUInt16LE(cursor + 28);
    const extraLength = file.readUInt16LE(cursor + 30);
    const commentLength = file.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > centralOffset + centralSize) return null;
    entries.push({
      name: file.toString('utf8', cursor + 46, cursor + 46 + nameLength),
      flags: file.readUInt16LE(cursor + 8),
      method: file.readUInt16LE(cursor + 10),
      compressedSize: file.readUInt32LE(cursor + 20),
      uncompressedSize: file.readUInt32LE(cursor + 24),
      localOffset: file.readUInt32LE(cursor + 42),
    });
    cursor = next;
  }
  return entries;
}

function readZipEntry(file, entry) {
  if (!entry || entry.flags & 1 || (entry.method !== 0 && entry.method !== 8)) return null;
  if (entry.uncompressedSize > MAX_APP_PROPERTIES_BYTES || entry.compressedSize > file.length) return null;
  if (entry.localOffset + 30 > file.length || file.readUInt32LE(entry.localOffset) !== 0x04034b50) return null;
  const localNameLength = file.readUInt16LE(entry.localOffset + 26);
  const localExtraLength = file.readUInt16LE(entry.localOffset + 28);
  const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
  if (dataOffset + entry.compressedSize > file.length) return null;
  const compressed = file.subarray(dataOffset, dataOffset + entry.compressedSize);
  let data;
  try {
    data = entry.method === 0
      ? compressed
      : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_APP_PROPERTIES_BYTES });
  } catch (err) {
    if (err.code === 'ERR_BUFFER_TOO_LARGE' || err.code === 'Z_DATA_ERROR') return null;
    throw err;
  }
  return data.length === entry.uncompressedSize ? data : null;
}

function readWordDocumentXml(file, entry) {
  if (!entry || entry.flags & 1 || (entry.method !== 0 && entry.method !== 8)) return null;
  if (entry.uncompressedSize > MAX_WORD_DOCUMENT_XML_BYTES || entry.compressedSize > file.length) return null;
  if (entry.localOffset + 30 > file.length || file.readUInt32LE(entry.localOffset) !== 0x04034b50) return null;
  const localNameLength = file.readUInt16LE(entry.localOffset + 26);
  const localExtraLength = file.readUInt16LE(entry.localOffset + 28);
  const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
  if (dataOffset + entry.compressedSize > file.length) return null;
  const compressed = file.subarray(dataOffset, dataOffset + entry.compressedSize);
  let data;
  try {
    data = entry.method === 0
      ? compressed
      : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_WORD_DOCUMENT_XML_BYTES });
  } catch (err) {
    if (err.code === 'ERR_BUFFER_TOO_LARGE' || err.code === 'Z_DATA_ERROR') return null;
    throw err;
  }
  return data.length === entry.uncompressedSize ? data : null;
}

function readDocxProperties(file) {
  const entries = readZipDirectory(file);
  if (!entries) return null;
  const documentXml = readWordDocumentXml(
    file,
    entries.find((entry) => entry.name === 'word/document.xml')
  );
  let renderedPageCount = null;
  if (documentXml) {
    const body = documentXml.toString('utf8');
    const renderedBreaks = (body.match(/<(?:[\w.-]+:)?lastRenderedPageBreak\b[^>]*\/?>/g) || []).length;
    const explicitBreaks = (body.match(/<(?:[\w.-]+:)?br\b(?=[^>]*\btype=["']page["'])[^>]*\/?>/g) || []).length;
    const breaks = Math.max(renderedBreaks, explicitBreaks);
    if (breaks > 0 && breaks < 5000) renderedPageCount = breaks + 1;
  }
  const app = entries.find((entry) => entry.name === 'docProps/app.xml');
  const xml = readZipEntry(file, app);
  const match = xml && xml.toString('utf8').match(/<(?:[\w.-]+:)?Pages>\s*(\d+)\s*<\/(?:[\w.-]+:)?Pages>/);
  const metadataPages = match ? Number(match[1]) : null;
  const validMetadata = Number.isInteger(metadataPages) && metadataPages > 0 && metadataPages <= 5000
    ? metadataPages
    : null;
  if (renderedPageCount && validMetadata) return Math.max(renderedPageCount, validMetadata);
  return renderedPageCount || validMetadata;
}

function readPptxSlideCount(file) {
  const entries = readZipDirectory(file);
  if (!entries) return null;
  const slides = entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name)).length;
  return slides > 0 && slides <= 5000 ? slides : null;
}

function readDocProperties(file, streamName = '\u0005SummaryInformation', propertyId = 14) {
  const sectorShift = file.readUInt16LE(30);
  const miniSectorShift = file.readUInt16LE(32);
  const sectorSize = 2 ** sectorShift;
  const miniSectorSize = 2 ** miniSectorShift;
  if (![512, 4096].includes(sectorSize) || miniSectorSize !== 64 || file.length < 512) return null;

  const sector = (id) => {
    const offset = (id + 1) * sectorSize;
    return offset >= 512 && offset + sectorSize <= file.length ? file.subarray(offset, offset + sectorSize) : null;
  };

  const fatSectorIds = [];
  for (let i = 0; i < 109; i += 1) {
    const id = file.readUInt32LE(76 + i * 4);
    if (id !== FREE_SECTOR) fatSectorIds.push(id);
  }
  let nextDifat = file.readUInt32LE(68);
  const difatCount = file.readUInt32LE(72);
  const difatCapacity = sectorSize / 4 - 1;
  for (let i = 0; i < difatCount; i += 1) {
    const block = sector(nextDifat);
    if (!block) return null;
    for (let j = 0; j < difatCapacity; j += 1) {
      const id = block.readUInt32LE(j * 4);
      if (id !== FREE_SECTOR) fatSectorIds.push(id);
    }
    nextDifat = block.readUInt32LE(sectorSize - 4);
    if (nextDifat === END_OF_CHAIN && i + 1 < difatCount) return null;
  }
  const fatCount = file.readUInt32LE(44);
  if (!fatCount || fatSectorIds.length < fatCount) return null;

  const fatBlocks = fatSectorIds.slice(0, fatCount).map(sector);
  if (fatBlocks.some((block) => !block)) return null;
  const fat = Buffer.concat(fatBlocks);
  const chain = (start, table, capacity) => {
    const ids = [];
    const seen = new Set();
    let id = start;
    while (id !== END_OF_CHAIN && id !== FREE_SECTOR) {
      if (id === FAT_SECTOR || id === DIFAT_SECTOR || id >= capacity || seen.has(id)) return null;
      ids.push(id);
      seen.add(id);
      id = table.readUInt32LE(id * 4);
    }
    return ids;
  };
  const readRegularStream = (start, length) => {
    const ids = chain(start, fat, fat.length / 4);
    if (!ids) return null;
    const blocks = ids.map(sector);
    if (blocks.some((block) => !block)) return null;
    return Buffer.concat(blocks).subarray(0, length);
  };
  const directory = readRegularStream(file.readUInt32LE(48), file.length);
  if (!directory) return null;

  const entries = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directory.readUInt16LE(offset + 64);
    const type = directory[offset + 66];
    if (type !== 0 && nameLength >= 2 && nameLength <= 64 && nameLength % 2 === 0) {
      const name = directory.toString('utf16le', offset, offset + nameLength - 2);
      const start = directory.readUInt32LE(offset + 116);
      const sizeBig = directory.readBigUInt64LE(offset + 120);
      if (sizeBig <= BigInt(Number.MAX_SAFE_INTEGER)) {
        entries.push({ name, type, start, size: Number(sizeBig) });
      }
    }
  }
  const summary = entries.find((entry) => entry.type === 2 && entry.name === streamName);
  if (!summary) return null;

  let properties;
  const miniCutoff = file.readUInt32LE(56);
  if (summary.size >= miniCutoff) {
    properties = readRegularStream(summary.start, summary.size);
  } else {
    const root = entries.find((entry) => entry.type === 5);
    if (!root) return null;
    const miniStream = readRegularStream(root.start, root.size);
    const miniFatStart = file.readUInt32LE(60);
    const miniFatCount = file.readUInt32LE(64);
    if (!miniStream || !miniFatCount) return null;
    const miniFatBytes = readRegularStream(miniFatStart, miniFatCount * sectorSize);
    if (!miniFatBytes) return null;
    const miniFat = miniFatBytes.subarray(0, miniFatBytes.length - (miniFatBytes.length % 4));
    const ids = chain(summary.start, miniFat, miniFat.length / 4);
    if (!ids) return null;
    const parts = ids.map((id) => {
      const offset = id * miniSectorSize;
      return offset + miniSectorSize <= miniStream.length
        ? miniStream.subarray(offset, offset + miniSectorSize)
        : null;
    });
    if (parts.some((part) => !part)) return null;
    properties = Buffer.concat(parts).subarray(0, summary.size);
  }
  return readSummaryPageCount(properties, propertyId);
}

function readSummaryPageCount(properties, targetPropertyId) {
  if (!properties || properties.length < 48 || properties.readUInt16LE(0) !== 0xfffe) return null;
  const sectionOffset = properties.readUInt32LE(44);
  if (sectionOffset + 8 > properties.length) return null;
  const sectionSize = properties.readUInt32LE(sectionOffset);
  const propertyCount = properties.readUInt32LE(sectionOffset + 4);
  if (sectionOffset + sectionSize > properties.length || propertyCount > (sectionSize - 8) / 8) return null;
  for (let i = 0; i < propertyCount; i += 1) {
    const entryOffset = sectionOffset + 8 + i * 8;
    const propertyId = properties.readUInt32LE(entryOffset);
    const valueOffset = properties.readUInt32LE(entryOffset + 4);
    const value = sectionOffset + valueOffset;
    if (propertyId !== targetPropertyId) continue;
    if (value + 8 > sectionOffset + sectionSize) return null;
    const type = properties.readUInt32LE(value);
    if (type !== 3 && type !== 19) return null;
    const pages = properties.readUInt32LE(value + 4);
    return pages > 0 && pages <= 5000 ? pages : null;
  }
  return null;
}

module.exports = { readWordDocumentProperties, readPowerPointDocumentProperties };
