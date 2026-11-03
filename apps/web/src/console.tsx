"use client";

import { AccountForm, OrganizationForm, OrganizationHeading, type AccountMode, type AccountSubmission } from "@agenthub/ui";
import { createAuthClient } from "better-auth/react";
import { useEffect, useState } from "react";
import { latestOrganization, organizationCreateBody, readOrganization, readOrganizationList } from "./management";

function authClient() {
  return createAuthClient({
    baseURL: window.location.origin,
  });
}

export function Console() {
  const [mode, setMode] = useState<AccountMode>("sign-in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [organizationName, setOrganizationName] = useState<string | null>(null);

  useEffect(() => {
    const auth = authClient();
    void auth.getSession().then(async (result) => {
      const active = Boolean(result.data?.user);
      setSignedIn(active);
      if (active) {
        await loadOrganizations(setOrganizationName);
      }
      setReady(true);
    });
  }, []);

  async function handleAccount(input: AccountSubmission) {
    setPending(true);
    setError(null);
    const auth = authClient();
    try {
      if (mode === "create-account") {
        const created = await auth.signUp.email({
          name: input.name.trim(),
          email: input.email.trim(),
          password: input.password,
        });
        if (created.error) {
          setError("Could not create the account.");
          return;
        }
      }
      const signedInResult = await auth.signIn.email({
        email: input.email.trim(),
        password: input.password,
      });
      if (signedInResult.error) {
        setError("Sign-in failed. Check the email and password.");
        return;
      }
      setSignedIn(true);
      await loadOrganizations(setOrganizationName);
    } finally {
      setPending(false);
    }
  }

  async function handleOrganization(name: string) {
    const body = organizationCreateBody(name);
    if (!body) {
      setError("Enter an organization name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/organizations", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError("Could not create the organization.");
        return;
      }
      const organization = readOrganization(await response.json());
      if (!organization) {
        setError("Could not create the organization.");
        return;
      }
      setOrganizationName(organization.name);
    } finally {
      setPending(false);
    }
  }

  async function handleSignOut() {
    setPending(true);
    setError(null);
    try {
      await authClient().signOut();
      setSignedIn(false);
      setOrganizationName(null);
    } finally {
      setPending(false);
    }
  }

  if (!ready) {
    return <p className="text-sm text-neutral-600">Checking session</p>;
  }

  if (!signedIn) {
    return (
      <AccountForm
        mode={mode}
        pending={pending}
        error={error}
        onSubmit={(input) => {
          void handleAccount(input);
        }}
        onModeChange={(next) => {
          setError(null);
          setMode(next);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {organizationName ? <OrganizationHeading name={organizationName} /> : null}
      {organizationName ? null : (
        <OrganizationForm
          pending={pending}
          error={error}
          onSubmit={(name) => {
            void handleOrganization(name);
          }}
        />
      )}
      <button
        type="button"
        className="w-fit text-sm text-neutral-700 underline"
        onClick={() => {
          void handleSignOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

async function loadOrganizations(setName: (name: string | null) => void) {
  const response = await fetch("/organizations", { headers: { accept: "application/json" } });
  if (!response.ok) {
    return;
  }
  const organizations = readOrganizationList(await response.json());
  setName(organizations ? latestOrganization(organizations)?.name ?? null : null);
}
