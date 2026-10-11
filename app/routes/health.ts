export function loader() {
  return Response.json(
    {
      status: "ok",
      phase: 2,
      scope: "runtime-only",
      database: "not-configured",
      payments: "not-connected",
      suppliers: "not-connected",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
