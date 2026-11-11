// Audio is already compressed. Store it unchanged in a standards-compliant ZIP
// on the staff computer, avoiding server response limits and extra dependencies.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
export function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
export function audioZip(files: Array<{ name: string; bytes: Uint8Array }>): Blob {
  if (!files.length || files.length > 500) throw new Error("Choose between 1 and 500 audio files.");
  const parts: ArrayBuffer[] = [], directory: ArrayBuffer[] = [];
  const seen = new Set<string>();
  let offset = 0, directorySize = 0;
  for (const file of files) {
    if (!file.name || /[\\/\x00]/.test(file.name) || seen.has(file.name)) throw new Error("Invalid or duplicate audio filename.");
    seen.add(file.name);
    const name = new TextEncoder().encode(file.name);
    if (name.length > 65535 || offset + file.bytes.length > 200 * 1024 * 1024) throw new Error("Audio ZIP exceeds 200 MB. Use a smaller batch.");
    const crc = crc32(file.bytes);
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 33, true);
    h.setUint32(14, crc, true); h.setUint32(18, file.bytes.length, true); h.setUint32(22, file.bytes.length, true); h.setUint16(26, name.length, true); header.set(name, 30);
    const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, file.bytes.length, true); c.setUint32(24, file.bytes.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46);
    parts.push(header.buffer, Uint8Array.from(file.bytes).buffer); directory.push(central.buffer);
    offset += header.length + file.bytes.length; directorySize += central.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.buffer], { type: "application/zip" });
}

