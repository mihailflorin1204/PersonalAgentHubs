import { authProxyPath, forwardToManagement } from "../../../../management-api";

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = authProxyPath(path);
  if (!target) {
    return Response.json({ status: "not_found" }, { status: 404 });
  }
  return forwardToManagement(request, target);
}

export const GET = handle;
export const POST = handle;
