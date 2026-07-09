import {
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getSyncLogs, retrySyncOrder } from "../services/hoodsly-sync.server";
import type { SyncLog } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const orderId = url.searchParams.get("orderId") ?? undefined;

  return getSyncLogs({ status, orderId });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "retry") {
    const orderId = formData.get("orderId") as string;
    await retrySyncOrder(orderId);
  }

  return null;
};

const toneForStatus = (status: string) => {
  const tones: Record<string, string> = {
    synced: "success",
    pending: "attention",
    failed: "critical",
    permanently_failed: "critical",
  };
  return tones[status] || "neutral";
};

export default function SyncLogPage() {
  const logs = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <s-page heading="Sync Log">
      <s-section heading="Sync Status">
        <s-table>
          <s-table-header-row>
            <s-table-header>Order ID</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header format="numeric">Retries</s-table-header>
            <s-table-header>Last Attempt</s-table-header>
            <s-table-header>Error</s-table-header>
            <s-table-header>Actions</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {logs.length === 0 ? (
              <s-table-row>
                <s-table-cell colSpan="6">
                  <s-paragraph>No sync records found.</s-paragraph>
                </s-table-cell>
              </s-table-row>
            ) : (
              logs.map((log: SyncLog) => (
                <s-table-row key={log.id}>
                  <s-table-cell>{log.orderId}</s-table-cell>
                  <s-table-cell>
                    <s-badge color="base" tone={toneForStatus(log.status)}>
                      {log.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell format="numeric">{log.retryCount}</s-table-cell>
                  <s-table-cell>
                    {log.lastAttemptAt
                      ? new Date(log.lastAttemptAt).toLocaleString()
                      : "—"}
                  </s-table-cell>
                  <s-table-cell>{log.errorMessage || "—"}</s-table-cell>
                  <s-table-cell>
                    {(log.status === "failed" ||
                      log.status === "permanently_failed") && (
                      <fetcher.Form method="post">
                        <input
                          type="hidden"
                          name="orderId"
                          value={log.orderId}
                        />
                        <button
                          type="submit"
                          name="intent"
                          value="retry"
                          variant="primary"
                        >
                          Retry
                        </button>
                      </fetcher.Form>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))
            )}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};