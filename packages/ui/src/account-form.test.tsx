import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountForm } from "./account-form.js";
import { OrganizationForm } from "./organization-form.js";
import { OrganizationHeading } from "./organization-heading.js";

it("shows the organization name and no credential fields", () => {
  const html = renderToStaticMarkup(createElement(OrganizationHeading, { name: "Northwind" }));
  expect(html).toContain("Northwind");
  expect(html).not.toContain("password");
  expect(html).not.toContain("type=\"password\"");
});

it("asks for email and a password, and keeps the password field masked", () => {
  const html = renderToStaticMarkup(
    createElement(AccountForm, {
      mode: "sign-in",
      pending: false,
      error: null,
      onSubmit: () => undefined,
      onModeChange: () => undefined,
    }),
  );
  expect(html).toContain("Sign in");
  expect(html).toContain("type=\"email\"");
  expect(html).toContain("type=\"password\"");
  expect(html).not.toContain("value=");
});

it("collects an organization name without storing it in the markup", () => {
  const html = renderToStaticMarkup(
    createElement(OrganizationForm, {
      pending: false,
      error: null,
      onSubmit: () => undefined,
    }),
  );
  expect(html).toContain("Create an organization");
  expect(html).toContain("Organization name");
  expect(html).not.toContain("localStorage");
});
