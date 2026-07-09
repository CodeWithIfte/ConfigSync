import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncOrder } from "../services/hoodsly-sync.server";

interface OrderPayload {
  id: number;
  order_number: number;
  email?: string;
  customer?: Record<string, unknown>;
  shipping_address?: Record<string, unknown>;
  total_price?: string;
  line_items?: Array<Record<string, unknown>>;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const orderPayload = payload as OrderPayload;

  await syncOrder({
    id: String(orderPayload.id),
    order_number: orderPayload.order_number ?? 0,
    email: orderPayload.email,
    customer: orderPayload.customer,
    shipping_address: orderPayload.shipping_address,
    total_price: orderPayload.total_price,
    line_items: orderPayload.line_items,
  });

  return new Response();
};