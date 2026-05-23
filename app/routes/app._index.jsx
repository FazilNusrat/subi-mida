import { useLoaderData, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Box,
  Icon,
} from "@shopify/polaris";
import { CheckCircleIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const apiKey = process.env.SHOPIFY_API_KEY;

  const customizerUrl =
    `https://${shop}/admin/themes/current/editor` +
    `?template=product` +
    `&addAppBlockId=${apiKey}/subscription_widget` +
    `&target=newAppsSection`;

  return { shop, customizerUrl };
};

export default function HomePage() {
  const { customizerUrl } = useLoaderData();
  const navigate = useNavigate();

  return (
    <Page>
      <Layout>
        {/* Hero */}
        <Layout.Section>
          <Card>
            <Box padding="800">
              <BlockStack gap="400" align="center">
                <Text variant="headingXl" as="h1" alignment="center">
                  Subscription Pro
                </Text>
                <Text variant="bodyLg" tone="subdued" alignment="center">
                  Let your customers subscribe to any product — weekly,
                  monthly, yearly — with automatic discounts.
                </Text>
                <InlineStack gap="300" align="center">
                  <Button
                    variant="primary"
                    size="large"
                    url={customizerUrl}
                    target="_blank"
                  >
                    Enable in Theme Customizer
                  </Button>
                  <Button
                    onClick={() => navigate("/app/subscriptions")}
                    size="large"
                  >
                    Manage Plans
                  </Button>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Steps */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Quick Setup
              </Text>
              {[
                {
                  step: "1",
                  title: "Enable in Theme Customizer",
                  detail:
                    "Click the button above. Your theme editor opens with the widget already added to the product page. Just click Save.",
                },
                {
                  step: "2",
                  title: "Create subscription plans",
                  detail:
                    "Go to Subscriptions in the sidebar. Add weekly, monthly, or yearly plans with discounts.",
                },
                {
                  step: "3",
                  title: "Customize the widget",
                  detail:
                    "Go to Settings in the sidebar. Control colors, style, badge text, and more — all from the app.",
                },
              ].map(({ step, title, detail }) => (
                <InlineStack key={step} gap="400" blockAlign="start">
                  <Box
                    background="bg-fill-brand"
                    borderRadius="full"
                    padding="200"
                    minWidth="32px"
                  >
                    <Text
                      variant="headingSm"
                      tone="text-inverse"
                      alignment="center"
                    >
                      {step}
                    </Text>
                  </Box>
                  <BlockStack gap="100">
                    <Text variant="headingSm" fontWeight="bold">
                      {title}
                    </Text>
                    <Text tone="subdued">{detail}</Text>
                  </BlockStack>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Features */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingSm" fontWeight="bold">
                What merchants can do
              </Text>
              {[
                "Create weekly, monthly, yearly plans",
                "Set % or fixed amount discounts",
                "Control widget style from the app",
                "Enable or disable plans instantly",
              ].map((f) => (
                <InlineStack key={f} gap="200" blockAlign="center">
                  <Icon source={CheckCircleIcon} tone="success" />
                  <Text>{f}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingSm" fontWeight="bold">
                What customers see
              </Text>
              {[
                "Subscription options below Add to Cart",
                "Clear savings displayed per plan",
                "Choose frequency before purchasing",
                "One-time purchase option alongside",
              ].map((f) => (
                <InlineStack key={f} gap="200" blockAlign="center">
                  <Icon source={CheckCircleIcon} tone="success" />
                  <Text>{f}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}