import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// When a new product is created, attach it to every active selling plan group for the
// shop. Without this, products added after a plan was created would never offer a
// subscription at checkout (the same failure mode as an unsynced plan).
export const action = async ({ request }) => {
  const { shop, admin, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // No admin context means the app session is gone (e.g. uninstalled) — nothing to do.
  if (!admin) {
    return new Response();
  }

  const productGid =
    payload?.admin_graphql_api_id ||
    (payload?.id ? `gid://shopify/Product/${payload.id}` : null);

  if (!productGid) {
    return new Response();
  }

  const plans = await prisma.subscriptionPlan.findMany({
    where: { shop, isActive: true, shopifyPlanGroupId: { not: null } },
    select: { shopifyPlanGroupId: true },
  });

  for (const plan of plans) {
    // Guard against legacy rows that stored a SellingPlan id in this column.
    if (!plan.shopifyPlanGroupId?.includes("SellingPlanGroup")) continue;

    const resp = await admin.graphql(
      `mutation addProduct($id: ID!, $productIds: [ID!]!) {
        sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
          sellingPlanGroup { id }
          userErrors { field message }
        }
      }`,
      { variables: { id: plan.shopifyPlanGroupId, productIds: [productGid] } }
    );

    const errors = (await resp.json())?.data?.sellingPlanGroupAddProducts?.userErrors || [];
    if (errors.length) {
      console.error(`sellingPlanGroupAddProducts errors for ${plan.shopifyPlanGroupId}:`, errors);
    }
  }

  return new Response();
};
