import { expect, it } from "vitest";
import * as auth from "./index.js";

it("does not issue sessions or credentials", () => {
  expect(auth.sessionBoundary).toEqual({
    library: "better-auth",
    sessionsImplemented: false,
    credentialsImplemented: false,
  });
  const functions = Object.values(auth).filter((value) => typeof value === "function");
  expect(functions).toEqual([]);
});
