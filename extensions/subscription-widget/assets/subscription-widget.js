(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const roots = document.querySelectorAll(".sp-widget");

    roots.forEach((root) => {
      const shop = root.dataset.shop;
      const sectionId = root.dataset.section;

      root.innerHTML = `<div class="sp-loading">Loading subscription options...</div>`;

      fetch(`/apps/subscription-pro?shop=${encodeURIComponent(shop)}`)
        .then((r) => r.json())
        .then(({ settings, plans }) => {
          if (!settings || !settings.widgetEnabled) {
            root.innerHTML = "";
            return;
          }

          root.style.setProperty("--sp-accent", settings.accentColor || "#008060");
          root.style.setProperty("--sp-radius", (settings.borderRadius || 8) + "px");

          root.innerHTML = buildWidget(settings, plans, sectionId);
          wireCart(root);
        })
        .catch(() => {
          root.innerHTML = "";
        });
    });

    function buildWidget(s, plans, sectionId) {
      const styleClass = `sp-style-${s.displayStyle || "cards"}`;

      const oneTimeRow = s.showOneTime
        ? `<label class="sp-option sp-one-time">
            <input type="radio" name="sp_type_${sectionId}" value="one_time" data-selling-plan-id="" checked />
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
              ${badge && s.showBadge ? `<span class="sp-badge">${esc(badge)}</span>` : ""}
            </label>`;
        })
        .join("");

      const subtitle = s.subtitle ? `<span class="sp-subtitle">${esc(s.subtitle)}</span>` : "";
      const options = s.showAboveButton ? planRows + oneTimeRow : oneTimeRow + planRows;

      return `
        <div class="sp-inner ${styleClass}">
          <div class="sp-header">
            <span class="sp-title">${esc(s.title || "Subscribe & Save")}</span>
            ${subtitle}
          </div>
          <div class="sp-options">${options}</div>
        </div>`;
    }

    function wireCart(root) {
      // Numeric selling plan id of the currently selected radio ("" = one-time).
      const selectedPlanId = () => {
        const checked = root.querySelector("input[type=radio]:checked");
        const raw = (checked && checked.dataset.sellingPlanId) || "";
        return raw.includes("/") ? raw.split("/").pop() : raw;
      };

      // Mirror the selection into a hidden `selling_plan` input on every cart form.
      // Shopify's "Buy it now" / Shop Pay accelerated checkout button reads the
      // selling plan from this form input — its own markup is a closed shadow DOM
      // that can't be intercepted — so the input must be present and current.
      // An empty value means a one-time purchase.
      const applyToForms = (notify) => {
        const planId = selectedPlanId();
        document.querySelectorAll("form[action*='/cart/add']").forEach((form) => {
          let input = form.querySelector("input[name='selling_plan']");
          if (!input) {
            input = document.createElement("input");
            input.type = "hidden";
            input.name = "selling_plan";
            form.appendChild(input);
          }
          if (input.value !== planId) {
            input.value = planId;
            if (notify) form.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
      };

      root.querySelectorAll("input[type=radio]").forEach((radio) => {
        radio.addEventListener("change", () => applyToForms(true));
      });

      applyToForms(false);

      // Many themes re-render the product form / accelerated checkout button when
      // the variant changes (Section Rendering API), which wipes our hidden input.
      // Re-apply on DOM changes so the selling plan survives and "Buy it now"
      // stays a subscription rather than reverting to a one-time purchase.
      let scheduled = false;
      new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          applyToForms(false);
        });
      }).observe(document.body, { childList: true, subtree: true });
    }

    function formatPlan(plan, s) {
      const map = { WEEK: "week", MONTH: "month", YEAR: "year" };
      const unit = map[plan.intervalType] || plan.intervalType.toLowerCase();
      const plural = plan.intervalCount > 1 ? `${plan.intervalCount} ${unit}s` : unit;
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

    function esc(str) {
      return String(str).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
      );
    }
  });
})();