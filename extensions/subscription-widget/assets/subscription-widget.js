(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const roots = document.querySelectorAll(".sp-widget");

    roots.forEach((root) => {
      const shop = root.dataset.shop;
      const sectionId = root.dataset.section;

      // Show loading state
      root.innerHTML = `<div class="sp-loading">Loading subscription options...</div>`;

      // Call through Shopify App Proxy — no hardcoded app URL needed
      fetch(`/apps/subscription-app-midahealth?shop=${encodeURIComponent(shop)}`)
        .then((r) => r.json())
        .then(({ settings, plans }) => {
          // If merchant disabled the widget, remove it entirely
          if (!settings || !settings.widgetEnabled) {
            root.innerHTML = "";
            return;
          }

          // Apply merchant's colors and radius as CSS variables
          root.style.setProperty("--sp-accent", settings.accentColor || "#008060");
          root.style.setProperty("--sp-radius", (settings.borderRadius || 8) + "px");

          // Render the widget
          root.innerHTML = buildWidget(settings, plans, sectionId);

          // Wire up the Shopify cart form
          wireCart(root, sectionId);
        })
        .catch(() => {
          root.innerHTML = "";
        });
    });

    // ── Build widget HTML ──────────────────────────────────────────────
    function buildWidget(s, plans, sectionId) {
      const styleClass = `sp-style-${s.displayStyle || "cards"}`;

      const oneTimeRow = s.showOneTime
        ? `<label class="sp-option sp-one-time">
            <input
              type="radio"
              name="sp_type_${sectionId}"
              value="one_time"
              data-selling-plan-id=""
              checked
            />
            <span class="sp-option-content">
              <span class="sp-option-label">${esc(s.oneTimeLabel || "One-time purchase")}</span>
            </span>
          </label>`
        : "";

      const planRows = (plans || [])
        .map((plan, i) => {
          const { intervalLabel, badge } = formatPlan(plan, s);
          const checked = !s.showOneTime && i === 0 ? "checked" : "";
          return `
            <label class="sp-option sp-subscription-option">
              <input
                type="radio"
                name="sp_type_${sectionId}"
                value="subscribe_${plan.id}"
                data-selling-plan-id="${plan.shopifyPlanGroupId || ""}"
                ${checked}
              />
              <span class="sp-option-content">
                <span class="sp-option-label">${esc(plan.name)}</span>
                <span class="sp-option-interval">${intervalLabel}</span>
              </span>
              ${badge && s.showBadge
                ? `<span class="sp-badge">${esc(badge)}</span>`
                : ""}
            </label>`;
        })
        .join("");

      const subtitle = s.subtitle
        ? `<span class="sp-subtitle">${esc(s.subtitle)}</span>`
        : "";

      const options = s.showAboveButton
        ? planRows + oneTimeRow
        : oneTimeRow + planRows;

      return `
        <div class="sp-inner ${styleClass}">
          <div class="sp-header">
            <span class="sp-title">${esc(s.title || "Subscribe & Save")}</span>
            ${subtitle}
          </div>
          <div class="sp-options">
            ${options}
          </div>
        </div>`;
    }

    // ── Wire selling_plan into cart form ──────────────────────────────
    function wireCart(root, sectionId) {
      const form = document.querySelector("form[action*='/cart/add']");
      if (!form) return;

      root.querySelectorAll("input[type=radio]").forEach((radio) => {
        radio.addEventListener("change", () => {
          // Remove any existing selling_plan input
          form.querySelector("input[name='selling_plan']")?.remove();

          const planId = radio.dataset.sellingPlanId;
          if (planId) {
            const inp = document.createElement("input");
            inp.type = "hidden";
            inp.name = "selling_plan";
            inp.value = planId;
            form.appendChild(inp);
          }
        });
      });

      // Trigger on the default selected radio
      root
        .querySelector("input[type=radio]:checked")
        ?.dispatchEvent(new Event("change"));
    }

    // ── Format plan interval and badge ────────────────────────────────
    function formatPlan(plan, s) {
      const map = { WEEK: "week", MONTH: "month", YEAR: "year" };
      const unit = map[plan.intervalType] || plan.intervalType.toLowerCase();
      const plural =
        plan.intervalCount > 1 ? `${plan.intervalCount} ${unit}s` : unit;
      const intervalLabel = `Every ${plural}`;

      let discountStr = "";
      if (plan.discountType === "PERCENTAGE" && plan.discountValue > 0)
        discountStr = `${plan.discountValue}%`;
      else if (plan.discountType === "FIXED_AMOUNT" && plan.discountValue > 0)
        discountStr = `$${plan.discountValue}`;

      const badge = discountStr
        ? (s.badgeText || "Save {discount}").replace("{discount}", discountStr)
        : "";

      return { intervalLabel, badge };
    }

    // ── Escape HTML ───────────────────────────────────────────────────
    function esc(str) {
      return String(str).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          }[c])
      );
    }
  });
})();