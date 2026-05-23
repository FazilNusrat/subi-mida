import { useLoaderData, useSubmit, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  Badge,
  BlockStack,
  Text,
  EmptyState,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const plans = await prisma.subscriptionPlan.findMany({
    where: { shop: session.shop },
    orderBy: { position: "asc" },
  });

  return { plans };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "toggle") {
    const id = formData.get("id");
    const current = await prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    await prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive: !current.isActive },
    });
  }

  return { ok: true };
};

const LABELS = { WEEK: "Weekly", MONTH: "Monthly", YEAR: "Yearly" };

export default function SubscriptionsPage() {
  const { plans } = useLoaderData();
  const submit = useSubmit();
  const navigate = useNavigate();

  const toggle = (id) =>
    submit({ intent: "toggle", id }, { method: "post" });

  const rows = plans.map((plan) => [
    plan.name,
    `Every ${plan.intervalCount} ${LABELS[plan.intervalType] || plan.intervalType}`,
    plan.discountType === "NONE"
      ? "No discount"
      : plan.discountType === "PERCENTAGE"
      ? `${plan.discountValue}% off`
      : `$${plan.discountValue} off`,
    <Badge tone={plan.isActive ? "success" : "enabled"}>
      {plan.isActive ? "Active" : "Inactive"}
    </Badge>,
    <InlineStack gap="200">
      <Button onClick={() => navigate(`/app/subscriptions/${plan.id}`)} variant="plain">
        Edit
      </Button>
      <Button
        onClick={() => toggle(plan.id)}
        variant="plain"
        tone={plan.isActive ? "critical" : undefined}
      >
        {plan.isActive ? "Disable" : "Enable"}
      </Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title="Subscription Plans"
      primaryAction={{
        content: "Add Plan",
        onAction: () => navigate("/app/subscriptions/new"),
      }}
    >
      <Layout>
        <Layout.Section>
          {plans.length === 0 ? (
            <Card>
              <EmptyState
                heading="No subscription plans yet"
                action={{
                  content: "Create your first plan",
                  onAction: () => navigate("/app/subscriptions/new"),
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text>
                  Add weekly, monthly, and yearly plans with discounts.
                  They will appear under the Add to Cart button.
                </Text>
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <BlockStack gap="300">
                <Text tone="subdued">
                  Plans are shown in this order on the product page.
                  Use the position field when editing to reorder them.
                </Text>
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Name", "Frequency", "Discount", "Status", "Actions"]}
                  rows={rows}
                />
              </BlockStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
