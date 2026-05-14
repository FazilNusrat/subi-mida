import { useLoaderData, useActionData, useNavigation, useSubmit } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Select,
  Checkbox,
  Button,
  Badge,
  InlineStack,
  Divider,
  Banner,
  Box,
  RangeSlider,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  let settings = await prisma.widgetSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings) {
    settings = await prisma.widgetSettings.create({
      data: { shop: session.shop },
    });
  }

  return { settings };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const data = {
    widgetEnabled:   form.get("widgetEnabled") === "true",
    title:           form.get("title") || "Subscribe & Save",
    subtitle:        form.get("subtitle") || "",
    showOneTime:     form.get("showOneTime") === "true",
    oneTimeLabel:    form.get("oneTimeLabel") || "One-time purchase",
    displayStyle:    form.get("displayStyle") || "cards",
    accentColor:     form.get("accentColor") || "#008060",
    borderRadius:    parseInt(form.get("borderRadius") || "8", 10),
    showBadge:       form.get("showBadge") === "true",
    badgeText:       form.get("badgeText") || "Save {discount}",
    showAboveButton: form.get("showAboveButton") === "true",
  };

  await prisma.widgetSettings.upsert({
    where:  { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { success: true };
};

export default function WidgetSettingsPage() {
  const { settings } = useLoaderData();
  const actionData  = useActionData();
  const navigation  = useNavigation();
  const submit      = useSubmit();
  const isSaving    = navigation.state === "submitting";

  const [widgetEnabled,   setWidgetEnabled]   = useState(settings.widgetEnabled);
  const [title,           setTitle]           = useState(settings.title);
  const [subtitle,        setSubtitle]        = useState(settings.subtitle);
  const [showOneTime,     setShowOneTime]     = useState(settings.showOneTime);
  const [oneTimeLabel,    setOneTimeLabel]    = useState(settings.oneTimeLabel);
  const [displayStyle,    setDisplayStyle]    = useState(settings.displayStyle);
  const [accentColor,     setAccentColor]     = useState(settings.accentColor);
  const [borderRadius,    setBorderRadius]    = useState(settings.borderRadius);
  const [showBadge,       setShowBadge]       = useState(settings.showBadge);
  const [badgeText,       setBadgeText]       = useState(settings.badgeText);
  const [showAboveButton, setShowAboveButton] = useState(settings.showAboveButton);

  const handleSave = useCallback(() => {
    submit(
      {
        widgetEnabled:   String(widgetEnabled),
        title,
        subtitle,
        showOneTime:     String(showOneTime),
        oneTimeLabel,
        displayStyle,
        accentColor,
        borderRadius:    String(borderRadius),
        showBadge:       String(showBadge),
        badgeText,
        showAboveButton: String(showAboveButton),
      },
      { method: "post" }
    );
  }, [
    widgetEnabled, title, subtitle, showOneTime, oneTimeLabel,
    displayStyle, accentColor, borderRadius, showBadge, badgeText,
    showAboveButton, submit,
  ]);

  return (
    <Page
      title="Widget Settings"
      subtitle="Control how the subscription widget looks on your product pages"
      primaryAction={{
        content: isSaving ? "Saving..." : "Save Settings",
        onAction: handleSave,
        loading: isSaving,
      }}
    >
      <Layout>

        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Settings saved successfully." />
          </Layout.Section>
        )}

        {/* Status */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd">Widget Status</Text>
                  <Text tone="subdued">
                    Instantly enable or disable the widget across all product pages.
                  </Text>
                </BlockStack>
                <Badge tone={widgetEnabled ? "success" : "enabled"}>
                  {widgetEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </InlineStack>
              <Checkbox
                label="Show subscription widget on product pages"
                checked={widgetEnabled}
                onChange={setWidgetEnabled}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Text */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Text Content</Text>
              <TextField
                label="Widget title"
                value={title}
                onChange={setTitle}
                helpText='Heading shown above the options. e.g. "Subscribe & Save"'
                autoComplete="off"
              />
              <TextField
                label="Subtitle"
                value={subtitle}
                onChange={setSubtitle}
                helpText="Optional line below the title. Leave blank to hide."
                autoComplete="off"
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* One-time */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">One-time Purchase Option</Text>
              <Checkbox
                label="Show a one-time purchase option alongside subscriptions"
                checked={showOneTime}
                onChange={setShowOneTime}
              />
              {showOneTime && (
                <TextField
                  label="One-time label"
                  value={oneTimeLabel}
                  onChange={setOneTimeLabel}
                  helpText='e.g. "One-time purchase" or "Buy once"'
                  autoComplete="off"
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Design */}
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Text variant="headingMd">Design & Style</Text>
              <Select
                label="Display style"
                options={[
                  { label: "Cards — bordered card per option", value: "cards" },
                  { label: "Pills — compact pill buttons", value: "pills" },
                  { label: "List — simple radio list", value: "list" },
                ]}
                value={displayStyle}
                onChange={setDisplayStyle}
              />
              <Divider />
              <InlineStack gap="400" blockAlign="end">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Accent color"
                    value={accentColor}
                    onChange={setAccentColor}
                    helpText="Hex color for selected state, radio, and badge."
                    autoComplete="off"
                  />
                </div>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 6,
                    background: accentColor,
                    border: "1px solid #e1e3e5",
                    flexShrink: 0,
                  }}
                />
              </InlineStack>
              <Divider />
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="medium">
                  Border radius: {borderRadius}px
                </Text>
                <RangeSlider
                  label="Corner rounding"
                  labelHidden
                  min={0}
                  max={20}
                  value={borderRadius}
                  onChange={setBorderRadius}
                  output
                />
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Badge */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Savings Badge</Text>
              <Checkbox
                label="Show savings badge on discounted plans"
                checked={showBadge}
                onChange={setShowBadge}
              />
              {showBadge && (
                <TextField
                  label="Badge text"
                  value={badgeText}
                  onChange={setBadgeText}
                  helpText='Use {discount} as placeholder. e.g. "Save {discount}" shows "Save 15%" or "Save $5"'
                  autoComplete="off"
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Position */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Position on Product Page</Text>
              <Select
                label="Widget placement"
                options={[
                  {
                    label: "Below the Add to Cart button (recommended)",
                    value: "below",
                  },
                  {
                    label: "Above the Add to Cart button",
                    value: "above",
                  },
                ]}
                value={showAboveButton ? "above" : "below"}
                onChange={(v) => setShowAboveButton(v === "above")}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}