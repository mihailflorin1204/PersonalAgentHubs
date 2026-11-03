import type { FormEvent } from "react";

export type AccountMode = "sign-in" | "create-account";

export type AccountSubmission = {
  name: string;
  email: string;
  password: string;
};

export function AccountForm({
  mode,
  pending,
  error,
  onSubmit,
  onModeChange,
}: {
  mode: AccountMode;
  pending: boolean;
  error: string | null;
  onSubmit: (input: AccountSubmission) => void;
  onModeChange: (mode: AccountMode) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {mode === "sign-in"
            ? "Use the account for this control plane."
            : "Create an account, then sign in to open an organization."}
        </p>
      </div>
      {mode === "create-account" ? (
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            name="name"
            autoComplete="name"
            required
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          required
          minLength={8}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Please wait" : mode === "sign-in" ? "Sign in" : "Create account"}
      </button>
      <button
        type="button"
        className="text-left text-sm text-neutral-700 underline"
        onClick={() => onModeChange(mode === "sign-in" ? "create-account" : "sign-in")}
      >
        {mode === "sign-in" ? "Create an account" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
