const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { readWordDocumentProperties } = require('../utils/wordPageCount');

function makeDocx(pages) {
  const name = Buffer.from('docProps/app.xml');
  const xml = Buffer.from(`<Properties><Pages>${pages}</Pages></Properties>`);
  const compressed = zlib.deflateRawSync(xml);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(xml.length, 22);
  local.writeUInt16LE(name.length, 26);
  const localEntry = Buffer.concat([local, name, compressed]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(xml.length, 24);
  central.writeUInt16LE(name.length, 28);
  const centralEntry = Buffer.concat([central, name]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralEntry.length, 12);
  end.writeUInt32LE(localEntry.length, 16);
  return Buffer.concat([localEntry, centralEntry, end]);
}

function makeDoc(pages) {
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
  writeEntry(128, '\u0005SummaryInformation', 2, 0, 72);

  const miniFat = sectorOffset(4);
  file.writeUInt32LE(1, miniFat);
  file.writeUInt32LE(0xfffffffe, miniFat + 4);
  const properties = Buffer.alloc(72);
  properties.writeUInt16LE(0xfffe, 0);
  properties.writeUInt32LE(1, 24);
  properties.writeUInt32LE(48, 44);
  properties.writeUInt32LE(24, 48);
  properties.writeUInt32LE(1, 52);
  properties.writeUInt32LE(14, 56);
  properties.writeUInt32LE(16, 60);
  properties.writeUInt32LE(3, 64);
  properties.writeUInt32LE(pages, 68);
  properties.copy(file, sectorOffset(3));
  return file;
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'printhub-word-pages-'));
try {
  for (const [extension, fixture] of [['docx', makeDocx(7)], ['doc', makeDoc(5)]]) {
    const file = path.join(tempDir, `sample.${extension}`);
    fs.writeFileSync(file, fixture);
    assert.strictEqual(readWordDocumentProperties(file), extension === 'docx' ? 7 : 5);
  }
  console.log('Word page-count metadata tests passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
