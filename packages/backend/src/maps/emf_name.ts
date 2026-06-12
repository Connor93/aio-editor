// Decode the map name out of an EMF header. The name is a 24-byte EO-encoded
// fixed-width field at offset 7 (after the 3-byte "EMF" magic + a 4-byte hash),
// so only the first 31 bytes of a map file are needed to read it.
//
// `decodeString` is ported verbatim from eomap-js
// (src/core/data/eo-decode.js): reverse the bytes, then flip every byte in the
// printable range 0x22..0x7e, with an alternating ±0x2e adjustment.

function decodeString(bytes: number[]): number[] {
  bytes.reverse();
  let flippy = bytes.length % 2 === 1;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i] ?? 0;
    let f = 0;
    if (flippy) {
      f = 0x2e;
      if (c >= 0x50) f = -f;
    }
    if (c >= 0x22 && c <= 0x7e) {
      bytes[i] = 0x9f - c - f;
    }
    flippy = !flippy;
  }
  return bytes;
}

/** Extract the map name from an EMF header buffer (needs the first >= 31 bytes).
 *  Returns the trimmed name, or null if the buffer isn't an EMF or has no name
 *  (the 24-byte field is 0xFF/0x00-padded). */
export function decodeEmfName(header: Buffer): string | null {
  if (header.length < 31) return null;
  if (header.toString("latin1", 0, 3) !== "EMF") return null;
  const nameBytes = Array.from(header.subarray(7, 31));
  const decoded = decodeString(nameBytes);
  // Strip EO padding (0xFF, and historically 0x00) — never part of a real name.
  const trimmed = decoded.filter((b) => b !== 0xff && b !== 0x00);
  const name = Buffer.from(trimmed).toString("latin1").trim();
  return name.length > 0 ? name : null;
}
