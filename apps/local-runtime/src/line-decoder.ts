export type DecodedLine = { kind: "line"; text: string } | { kind: "too_large" };

/**
 * Splits a byte stream into newline-delimited lines with a hard size cap.
 * An oversized line is reported once and its remaining bytes are dropped up to
 * the next newline, so a peer cannot grow the buffer without bound.
 */
export class LineDecoder {
  readonly #maxBytes: number;
  #pending: Buffer[] = [];
  #pendingBytes = 0;
  #discarding = false;

  constructor(maxBytes: number) {
    this.#maxBytes = maxBytes;
  }

  push(chunk: Buffer): DecodedLine[] {
    const lines: DecodedLine[] = [];
    let start = 0;

    while (start < chunk.length) {
      const newline = chunk.indexOf(0x0a, start);
      const end = newline === -1 ? chunk.length : newline;
      const piece = chunk.subarray(start, end);

      if (!this.#discarding) {
        if (this.#pendingBytes + piece.length > this.#maxBytes) {
          this.#discarding = true;
          this.#pending = [];
          this.#pendingBytes = 0;
          lines.push({ kind: "too_large" });
        } else {
          this.#pending.push(piece);
          this.#pendingBytes += piece.length;
        }
      }

      if (newline === -1) {
        break;
      }

      if (!this.#discarding) {
        let text = Buffer.concat(this.#pending).toString("utf8");
        if (text.endsWith("\r")) {
          text = text.slice(0, -1);
        }
        if (text.trim() !== "") {
          lines.push({ kind: "line", text });
        }
      }

      this.#pending = [];
      this.#pendingBytes = 0;
      this.#discarding = false;
      start = newline + 1;
    }

    return lines;
  }
}
