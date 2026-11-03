import type { FormEvent } from "react";

export function OrganizationForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(String(data.get("name") ?? ""));
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create an organization</h1>
        <p className="mt-1 text-sm text-neutral-600">This becomes the tenant for agents and policies.</p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Organization name
        <input
          name="name"
          required
          maxLength={200}
          autoComplete="organization"
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
        {pending ? "Please wait" : "Create organization"}
      </button>
    </form>
  );
}
