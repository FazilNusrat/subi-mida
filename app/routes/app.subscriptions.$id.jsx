import { useLoaderData, useActionData, useNavigate, useSubmit, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Select,
  Button,
  InlineStack,
  Text,
  Banner,
  Divider,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { redirect } from "react-router";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);

  if (params.id === "new") {
    return { plan: null };
  }

  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: params.id, shop: session.shop },
  });

  if (!plan) throw new Response("Not Found", { status: 404 });

  return { plan };
};

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "delete") {
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: params.id, shop: session.shop },
    });

    if (plan?.shopifyPlanGroupId) {
      await admin.graphql(`
        mutation {
          sellingPlanGroupDelete(id: "${plan.shopifyPlanGroupId}") {
            deletedSellingPlanGroupId
          }
        }
      `);
    }

    await prisma.subscriptionPlan.delete({ where: { id: params.id } });
    return redirect("/app/subscriptions");
  }

  const data = {
    name: form.get("name"),
    intervalType: form.get("intervalType"),
    intervalCount: parseInt(form.get("intervalCount"), 10),
    discountType: form.get("discountType"),
    discountValue: parseFloat(form.get("discountValue") || "0"),
    position: parseInt(form.get("position") || "0", 10),
    isActive: true,
    shop: session.shop,
  };

  if (!data.name || !data.intervalType || !data.intervalCount) {
    return { errors: { general: "Please fill in all required fields." } };
  }

  let record;

  if (params.id === "new") {
    record = await prisma.subscriptionPlan.create({ data });
  } else {
    record = await prisma.subscriptionPlan.update({
      where: { id: params.id },
      data,
    });
  }

  // Build pricing policy for Shopify
  const pricingPolicies =
    data.discountType === "NONE"
      ? []
      : [
          {
            fixed: {
              adjustmentType:
                data.discountType === "PERCENTAGE"
                  ? "PERCENTAGE"
                  : "FIXED_AMOUNT",
              adjustmentValue:
                data.discountType === "PERCENTAGE"
                  ? { percentage: data.discountValue }
                  : { fixedValue: data.discountValue },
            },
          },
        ];

  // Sync to Shopify SellingPlanGroup
  const resp = await admin.graphql(
    `mutation createPlan($input: SellingPlanGroupInput!) {
      sellingPlanGroupCreate(input: $input) {
        sellingPlanGroup { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          name: data.name,
          merchantCode: record.id,
          options: ["Delivery every"],
          sellingPlansToCreate: [
            {
              name: data.name,
              category: "SUBSCRIPTION",
              options: `${data.intervalCount} ${data.intervalType}`,
              billingPolicy: {
                recurring: {
                  interval: data.intervalType,
                  intervalCount: data.intervalCount,
                },
              },
              deliveryPolicy: {
                recurring: {
                  interval: data.intervalType,
                  intervalCount: data.intervalCount,
                },
              },
              pricingPolicies,
            },
          ],
        },
      },
    }
  );

  const result = await resp.json();
  console.log("GraphQL result:", JSON.stringify(result?.data?.sellingPlanGroupCreate, null, 2));
  const groupId =
  result?.data?.sellingPlanGroupCreate?.sellingPlanGroup?.id;
  const sellingPlanId =
  result?.data?.sellingPlanGroupCreate?.sellingPlanGroup?.sellingPlans?.edges?.[0]?.node?.id;

  if (groupId) {
  // Query the selling plan ID from the group
  const planResp = await admin.graphql(
    `query getSellingPlan($id: ID!) {
      sellingPlanGroup(id: $id) {
        sellingPlans(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    }`,
    { variables: { id: groupId } }
  );
  const planResult = await planResp.json();
  const sellingPlanId = planResult?.data?.sellingPlanGroup?.sellingPlans?.edges?.[0]?.node?.id;

  console.log("Selling Plan ID:", sellingPlanId);

  await prisma.subscriptionPlan.update({
    where: { id: record.id },
    data: { 
      shopifyPlanGroupId: groupId,
      shopifySellingPlanId: sellingPlanId || null,
    },
  });

  // Assign to all products
  const productsResp = await admin.graphql(`
    query {
      products(first: 250) {
        edges { node { id } }
      }
    }
  `);
  const productsResult = await productsResp.json();
  const productIds = productsResult?.data?.products?.edges?.map(e => e.node.id) || [];

  if (productIds.length > 0) {
    await admin.graphql(
      `mutation assignPlans($id: ID!, $productIds: [ID!]!) {
        sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
          sellingPlanGroup { id }
          userErrors { field message }
        }
      }`,
      { variables: { id: groupId, productIds } }
    );
  }
}

  return redirect("/app/subscriptions");
};

export default function SubscriptionFormPage() {
  const { plan } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";
  const isNew = !plan;

  const [name, setName] = useState(plan?.name || "");
  const [intervalType, setIntervalType] = useState(plan?.intervalType || "MONTH");
  const [intervalCount, setIntervalCount] = useState(String(plan?.intervalCount || 1));
  const [discountType, setDiscountType] = useState(plan?.discountType || "PERCENTAGE");
  const [discountValue, setDiscountValue] = useState(String(plan?.discountValue || 0));
  const [position, setPosition] = useState(String(plan?.position || 0));

  const handleSave = () => {
    submit(
      {
        intent: "save",
        name,
        intervalType,
        intervalCount,
        discountType,
        discountValue,
        position,
      },
      { method: "post" }
    );
  };

  const handleDelete = () => {
    if (confirm("Delete this plan? This cannot be undone.")) {
      submit({ intent: "delete" }, { method: "post" });
    }
  };

  return (
    <Page
      title={isNew ? "New Subscription Plan" : `Edit — ${plan.name}`}
      backAction={{
        content: "Subscriptions",
        onAction: () => navigate("/app/subscriptions"),
      }}
      primaryAction={{
        content: isSaving ? "Saving..." : "Save Plan",
        onAction: handleSave,
        loading: isSaving,
      }}
      secondaryActions={
        !isNew
          ? [
              {
                content: "Delete Plan",
                destructive: true,
                onAction: handleDelete,
              },
            ]
          : []
      }
    >
      <Layout>
        {actionData?.errors?.general && (
          <Layout.Section>
            <Banner tone="critical">{actionData.errors.general}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Plan Details</Text>
              <TextField
                label="Plan name"
                value={name}
                onChange={setName}
                placeholder="e.g. Monthly — 15% Off"
                helpText="Shown to customers on the product page"
                autoComplete="off"
              />
              <InlineStack gap="400">
                <Select
                  label="Interval"
                  options={[
                    { label: "Week(s)", value: "WEEK" },
                    { label: "Month(s)", value: "MONTH" },
                    { label: "Year(s)", value: "YEAR" },
                  ]}
                  value={intervalType}
                  onChange={setIntervalType}
                />
                <TextField
                  label="Every"
                  type="number"
                  value={intervalCount}
                  onChange={setIntervalCount}
                  min={1}
                  helpText="e.g. 2 = every 2 months"
                  autoComplete="off"
                />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Discount</Text>
              <Select
                label="Discount type"
                options={[
                  { label: "No discount", value: "NONE" },
                  { label: "Percentage off", value: "PERCENTAGE" },
                  { label: "Fixed amount off", value: "FIXED_AMOUNT" },
                ]}
                value={discountType}
                onChange={setDiscountType}
              />
              {discountType !== "NONE" && (
                <TextField
                  label={
                    discountType === "PERCENTAGE"
                      ? "Discount %"
                      : "Amount off ($)"
                  }
                  type="number"
                  value={discountValue}
                  onChange={setDiscountValue}
                  min={0}
                  prefix={discountType === "FIXED_AMOUNT" ? "$" : undefined}
                  suffix={discountType === "PERCENTAGE" ? "%" : undefined}
                  autoComplete="off"
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Display Order</Text>
              <TextField
                label="Position"
                type="number"
                value={position}
                onChange={setPosition}
                helpText="Lower number = shown first on product page. 0 = first."
                autoComplete="off"
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}