import { organizationProxyPath, forwardToManagement } from "../../management-api";

function handle(request: Request) {
  const target = organizationProxyPath();
  if (!target) {
    return Response.json({ status: "not_found" }, { status: 404 });
  }
  return forwardToManagement(request, target);
}

export const GET = handle;
export const POST = handle;
