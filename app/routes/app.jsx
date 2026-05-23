import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    host: url.searchParams.get("host") ?? "",
  };
};

export default function App() {
  const { apiKey, host } = useLoaderData();
  return (
    <AppProvider embedded apiKey={apiKey} host={host}>
      <PolarisAppProvider i18n={{}}>
        <ui-nav-menu>
          <s-link href="/app" rel="home">Home</s-link>
          <s-link href="/app/subscriptions">Subscriptions</s-link>
          <s-link href="/app/settings/widget">Settings</s-link>
        </ui-nav-menu>
        <Outlet />
      </PolarisAppProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};