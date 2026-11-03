export function OrganizationHeading({ name }: { name: string }) {
  return (
    <section className="flex w-full max-w-sm flex-col gap-1">
      <p className="text-sm text-neutral-600">Organization</p>
      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
    </section>
  );
}
