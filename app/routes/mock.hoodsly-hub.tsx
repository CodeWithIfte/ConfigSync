import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const successCount = url.searchParams.get("success_count") || "0";
  const failCount = url.searchParams.get("fail_count") || "0";

  return new Response(
    JSON.stringify({
      status: "running",
      endpoint: "/mock/hoodslyhub",
      success_count: parseInt(successCount, 10),
      fail_count: parseInt(failCount, 10),
      note: "Append ?fail=true to simulate a 500 error",
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const shouldFail = url.searchParams.get("fail") === "true";

  const payload = await request.json();
  const orderId = (payload as Record<string, unknown>).id ?? "unknown";

  console.log(`[mock/hoodslyhub] Received order ${orderId}`);

  if (shouldFail) {
    console.log(`[mock/hoodslyhub] Simulating failure for order ${orderId}`);
    return new Response(
      JSON.stringify({
        error: "Simulated server error",
        order_id: orderId,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  console.log(`[mock/hoodslyhub] Successfully processed order ${orderId}`);
  return new Response(
    JSON.stringify({
      status: "ok",
      order_id: orderId,
      message: "Order received by HoodslyHub",
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
};