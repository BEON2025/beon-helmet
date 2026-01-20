/**
 * Global utility to clean Shopify tracking parameters from product URLs.
 * This ensures clean, SEO-friendly URLs are displayed everywhere on the site.
 */

/**
 * List of Shopify tracking parameters to remove from product URLs.
 * These are added by various Shopify features for analytics purposes.
 */
const TRACKING_PARAMS = [
  // Collection/filter tracking
  '_pos',
  '_fid', 
  '_ss',
  '_psq',
  '_sid',
  // Product recommendation tracking
  'pr_prod_strat',
  'pr_rec_id',
  'pr_rec_pid',
  'pr_ref_pid',
  'pr_seq',
  // Variant parameter (keep URLs clean, variant selection is handled by JavaScript)
  'variant',
];

/**
 * Removes Shopify's tracking parameters from a URL.
 * @param {string} url - The URL to clean
 * @returns {string} The cleaned URL without tracking parameters
 */
export function cleanProductUrl(url) {
  try {
    const urlObj = new URL(url, window.location.origin);
    
    // Only clean product URLs
    if (!urlObj.pathname.includes('/products/')) {
      return url;
    }
    
    // Remove all tracking parameters
    for (const param of TRACKING_PARAMS) {
      urlObj.searchParams.delete(param);
    }
    
    // Remove hash if it looks like a tracking hash (MD5-like)
    if (urlObj.hash && /^#[a-f0-9]{32}$/i.test(urlObj.hash)) {
      urlObj.hash = '';
    }
    
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Cleans tracking parameters from all product links within a container element.
 * @param {Element | Document} container - The container to search for product links
 */
export function cleanProductLinksInContainer(container) {
  const productLinks = container.querySelectorAll('a[href*="/products/"]');
  productLinks.forEach((link) => {
    if (link instanceof HTMLAnchorElement) {
      const cleanedUrl = cleanProductUrl(link.href);
      if (cleanedUrl !== link.href) {
        link.href = cleanedUrl;
      }
    }
  });
}

/**
 * Cleans the current page URL if it's a product page with tracking parameters.
 * Updates the browser's address bar without triggering navigation.
 */
function cleanCurrentPageUrl() {
  const currentUrl = window.location.href;
  const cleanedUrl = cleanProductUrl(currentUrl);
  
  if (cleanedUrl !== currentUrl) {
    history.replaceState(history.state, '', cleanedUrl);
  }
}

/**
 * Sets up a MutationObserver to clean product URLs in dynamically added content.
 */
function observeDOMChanges() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            // Clean links in the added element
            cleanProductLinksInContainer(node);
            
            // Also check if the node itself is a link
            if (node instanceof HTMLAnchorElement && node.href.includes('/products/')) {
              node.href = cleanProductUrl(node.href);
            }
          }
        });
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}

/**
 * Intercepts link clicks to ensure clean URLs are used for navigation.
 */
function interceptLinkClicks() {
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    
    const link = target.closest('a[href*="/products/"]');
    if (link instanceof HTMLAnchorElement) {
      const cleanedUrl = cleanProductUrl(link.href);
      if (cleanedUrl !== link.href) {
        link.href = cleanedUrl;
      }
    }
  }, { capture: true });
}

/**
 * Initialize the global URL cleaner.
 * Call this once when the page loads.
 */
export function initCleanProductUrls() {
  // Clean current page URL if needed
  cleanCurrentPageUrl();
  
  // Clean all existing product links
  cleanProductLinksInContainer(document);
  
  // Watch for dynamically added content
  observeDOMChanges();
  
  // Intercept clicks as a safety net
  interceptLinkClicks();
  
  // Clean URLs after page transitions (for SPA-like navigation)
  window.addEventListener('popstate', cleanCurrentPageUrl);
  
  // Handle back-forward cache (bfcache) - clean URLs when page is restored from cache
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      // Page was restored from bfcache
      cleanCurrentPageUrl();
      cleanProductLinksInContainer(document);
    }
  });
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCleanProductUrls);
} else {
  initCleanProductUrls();
}
