import { expect, it } from "vitest";
import { LineDecoder } from "./line-decoder.js";

it("splits newline-delimited input and strips carriage returns", () => {
  const decoder = new LineDecoder(1024);
  expect(decoder.push(Buffer.from('{"a":1}\r\n{"b":2}\n'))).toEqual([
    { kind: "line", text: '{"a":1}' },
    { kind: "line", text: '{"b":2}' },
  ]);
});

it("joins a line that arrives across several chunks", () => {
  const decoder = new LineDecoder(1024);
  expect(decoder.push(Buffer.from('{"type":'))).toEqual([]);
  expect(decoder.push(Buffer.from('"health"}\n'))).toEqual([
    { kind: "line", text: '{"type":"health"}' },
  ]);
});

it("skips blank lines", () => {
  const decoder = new LineDecoder(1024);
  expect(decoder.push(Buffer.from("\n  \n\r\n"))).toEqual([]);
});

it("reports an oversized line once and resumes after the next newline", () => {
  const decoder = new LineDecoder(8);
  expect(decoder.push(Buffer.from("0123456789"))).toEqual([{ kind: "too_large" }]);
  expect(decoder.push(Buffer.from("more bytes"))).toEqual([]);
  expect(decoder.push(Buffer.from("\nok\n"))).toEqual([{ kind: "line", text: "ok" }]);
});

it("accepts a line exactly at the limit", () => {
  const decoder = new LineDecoder(4);
  expect(decoder.push(Buffer.from("abcd\n"))).toEqual([{ kind: "line", text: "abcd" }]);
});
