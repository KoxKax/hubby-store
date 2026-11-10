// Reserved integration URL, deliberately not a live receiver. Acknowledge nothing
// until durable settlement, account binding, UAT and explicit activation are ready.
export function loader() {
  return Response.json(
    { success: false },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}
export function action() {
  return Response.json(
    { success: false },
    {
      status: 503,
      headers: { "Retry-After": "300", "Cache-Control": "no-store" },
    },
  );
}
