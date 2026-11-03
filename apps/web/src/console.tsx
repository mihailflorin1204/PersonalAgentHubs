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

type OrganizationLoad = { ok: true; name: string | null } | { ok: false };

export function Console() {
  const [mode, setMode] = useState<AccountMode>("sign-in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [organizationsFailed, setOrganizationsFailed] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  function applyOrganizations(result: OrganizationLoad) {
    setOrganizationsFailed(!result.ok);
    setOrganizationName(result.ok ? result.name : null);
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const result = await authClient().getSession();
        if (result.error) {
          setError("Could not check the session. Sign in to continue.");
          return;
        }
        const active = Boolean(result.data?.user);
        setSignedIn(active);
        if (active) {
          applyOrganizations(await loadOrganizations());
        }
      } catch {
        setError("Could not check the session. Sign in to continue.");
      } finally {
        setReady(true);
      }
    }
    void checkSession();
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
      setSignOutError(null);
      applyOrganizations(await loadOrganizations());
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleRetryOrganizations() {
    setPending(true);
    try {
      applyOrganizations(await loadOrganizations());
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
    } catch {
      setError("Could not create the organization.");
    } finally {
      setPending(false);
    }
  }

  async function handleSignOut() {
    setPending(true);
    setSignOutError(null);
    try {
      const result = await authClient().signOut();
      if (result.error) {
        setSignOutError("Could not sign out. Try again.");
        return;
      }
      setSignedIn(false);
      setOrganizationName(null);
      setOrganizationsFailed(false);
      setError(null);
    } catch {
      setSignOutError("Could not sign out. Try again.");
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
      {organizationsFailed ? (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <p role="alert" className="text-sm text-red-700">
            Could not load organizations. Try again.
          </p>
          <button
            type="button"
            disabled={pending}
            className="w-fit rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            onClick={() => {
              void handleRetryOrganizations();
            }}
          >
            {pending ? "Please wait" : "Retry"}
          </button>
        </div>
      ) : organizationName ? (
        <OrganizationHeading name={organizationName} />
      ) : (
        <OrganizationForm
          pending={pending}
          error={error}
          onSubmit={(name) => {
            void handleOrganization(name);
          }}
        />
      )}
      {signOutError ? (
        <p role="alert" className="text-sm text-red-700">
          {signOutError}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        className="w-fit text-sm text-neutral-700 underline disabled:opacity-60"
        onClick={() => {
          void handleSignOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

async function loadOrganizations(): Promise<OrganizationLoad> {
  try {
    const response = await fetch("/organizations", { headers: { accept: "application/json" } });
    if (!response.ok) {
      return { ok: false };
    }
    const organizations = readOrganizationList(await response.json());
    if (!organizations) {
      return { ok: false };
    }
    return { ok: true, name: latestOrganization(organizations)?.name ?? null };
  } catch {
    return { ok: false };
  }
}
