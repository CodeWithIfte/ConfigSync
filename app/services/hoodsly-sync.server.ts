import prisma from "app/db.server";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

function getHookUrl() {
  return process.env.HOODSLY_HUB_URL || "http://localhost:3000/mock/hoodslyhub";
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postOrder(payload: Record<string, unknown>): Promise<boolean> {
  const hookUrl = getHookUrl();
  const fail = payload._test_fail === true;

  const url = fail ? `${hookUrl}?fail=true` : hookUrl;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return response.ok;
}

export async function syncOrder(orderPayload: {
  id: string;
  order_number: number;
  email?: string;
  customer?: { email?: string; first_name?: string; last_name?: string };
  shipping_address?: Record<string, unknown>;
  total_price?: string;
  line_items?: Array<Record<string, unknown>>;
  _test_fail?: boolean;
}) {
  const orderId = String(orderPayload.id);

  const syncLog = await prisma.syncLog.upsert({
    where: { orderId },
    create: {
      shop: orderPayload.email ?? "unknown",
      orderId,
      status: "pending",
      payload: JSON.stringify(orderPayload),
    },
    update: {},
  });

  let success = false;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      success = await postOrder(orderPayload as Record<string, unknown>);
      if (success) break;

      lastError = `HTTP error on attempt ${attempt + 1}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < MAX_RETRIES - 1) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          retryCount: attempt + 1,
          lastAttemptAt: new Date(),
          nextRetryAt: new Date(Date.now() + BASE_DELAY_MS * Math.pow(2, attempt + 1)),
          errorMessage: lastError,
          status: "pending",
        },
      });
    }
  }

  const finalStatus = success ? "synced" : "permanently_failed";

  await prisma.syncLog.update({
    where: { id: syncLog.id },
    data: {
      status: finalStatus,
      retryCount: success ? syncLog.retryCount : MAX_RETRIES,
      lastAttemptAt: new Date(),
      nextRetryAt: null,
      errorMessage: success ? null : lastError,
    },
  });

  return { success, status: finalStatus };
}

export async function retrySyncOrder(orderId: string) {
  const syncLog = await prisma.syncLog.findUnique({ where: { orderId } });
  if (!syncLog) throw new Error(`SyncLog not found for order ${orderId}`);

  const payload = JSON.parse(syncLog.payload);
  return syncOrder(payload);
}

export async function getSyncLogs(params?: {
  status?: string;
  orderId?: string;
}) {
  const where: Record<string, unknown> = {};
  if (params?.status) where.status = params.status;
  if (params?.orderId) where.orderId = { contains: params.orderId };

  return prisma.syncLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}