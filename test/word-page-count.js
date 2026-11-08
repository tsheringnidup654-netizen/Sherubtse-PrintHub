const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { PDFDocument } = require('pdf-lib');
const { countPdfPages } = require('../utils/fileCheck');
const { readWordDocumentProperties, readPowerPointDocumentProperties } = require('../utils/wordPageCount');

function makeDocx(pages) {
  return makeZip([['docProps/app.xml', `<Properties><Pages>${pages}</Pages></Properties>`]]);
}

function makePptx(slides) {
  return makeZip(Array.from({ length: slides }, (_, i) => [`ppt/slides/slide${i + 1}.xml`, '<slide/>']));
}

function makeZip(entries) {
  const localEntries = [];
  const centralEntries = [];
  let localOffset = 0;
  for (const [fileName, content] of entries) {
    const name = Buffer.from(fileName);
    const xml = Buffer.from(content);
    const compressed = zlib.deflateRawSync(xml);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(xml.length, 22);
    local.writeUInt16LE(name.length, 26);
    localEntries.push(Buffer.concat([local, name, compressed]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(xml.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralEntries.push(Buffer.concat([central, name]));
    localOffset += localEntries[localEntries.length - 1].length;
  }
  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localEntries, centralDirectory, end]);
}

function makeOleDocument(pages, streamName, propertyId) {
  const file = Buffer.alloc(512 * 6);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(file);
  file.writeUInt16LE(9, 30);
  file.writeUInt16LE(6, 32);
  file.writeUInt32LE(1, 44);
  file.writeUInt32LE(2, 48);
  file.writeUInt32LE(4096, 56);
  file.writeUInt32LE(4, 60);
  file.writeUInt32LE(1, 64);
  file.writeUInt32LE(0xfffffffe, 68);
  file.writeUInt32LE(0, 72);
  for (let i = 0; i < 109; i += 1) file.writeUInt32LE(0xffffffff, 76 + i * 4);
  file.writeUInt32LE(1, 76);

  const sectorOffset = (id) => (id + 1) * 512;
  const fat = sectorOffset(1);
  file.writeUInt32LE(0xfffffffd, fat);
  file.writeUInt32LE(0xfffffffd, fat + 4);
  file.writeUInt32LE(0xfffffffe, fat + 8);
  file.writeUInt32LE(0xfffffffe, fat + 12);
  file.writeUInt32LE(0xfffffffe, fat + 16);

  const directory = sectorOffset(2);
  const writeEntry = (offset, name, type, start, size) => {
    const nameBytes = Buffer.from(`${name}\0`, 'utf16le');
    nameBytes.copy(file, directory + offset);
    file.writeUInt16LE(nameBytes.length, directory + offset + 64);
    file[directory + offset + 66] = type;
    file.writeUInt32LE(start, directory + offset + 116);
    file.writeBigUInt64LE(BigInt(size), directory + offset + 120);
  };
  writeEntry(0, 'Root Entry', 5, 3, 128);
  writeEntry(128, streamName, 2, 0, 72);

  const miniFat = sectorOffset(4);
  file.writeUInt32LE(1, miniFat);
  file.writeUInt32LE(0xfffffffe, miniFat + 4);
  const properties = Buffer.alloc(72);
  properties.writeUInt16LE(0xfffe, 0);
  properties.writeUInt32LE(1, 24);
  properties.writeUInt32LE(48, 44);
  properties.writeUInt32LE(24, 48);
  properties.writeUInt32LE(1, 52);
  properties.writeUInt32LE(propertyId, 56);
  properties.writeUInt32LE(16, 60);
  properties.writeUInt32LE(3, 64);
  properties.writeUInt32LE(pages, 68);
  properties.copy(file, sectorOffset(3));
  return file;
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'printhub-page-count-'));
  try {
  const samples = [
    ['docx', makeDocx(7), readWordDocumentProperties, 7],
    ['doc', makeOleDocument(5, '\u0005SummaryInformation', 14), readWordDocumentProperties, 5],
    ['pptx', makePptx(4), readPowerPointDocumentProperties, 4],
    ['ppt', makeOleDocument(6, '\u0005DocumentSummaryInformation', 7), readPowerPointDocumentProperties, 6],
  ];
  for (const [extension, fixture, readPageCount, expected] of samples) {
    const file = path.join(tempDir, `sample.${extension}`);
    fs.writeFileSync(file, fixture);
    assert.strictEqual(readPageCount(file), expected, `${extension} page count`);
  }
  const pdf = path.join(tempDir, 'sample.pdf');
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage();
  pdfDoc.addPage();
  pdfDoc.addPage();
  fs.writeFileSync(pdf, await pdfDoc.save());
  assert.strictEqual(await countPdfPages(pdf), 3, 'PDF page count');
  console.log('PDF, Word and PowerPoint page-count tests passed.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

run().catch((err) => { console.error(err); process.exitCode = 1; });
