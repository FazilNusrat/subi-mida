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

// Builds the Shopify selling plan definition shared by create + update.
function buildSellingPlan(data) {
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

  return {
    name: data.name,
    category: "SUBSCRIPTION",
    options: [`${data.intervalCount} ${data.intervalType}`],
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
  };
}

// Fetches every product id (paginated) so the selling plan covers the whole catalog,
// not just the first 250 products.
async function getAllProductIds(admin) {
  const ids = [];
  let cursor = null;

  while (true) {
    const resp = await admin.graphql(
      `query getProducts($cursor: String) {
        products(first: 250, after: $cursor) {
          edges { node { id } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { variables: { cursor } }
    );
    const json = await resp.json();
    const conn = json?.data?.products;
    if (!conn) break;

    for (const edge of conn.edges) ids.push(edge.node.id);

    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return ids;
}

// Creates a brand new selling plan group (and attaches all products), OR updates the
// existing group in place when the record already points at a real SellingPlanGroup.
// Returns { groupId, sellingPlanId } on success or { error } so the caller can surface it.
async function syncSellingPlanGroup(admin, record, data) {
  const sellingPlan = buildSellingPlan(data);

  const hasValidGroup =
    record.shopifyPlanGroupId?.includes("SellingPlanGroup") &&
    record.shopifySellingPlanId?.includes("SellingPlan");

  if (hasValidGroup) {
    const resp = await admin.graphql(
      `mutation updatePlan($id: ID!, $input: SellingPlanGroupInput!) {
        sellingPlanGroupUpdate(id: $id, input: $input) {
          sellingPlanGroup {
            id
            sellingPlans(first: 1) { edges { node { id } } }
          }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id: record.shopifyPlanGroupId,
          input: {
            name: data.name,
            merchantCode: record.id,
            options: ["Delivery every"],
            sellingPlansToUpdate: [{ id: record.shopifySellingPlanId, ...sellingPlan }],
          },
        },
      }
    );
    const payload = (await resp.json())?.data?.sellingPlanGroupUpdate;
    const userErrors = payload?.userErrors || [];
    if (userErrors.length) {
      return { error: userErrors.map((e) => e.message).join("; ") };
    }
    return {
      groupId: payload?.sellingPlanGroup?.id || record.shopifyPlanGroupId,
      sellingPlanId:
        payload?.sellingPlanGroup?.sellingPlans?.edges?.[0]?.node?.id ||
        record.shopifySellingPlanId,
    };
  }

  // Create path — attach the whole catalog up front via the resources argument.
  const productIds = await getAllProductIds(admin);
  const resp = await admin.graphql(
    `mutation createPlan($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput) {
      sellingPlanGroupCreate(input: $input, resources: $resources) {
        sellingPlanGroup {
          id
          sellingPlans(first: 1) { edges { node { id } } }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          name: data.name,
          merchantCode: record.id,
          options: ["Delivery every"],
          sellingPlansToCreate: [sellingPlan],
        },
        resources: productIds.length ? { productIds } : null,
      },
    }
  );
  const payload = (await resp.json())?.data?.sellingPlanGroupCreate;
  const userErrors = payload?.userErrors || [];
  if (userErrors.length) {
    return { error: userErrors.map((e) => e.message).join("; ") };
  }

  const groupId = payload?.sellingPlanGroup?.id;
  const sellingPlanId = payload?.sellingPlanGroup?.sellingPlans?.edges?.[0]?.node?.id;
  if (!groupId || !sellingPlanId) {
    return { error: "Shopify did not return a selling plan id for the new group." };
  }

  return { groupId, sellingPlanId };
}

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "delete") {
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: params.id, shop: session.shop },
    });

    // Only delete a genuine SellingPlanGroup — older records may hold a SellingPlan id by mistake.
    if (plan?.shopifyPlanGroupId?.includes("SellingPlanGroup")) {
      const resp = await admin.graphql(
        `mutation deleteGroup($id: ID!) {
          sellingPlanGroupDelete(id: $id) {
            deletedSellingPlanGroupId
            userErrors { field message }
          }
        }`,
        { variables: { id: plan.shopifyPlanGroupId } }
      );
      const errors = (await resp.json())?.data?.sellingPlanGroupDelete?.userErrors || [];
      if (errors.length) console.error("sellingPlanGroupDelete errors:", errors);
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

  // Persist locally first so the Shopify merchantCode (record.id) is stable across edits.
  const isNew = params.id === "new";
  let record;

  try {
    if (isNew) {
      record = await prisma.subscriptionPlan.create({ data });
    } else {
      record = await prisma.subscriptionPlan.update({
        where: { id: params.id },
        data,
      });
    }

    // Sync to Shopify. If it fails, surface the error instead of silently leaving a
    // broken plan that would be added to the cart as a one-time purchase.
    const sync = await syncSellingPlanGroup(admin, record, data);

    if (sync.error) {
      // Roll back a freshly created record so we never persist a half-created plan.
      if (isNew) {
        await prisma.subscriptionPlan.delete({ where: { id: record.id } });
      }
      return { errors: { general: `Could not save the plan to Shopify: ${sync.error}` } };
    }

    await prisma.subscriptionPlan.update({
      where: { id: record.id },
      data: {
        shopifyPlanGroupId: sync.groupId,
        shopifySellingPlanId: sync.sellingPlanId,
      },
    });
  } catch (error) {
    // Never let a thrown error reach the UI as a raw object ("[object Object]").
    if (isNew && record) {
      try {
        await prisma.subscriptionPlan.delete({ where: { id: record.id } });
      } catch {
        // ignore cleanup failure
      }
    }
    const message = error?.message
      ? String(error.message)
      : "Unexpected error while saving the plan. Please try again.";
    return { errors: { general: message } };
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
