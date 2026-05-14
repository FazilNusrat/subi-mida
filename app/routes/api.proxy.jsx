import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const shop = session.shop;

  const [rawSettings, plans] = await Promise.all([
    prisma.widgetSettings.findUnique({ where: { shop } }),
    prisma.subscriptionPlan.findMany({
      where: { shop, isActive: true },
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        intervalType: true,
        intervalCount: true,
        discountType: true,
        discountValue: true,
        shopifyPlanGroupId: true,
      },
    }),
  ]);

  const settings = rawSettings ?? {
    widgetEnabled:   true,
    title:           "Subscribe & Save",
    subtitle:        "",
    showOneTime:     true,
    oneTimeLabel:    "One-time purchase",
    displayStyle:    "cards",
    accentColor:     "#008060",
    borderRadius:    8,
    showBadge:       true,
    badgeText:       "Save {discount}",
    showAboveButton: false,
  };

  return new Response(JSON.stringify({ settings, plans }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache",
    },
  });
};