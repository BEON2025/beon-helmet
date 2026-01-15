import { ThemeEvents, VariantUpdateEvent } from '@theme/events';

/**
 * A custom element that displays a product price.
 * This component listens for variant update events and updates the price display accordingly.
 * It handles price updates from two different sources:
 * 1. Variant picker (in quick add modal or product page)
 * 2. Swatches variant picker (in product cards)
 */
class ProductPrice extends HTMLElement {
  connectedCallback() {
    const closestSection = this.closest('.shopify-section, dialog');
    if (!closestSection) return;
    closestSection.addEventListener(ThemeEvents.variantUpdate, this.updatePrice);
  }

  disconnectedCallback() {
    const closestSection = this.closest('.shopify-section, dialog');
    if (!closestSection) return;
    closestSection.removeEventListener(ThemeEvents.variantUpdate, this.updatePrice);
  }

  /**
   * Updates the price.
   * @param {VariantUpdateEvent} event - The variant update event.
   */
  updatePrice = (event) => {
    if (event.detail.data.newProduct) {
      this.dataset.productId = event.detail.data.newProduct.id;
    } else if (event.target instanceof HTMLElement && event.target.dataset.productId !== this.dataset.productId) {
      return;
    }

    const newPrice = event.detail.data.html.querySelector('product-price [ref="priceContainer"]');
    const currentPrice = this.querySelector('[ref="priceContainer"]');

    if (!newPrice || !currentPrice) return;

    // Read the block's display preference from data attribute
    const showDiscountBadge = this.dataset.showDiscountBadge === 'true';

    // Only update numeric price values, preserve badge/crossed-price display
    // to respect the block setting across variant updates
    /**
     * @param {string} selector
     */
    const updateNode = (selector) => {
      const src = newPrice.querySelector(selector);
      const dst = currentPrice.querySelector(selector);
      if (src && dst && dst.innerHTML !== src.innerHTML) {
        dst.innerHTML = src.innerHTML;
      }
    };

    // Update main price and unit price (these change with variants)
    updateNode('.price');
    updateNode('#unit-price');

    // Conditionally update compare-at-price or badge based on block setting
    if (showDiscountBadge) {
      // Block is set to show badge — preserve/update badge, ignore compare-at-price from fragment
      updateNode('.product-price__badge');
      updateNode('.product-badges__badge');
    } else {
      // Block is set to show crossed price — preserve/update compare-at-price, ignore badge from fragment
      updateNode('.compare-at-price');
    }

    // Sync the container class for spacing
    const badgeClass = 'price--has-badge';
    if (showDiscountBadge && !currentPrice.classList.contains(badgeClass)) {
      currentPrice.classList.add(badgeClass);
    } else if (!showDiscountBadge && currentPrice.classList.contains(badgeClass)) {
      currentPrice.classList.remove(badgeClass);
    }
  };
}

if (!customElements.get('product-price')) {
  customElements.define('product-price', ProductPrice);
}
