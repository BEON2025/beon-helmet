/**
 * Dealer Manager
 * Manages dealer locations with CRUD operations and bulk Excel upload
 */

(function() {
  'use strict';

  // Configuration
  let config = {};
  let dealers = [];
  let filteredDealers = [];
  let hasUnsavedChanges = false;
  let sortColumn = 'name';
  let sortDirection = 'asc';

  // DOM Elements
  const elements = {};

  /**
   * Initialize the dealer manager
   */
  function init() {
    // Load configuration
    const configEl = document.getElementById('dealer-manager-config');
    if (configEl) {
      config = JSON.parse(configEl.textContent);
    }

    // Cache DOM elements
    cacheElements();

    // Load existing dealers
    loadDealers();

    // Setup event listeners
    setupEventListeners();

    // Load SheetJS library for Excel handling
    loadSheetJS();
  }

  /**
   * Cache frequently used DOM elements
   */
  function cacheElements() {
    elements.tbody = document.getElementById('dealers-tbody');
    elements.table = document.getElementById('dealers-table');
    elements.searchInput = document.getElementById('dealer-search');
    elements.visibleCount = document.getElementById('visible-count');
    elements.totalCount = document.getElementById('total-count');
    elements.saveBtn = document.getElementById('save-dealers-btn');
    elements.addBtn = document.getElementById('add-dealer-btn');
    elements.exportBtn = document.getElementById('export-dealers-btn');
    elements.templateBtn = document.getElementById('download-template-btn');
    elements.excelUpload = document.getElementById('excel-upload');
    elements.uploadPreview = document.getElementById('upload-preview');
    elements.previewCount = document.getElementById('preview-count');
    elements.previewContainer = document.getElementById('preview-table-container');
    elements.confirmUploadBtn = document.getElementById('confirm-upload-btn');
    elements.cancelUploadBtn = document.getElementById('cancel-upload-btn');
    elements.modal = document.getElementById('dealer-modal');
    elements.modalTitle = document.getElementById('modal-title');
    elements.modalClose = document.getElementById('modal-close-btn');
    elements.modalCancel = document.getElementById('modal-cancel-btn');
    elements.dealerForm = document.getElementById('dealer-form');
    elements.status = document.getElementById('dealer-manager-status');
  }

  /**
   * Setup all event listeners
   */
  function setupEventListeners() {
    // Add dealer button
    elements.addBtn?.addEventListener('click', () => openModal());

    // Save button
    elements.saveBtn?.addEventListener('click', saveDealers);

    // Export dealers
    elements.exportBtn?.addEventListener('click', exportDealers);

    // Download template
    elements.templateBtn?.addEventListener('click', downloadTemplate);

    // Excel upload
    elements.excelUpload?.addEventListener('change', handleExcelUpload);

    // Upload preview actions
    elements.confirmUploadBtn?.addEventListener('click', confirmUpload);
    elements.cancelUploadBtn?.addEventListener('click', cancelUpload);

    // Search
    elements.searchInput?.addEventListener('input', debounce(handleSearch, 300));

    // Table sorting
    const sortableHeaders = document.querySelectorAll('th.sortable');
    sortableHeaders.forEach(header => {
      header.addEventListener('click', () => handleSort(header.dataset.column));
    });

    // Modal
    elements.modalClose?.addEventListener('click', closeModal);
    elements.modalCancel?.addEventListener('click', closeModal);
    elements.modal?.querySelector('.modal-overlay')?.addEventListener('click', closeModal);
    elements.dealerForm?.addEventListener('submit', handleDealerFormSubmit);

    // Drag and drop for file upload
    setupDragAndDrop();
  }

  /**
   * Setup drag and drop for file upload
   */
  function setupDragAndDrop() {
    const uploadArea = document.querySelector('.upload-area');
    if (!uploadArea) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
      uploadArea.addEventListener(eventName, () => {
        uploadArea.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      uploadArea.addEventListener(eventName, () => {
        uploadArea.classList.remove('drag-over');
      }, false);
    });

    uploadArea.addEventListener('drop', function(e) {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        elements.excelUpload.files = files;
        handleExcelUpload({ target: elements.excelUpload });
      }
    }, false);
  }

  /**
   * Load dealers from page metafields
   */
  async function loadDealers() {
    showStatus('Loading dealers...', 'loading');

    try {
      // Get page ID first
      const pageId = await getPageId(config.pageHandle);
      
      if (!pageId) {
        showStatus('Dealer locator page not found', 'error');
        dealers = [];
        renderTable();
        return;
      }

      // Fetch metafields
      const response = await fetch(`/admin/api/2024-01/pages/${pageId}/metafields.json`, {
        headers: {
          'X-Shopify-Access-Token': config.apiToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load dealers');
      }

      const data = await response.json();
      const dealersMetafield = data.metafields?.find(m => m.namespace === 'custom' && m.key === 'dealers');
      
      if (dealersMetafield && dealersMetafield.value) {
        const parsed = JSON.parse(dealersMetafield.value);
        dealers = parsed.dealers || [];
      } else {
        dealers = [];
      }

      filteredDealers = [...dealers];
      renderTable();
      showStatus(`Loaded ${dealers.length} dealers`, 'success');
      
      setTimeout(() => hideStatus(), 3000);

    } catch (error) {
      console.error('Error loading dealers:', error);
      showStatus('Error loading dealers. Check API token.', 'error');
      dealers = [];
      renderTable();
    }
  }

  /**
   * Get page ID by handle
   */
  async function getPageId(handle) {
    try {
      const response = await fetch(`/admin/api/2024-01/pages.json?handle=${handle}`, {
        headers: {
          'X-Shopify-Access-Token': config.apiToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) return null;

      const data = await response.json();
      return data.pages?.[0]?.id;
    } catch (error) {
      console.error('Error getting page ID:', error);
      return null;
    }
  }

  /**
   * Save dealers to metafields
   */
  async function saveDealers() {
    if (!config.apiToken) {
      showStatus('API token not configured. Add it in section settings.', 'error');
      return;
    }

    showStatus('Saving dealers...', 'loading');
    elements.saveBtn.disabled = true;

    try {
      const pageId = await getPageId(config.pageHandle);
      
      if (!pageId) {
        throw new Error('Page not found');
      }

      const metafieldValue = {
        dealers: dealers,
        last_updated: new Date().toISOString(),
        updated_by: 'dealer-manager'
      };

      // Check if metafield exists
      const existing = await fetch(`/admin/api/2024-01/pages/${pageId}/metafields.json`, {
        headers: {
          'X-Shopify-Access-Token': config.apiToken,
          'Content-Type': 'application/json'
        }
      });

      const existingData = await existing.json();
      const metafield = existingData.metafields?.find(m => m.namespace === 'custom' && m.key === 'dealers');

      let response;
      if (metafield) {
        // Update existing metafield
        response = await fetch(`/admin/api/2024-01/pages/${pageId}/metafields/${metafield.id}.json`, {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': config.apiToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            metafield: {
              value: JSON.stringify(metafieldValue),
              type: 'json'
            }
          })
        });
      } else {
        // Create new metafield
        response = await fetch(`/admin/api/2024-01/pages/${pageId}/metafields.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': config.apiToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            metafield: {
              namespace: 'custom',
              key: 'dealers',
              value: JSON.stringify(metafieldValue),
              type: 'json'
            }
          })
        });
      }

      if (!response.ok) {
        throw new Error('Failed to save dealers');
      }

      hasUnsavedChanges = false;
      elements.saveBtn.disabled = true;
      showStatus('Dealers saved successfully!', 'success');
      
      setTimeout(() => hideStatus(), 3000);

    } catch (error) {
      console.error('Error saving dealers:', error);
      showStatus('Error saving dealers. Check console for details.', 'error');
      elements.saveBtn.disabled = false;
    }
  }

  /**
   * Render the dealers table
   */
  function renderTable() {
    if (!elements.tbody) return;

    elements.totalCount.textContent = dealers.length;
    elements.visibleCount.textContent = filteredDealers.length;

    if (filteredDealers.length === 0) {
      elements.tbody.innerHTML = `
        <tr class="empty-state">
          <td colspan="5">
            <div class="empty-state-content">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor">
                <circle cx="32" cy="32" r="28" stroke-width="2"/>
                <path d="M32 20v16m0 4h.01" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <h3>${dealers.length === 0 ? 'No dealers yet' : 'No matching dealers'}</h3>
              <p>${dealers.length === 0 ? 'Add dealers manually or upload an Excel file to get started' : 'Try adjusting your search'}</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    elements.tbody.innerHTML = filteredDealers.map(dealer => `
      <tr data-id="${dealer.id}">
        <td>${escapeHtml(dealer.name)}</td>
        <td>${escapeHtml(dealer.address)}</td>
        <td>${escapeHtml(dealer.phone)}</td>
        <td>
          ${dealer.domain ? `<a href="${escapeHtml(dealer.domain)}" target="_blank" rel="noopener">${escapeHtml(formatDomain(dealer.domain))}</a>` : '-'}
        </td>
        <td class="actions-cell">
          <button class="btn-icon" onclick="window.dealerManager.editDealer('${dealer.id}')" title="Edit">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M11 2l3 3-9 9H2v-3l9-9z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="btn-icon btn-delete" onclick="window.dealerManager.deleteDealer('${dealer.id}')" title="Delete">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4h10z" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Handle search input
   */
  function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      filteredDealers = [...dealers];
    } else {
      filteredDealers = dealers.filter(dealer => 
        dealer.name.toLowerCase().includes(query) ||
        dealer.address.toLowerCase().includes(query) ||
        dealer.phone.toLowerCase().includes(query) ||
        (dealer.domain && dealer.domain.toLowerCase().includes(query))
      );
    }

    renderTable();
  }

  /**
   * Handle table sorting
   */
  function handleSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }

    filteredDealers.sort((a, b) => {
      const aVal = (a[column] || '').toString().toLowerCase();
      const bVal = (b[column] || '').toString().toLowerCase();
      
      if (sortDirection === 'asc') {
        return aVal.localeCompare(bVal);
      } else {
        return bVal.localeCompare(aVal);
      }
    });

    renderTable();
    updateSortIndicators();
  }

  /**
   * Update sort indicators in table headers
   */
  function updateSortIndicators() {
    document.querySelectorAll('th.sortable').forEach(th => {
      const indicator = th.querySelector('.sort-indicator');
      if (th.dataset.column === sortColumn) {
        indicator.textContent = sortDirection === 'asc' ? '↑' : '↓';
        th.classList.add('sorted');
      } else {
        indicator.textContent = '';
        th.classList.remove('sorted');
      }
    });
  }

  /**
   * Open add/edit modal
   */
  function openModal(dealer = null) {
    if (dealer) {
      elements.modalTitle.textContent = 'Edit Dealer';
      document.getElementById('dealer-id').value = dealer.id;
      document.getElementById('dealer-name').value = dealer.name;
      document.getElementById('dealer-address').value = dealer.address;
      document.getElementById('dealer-phone').value = dealer.phone;
      document.getElementById('dealer-domain').value = dealer.domain || '';
    } else {
      elements.modalTitle.textContent = 'Add Dealer';
      elements.dealerForm.reset();
    }

    elements.modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  /**
   * Close modal
   */
  function closeModal() {
    elements.modal.style.display = 'none';
    document.body.style.overflow = '';
    elements.dealerForm.reset();
  }

  /**
   * Handle dealer form submission
   */
  function handleDealerFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('dealer-id').value;
    const name = document.getElementById('dealer-name').value.trim();
    const address = document.getElementById('dealer-address').value.trim();
    const phone = document.getElementById('dealer-phone').value.trim();
    const domain = document.getElementById('dealer-domain').value.trim();

    if (!name || !address || !phone) {
      showStatus('Please fill in all required fields', 'error');
      return;
    }

    if (id) {
      // Update existing dealer
      const index = dealers.findIndex(d => d.id === id);
      if (index !== -1) {
        dealers[index] = { id, name, address, phone, domain };
      }
    } else {
      // Add new dealer
      dealers.push({
        id: generateId(),
        name,
        address,
        phone,
        domain
      });
    }

    markUnsaved();
    filteredDealers = [...dealers];
    renderTable();
    closeModal();
    showStatus(id ? 'Dealer updated' : 'Dealer added', 'success');
    setTimeout(() => hideStatus(), 2000);
  }

  /**
   * Edit dealer
   */
  function editDealer(id) {
    const dealer = dealers.find(d => d.id === id);
    if (dealer) {
      openModal(dealer);
    }
  }

  /**
   * Delete dealer
   */
  function deleteDealer(id) {
    if (!confirm('Are you sure you want to delete this dealer?')) {
      return;
    }

    dealers = dealers.filter(d => d.id !== id);
    filteredDealers = filteredDealers.filter(d => d.id !== id);
    markUnsaved();
    renderTable();
    showStatus('Dealer deleted', 'success');
    setTimeout(() => hideStatus(), 2000);
  }

  /**
   * Handle Excel file upload
   */
  function handleExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx')) {
      showStatus('Please upload an Excel file (.xlsx)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        previewUpload(jsonData);
      } catch (error) {
        console.error('Error reading Excel file:', error);
        showStatus('Error reading Excel file', 'error');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  /**
   * Preview uploaded dealers
   */
  function previewUpload(data) {
    if (!data || data.length === 0) {
      showStatus('Excel file is empty', 'error');
      return;
    }

    // Validate and transform data
    const uploadedDealers = data.map((row, index) => ({
      id: generateId(),
      name: row.name || row.Name || '',
      address: row.address || row.Address || '',
      phone: row.phone || row.Phone || '',
      domain: row.domain || row.Domain || row.website || row.Website || ''
    })).filter(d => d.name && d.address && d.phone);

    if (uploadedDealers.length === 0) {
      showStatus('No valid dealers found in file. Check column names.', 'error');
      return;
    }

    // Store for confirmation
    window.pendingUpload = uploadedDealers;

    // Show preview
    elements.previewCount.textContent = uploadedDealers.length;
    elements.previewContainer.innerHTML = `
      <table class="preview-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Address</th>
            <th>Phone</th>
            <th>Website</th>
          </tr>
        </thead>
        <tbody>
          ${uploadedDealers.slice(0, 10).map(d => `
            <tr>
              <td>${escapeHtml(d.name)}</td>
              <td>${escapeHtml(d.address)}</td>
              <td>${escapeHtml(d.phone)}</td>
              <td>${escapeHtml(d.domain || '-')}</td>
            </tr>
          `).join('')}
          ${uploadedDealers.length > 10 ? `<tr><td colspan="4" class="preview-more">... and ${uploadedDealers.length - 10} more</td></tr>` : ''}
        </tbody>
      </table>
    `;

    elements.uploadPreview.style.display = 'block';
  }

  /**
   * Confirm upload
   */
  function confirmUpload() {
    const uploadedDealers = window.pendingUpload;
    if (!uploadedDealers) return;

    const mode = document.querySelector('input[name="upload-mode"]:checked')?.value;

    if (mode === 'replace') {
      dealers = [...uploadedDealers];
    } else {
      // Add mode - merge with existing
      uploadedDealers.forEach(newDealer => {
        const existingIndex = dealers.findIndex(d => 
          d.name.toLowerCase() === newDealer.name.toLowerCase()
        );

        if (existingIndex >= 0) {
          // Update existing
          dealers[existingIndex] = newDealer;
        } else {
          // Add new
          dealers.push(newDealer);
        }
      });
    }

    markUnsaved();
    filteredDealers = [...dealers];
    renderTable();
    cancelUpload();
    showStatus(`${uploadedDealers.length} dealers imported successfully`, 'success');
    setTimeout(() => hideStatus(), 3000);
  }

  /**
   * Cancel upload
   */
  function cancelUpload() {
    elements.uploadPreview.style.display = 'none';
    elements.excelUpload.value = '';
    window.pendingUpload = null;
  }

  /**
   * Export dealers to Excel
   */
  function exportDealers() {
    if (dealers.length === 0) {
      showStatus('No dealers to export', 'error');
      return;
    }

    const exportData = dealers.map(d => ({
      name: d.name,
      address: d.address,
      phone: d.phone,
      domain: d.domain || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dealers');
    XLSX.writeFile(wb, `dealers-export-${new Date().toISOString().split('T')[0]}.xlsx`);

    showStatus('Dealers exported successfully', 'success');
    setTimeout(() => hideStatus(), 2000);
  }

  /**
   * Download Excel template
   */
  function downloadTemplate() {
    const templateData = [
      {
        name: 'Example Store',
        address: 'Street 123, City 12345, Country',
        phone: '000 0000000',
        domain: 'https://example.com'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dealers');
    XLSX.writeFile(wb, 'dealer-template.xlsx');

    showStatus('Template downloaded', 'success');
    setTimeout(() => hideStatus(), 2000);
  }

  /**
   * Load SheetJS library
   */
  function loadSheetJS() {
    if (window.XLSX) return;

    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
    script.onload = () => {
      console.log('SheetJS library loaded');
    };
    script.onerror = () => {
      console.error('Failed to load SheetJS library');
      showStatus('Failed to load Excel library. Upload feature unavailable.', 'error');
    };
    document.head.appendChild(script);
  }

  /**
   * Show status message
   */
  function showStatus(message, type) {
    elements.status.className = `dealer-manager-status status-${type}`;
    elements.status.querySelector('.status-message').textContent = message;
    elements.status.style.display = 'flex';
  }

  /**
   * Hide status message
   */
  function hideStatus() {
    elements.status.style.display = 'none';
  }

  /**
   * Mark unsaved changes
   */
  function markUnsaved() {
    hasUnsavedChanges = true;
    elements.saveBtn.disabled = false;
  }

  /**
   * Generate unique ID
   */
  function generateId() {
    return 'dealer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Format domain for display
   */
  function formatDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /**
   * Escape HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Debounce function
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Expose public API
  window.dealerManager = {
    editDealer,
    deleteDealer
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
