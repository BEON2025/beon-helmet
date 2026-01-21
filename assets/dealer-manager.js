/**
 * Dealer Manager - Dutch Template Version
 * Manages dealer locations with CRUD operations and bulk Excel upload
 * Template uses Dutch column names, UI remains in English
 */

(function() {
  'use strict';

  // Column mapping: Dutch → English
  const COLUMN_MAP = {
    'Bedrijfsnaam': 'name',
    'Straatnaam': 'street',
    'Huisnummer': 'houseNumber',
    'Postcode': 'postalCode',
    'Plaatsnaam': 'city',
    'Land': 'country',
    'E-mail': 'email',
    'Telefoonnummer': 'phone',
    'Website': 'website' // Optional field
  };

  // Dutch column names for template/export
  const DUTCH_COLUMNS = ['Bedrijfsnaam', 'Straatnaam', 'Huisnummer', 'Postcode', 'Plaatsnaam', 'Land', 'E-mail', 'Telefoonnummer', 'Website'];

  // Configuration
  let config = {};
  let dealers = [];
  let filteredDealers = [];
  let hasUnsavedChanges = false;
  let sortColumn = 'name';
  let sortDirection = 'asc';
  let uploadedData = null;

  // DOM Elements
  const elements = {};

  /**
   * Initialize the dealer manager
   */
  function init() {
    const configEl = document.getElementById('dealer-manager-config');
    if (configEl) {
      config = JSON.parse(configEl.textContent);
    }

    cacheElements();
    loadDealers();
    setupEventListeners();
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
    elements.addBtn?.addEventListener('click', () => openModal());
    elements.saveBtn?.addEventListener('click', saveDealers);
    elements.exportBtn?.addEventListener('click', exportDealers);
    elements.templateBtn?.addEventListener('click', downloadTemplate);
    elements.excelUpload?.addEventListener('change', handleExcelUpload);
    elements.searchInput?.addEventListener('input', debounce(handleSearch, 300));

    const sortableHeaders = document.querySelectorAll('th.sortable');
    sortableHeaders.forEach(header => {
      header.addEventListener('click', () => handleSort(header.dataset.column));
    });

    // Modal close handlers
    elements.modalClose?.addEventListener('click', closeModal);
    elements.modalCancel?.addEventListener('click', closeModal);
    elements.modal?.querySelector('.modal-overlay')?.addEventListener('click', closeModal);

    // Form submit
    elements.dealerForm?.addEventListener('submit', handleFormSubmit);

    // Drag and drop
    const uploadArea = document.querySelector('.upload-area');
    if (uploadArea) {
      uploadArea.addEventListener('dragover', handleDragOver);
      uploadArea.addEventListener('dragleave', handleDragLeave);
      uploadArea.addEventListener('drop', handleDrop);
    }
  }

  /**
   * Load SheetJS library
   */
  function loadSheetJS() {
    if (typeof XLSX !== 'undefined') return;

    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
    script.onload = () => console.log('SheetJS loaded');
    script.onerror = () => showStatus('Failed to load Excel library', 'error');
    document.head.appendChild(script);
  }

  /**
   * Load dealers from Shopify metafields
   */
  async function loadDealers() {
    if (!config.apiToken) {
      showStatus('API token not configured. Dealers cannot be loaded.', 'error');
      dealers = [];
      renderTable();
      return;
    }

    showStatus('Loading dealers...', 'loading');

    try {
      const pageId = await getPageId(config.pageHandle);
      
      if (!pageId) {
        throw new Error(`Page "${config.pageHandle}" not found`);
      }

      const response = await fetch(`https://${config.shopDomain}/admin/api/2024-01/pages/${pageId}/metafields.json`, {
        headers: {
          'X-Shopify-Access-Token': config.apiToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch metafields');

      const data = await response.json();
      const dealerMetafield = data.metafields?.find(m => m.namespace === 'custom' && m.key === 'dealers');

      if (dealerMetafield && dealerMetafield.value) {
        const parsed = JSON.parse(dealerMetafield.value);
        dealers = Array.isArray(parsed) ? parsed : (parsed.dealers || []);
      } else {
        dealers = [];
      }

      renderTable();
      showStatus(`Loaded ${dealers.length} dealers`, 'success');
      setTimeout(() => hideStatus(), 2000);
    } catch (error) {
      console.error('Error loading dealers:', error);
      showStatus(error.message, 'error');
      dealers = [];
      renderTable();
    }
  }

  /**
   * Get page ID by handle
   */
  async function getPageId(handle) {
    try {
      const response = await fetch(`https://${config.shopDomain}/admin/api/2024-01/pages.json?handle=${handle}`, {
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

      // Check if metafield exists
      const existingResponse = await fetch(`https://${config.shopDomain}/admin/api/2024-01/pages/${pageId}/metafields.json`, {
        headers: {
          'X-Shopify-Access-Token': config.apiToken,
          'Content-Type': 'application/json'
        }
      });

      const existingData = await existingResponse.json();
      const dealerMetafield = existingData.metafields?.find(m => m.namespace === 'custom' && m.key === 'dealers');

      const metafieldPayload = {
        metafield: {
          namespace: 'custom',
          key: 'dealers',
          value: JSON.stringify(dealers),
          type: 'json'
        }
      };

      let response;
      if (dealerMetafield) {
        // Update existing
        response = await fetch(`https://${config.shopDomain}/admin/api/2024-01/pages/${pageId}/metafields/${dealerMetafield.id}.json`, {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': config.apiToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(metafieldPayload)
        });
      } else {
        // Create new
        response = await fetch(`https://${config.shopDomain}/admin/api/2024-01/pages/${pageId}/metafields.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': config.apiToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(metafieldPayload)
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errors || 'Failed to save');
      }

      hasUnsavedChanges = false;
      elements.saveBtn.disabled = true;
      showStatus('Dealers saved successfully!', 'success');
      setTimeout(() => hideStatus(), 3000);
    } catch (error) {
      console.error('Error saving dealers:', error);
      showStatus(`Error: ${error.message}`, 'error');
      elements.saveBtn.disabled = false;
    }
  }

  /**
   * Combine address fields for Google Maps
   */
  function getFullAddress(dealer) {
    const parts = [];
    if (dealer.street) parts.push(dealer.street);
    if (dealer.houseNumber) parts.push(dealer.houseNumber);
    if (dealer.postalCode) parts.push(dealer.postalCode);
    if (dealer.city) parts.push(dealer.city);
    if (dealer.country) parts.push(dealer.country);
    return parts.join(', ');
  }

  /**
   * Render dealers table
   */
  function renderTable() {
    filteredDealers = dealers.filter(dealer => {
      if (!elements.searchInput.value) return true;
      const search = elements.searchInput.value.toLowerCase();
      const fullAddress = getFullAddress(dealer).toLowerCase();
      return dealer.name?.toLowerCase().includes(search) ||
             fullAddress.includes(search) ||
             dealer.phone?.toLowerCase().includes(search) ||
             dealer.email?.toLowerCase().includes(search);
    });

    // Sort
    filteredDealers.sort((a, b) => {
      let aVal = a[sortColumn] || '';
      let bVal = b[sortColumn] || '';
      
      if (sortColumn === 'address') {
        aVal = getFullAddress(a);
        bVal = getFullAddress(b);
      }
      
      const comparison = aVal.toString().localeCompare(bVal.toString());
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Update counts
    elements.visibleCount.textContent = filteredDealers.length;
    elements.totalCount.textContent = dealers.length;

    // Render rows
    if (filteredDealers.length === 0) {
      elements.tbody.innerHTML = `
        <tr class="empty-state">
          <td colspan="6">
            <div class="empty-state-content">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor">
                <circle cx="32" cy="32" r="28" stroke-width="2"/>
                <path d="M32 20v16m0 4h.01" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <h3>${dealers.length === 0 ? 'No dealers yet' : 'No dealers match your search'}</h3>
              <p>${dealers.length === 0 ? 'Add dealers manually or upload an Excel file' : 'Try a different search term'}</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    elements.tbody.innerHTML = filteredDealers.map(dealer => `
      <tr>
        <td>${escapeHtml(dealer.name || '')}</td>
        <td>${escapeHtml(getFullAddress(dealer))}</td>
        <td>${escapeHtml(dealer.phone || '')}</td>
        <td>${escapeHtml(dealer.email || '')}</td>
        <td>${dealer.website ? `<a href="${escapeHtml(dealer.website)}" target="_blank" rel="noopener">${escapeHtml(dealer.website)}</a>` : ''}</td>
        <td class="actions-column">
          <div class="actions-cell">
            <button class="btn-icon" onclick="window.dealerManager.editDealer('${dealer.id}')" title="Edit">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.146.854a.5.5 0 01.708 0l2.292 2.292a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10z"/>
              </svg>
            </button>
            <button class="btn-icon btn-delete" onclick="window.dealerManager.deleteDealer('${dealer.id}')" title="Delete">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                <path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Update sort indicators
    document.querySelectorAll('th.sortable').forEach(th => {
      th.classList.remove('sorted');
      th.querySelector('.sort-indicator').textContent = '';
    });
    
    const activeHeader = document.querySelector(`th[data-column="${sortColumn}"]`);
    if (activeHeader) {
      activeHeader.classList.add('sorted');
      activeHeader.querySelector('.sort-indicator').textContent = sortDirection === 'asc' ? '↑' : '↓';
    }
  }

  /**
   * Handle Excel file upload
   */
  function handleExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx')) {
      showStatus('Please upload an .xlsx file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        if (typeof XLSX === 'undefined') {
          showStatus('Excel library not loaded. Please refresh and try again.', 'error');
          return;
        }

        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        if (jsonData.length === 0) {
          showStatus('The Excel file is empty', 'error');
          return;
        }

        // Parse dealers with Dutch column names
        const parsedDealers = jsonData.map((row, index) => {
          const dealer = {
            id: Date.now() + '_' + index,
            name: row['Bedrijfsnaam'] || row['Name'] || '',
            street: row['Straatnaam'] || row['Street'] || '',
            houseNumber: row['Huisnummer'] || row['House Number'] || '',
            postalCode: row['Postcode'] || row['Postal Code'] || '',
            city: row['Plaatsnaam'] || row['City'] || '',
            country: row['Land'] || row['Country'] || 'Netherlands',
            email: row['E-mail'] || row['Email'] || '',
            phone: row['Telefoonnummer'] || row['Phone'] || '',
            website: row['Website'] || ''
          };
          return dealer;
        });

        // Directly import data
        const mode = document.querySelector('input[name="upload-mode"]:checked').value;
        
        if (mode === 'replace') {
          dealers = parsedDealers;
        } else {
          dealers = [...dealers, ...parsedDealers];
        }

        elements.excelUpload.value = '';
        markUnsaved();
        renderTable();
        showStatus(`${mode === 'replace' ? 'Replaced with' : 'Added'} ${parsedDealers.length} dealers`, 'success');
      } catch (error) {
        console.error('Error parsing Excel:', error);
        showStatus('Error reading Excel file: ' + error.message, 'error');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  /**
   * Export dealers to Excel with Dutch headers
   */
  function exportDealers() {
    if (typeof XLSX === 'undefined') {
      showStatus('Excel library not loaded', 'error');
      return;
    }

    const exportData = dealers.map(d => ({
      'Bedrijfsnaam': d.name || '',
      'Straatnaam': d.street || '',
      'Huisnummer': d.houseNumber || '',
      'Postcode': d.postalCode || '',
      'Plaatsnaam': d.city || '',
      'Land': d.country || '',
      'E-mail': d.email || '',
      'Telefoonnummer': d.phone || '',
      'Website': d.website || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dealers');

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `dealers_export_${date}.xlsx`);
    showStatus('Dealers exported successfully', 'success');
  }

  /**
   * Download Excel template with Dutch headers
   */
  function downloadTemplate() {
    if (typeof XLSX === 'undefined') {
      showStatus('Excel library not loaded', 'error');
      return;
    }

    const templateData = [{
      'Bedrijfsnaam': 'Example Store',
      'Straatnaam': 'Main Street',
      'Huisnummer': '123',
      'Postcode': '1234 AB',
      'Plaatsnaam': 'Amsterdam',
      'Land': 'Netherlands',
      'E-mail': 'info@example.com',
      'Telefoonnummer': '020 1234567',
      'Website': 'https://www.example.com'
    }];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dealers');

    XLSX.writeFile(wb, 'dealer_template.xlsx');
    showStatus('Template downloaded', 'success');
  }

  /**
   * Handle sorting
   */
  function handleSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
    renderTable();
  }

  /**
   * Handle search
   */
  function handleSearch() {
    renderTable();
  }

  /**
   * Open modal for add/edit
   */
  function openModal(dealer = null) {
    if (dealer) {
      elements.modalTitle.textContent = 'Edit Dealer';
      document.getElementById('dealer-id').value = dealer.id;
      document.getElementById('dealer-name').value = dealer.name || '';
      document.getElementById('dealer-street').value = dealer.street || '';
      document.getElementById('dealer-house-number').value = dealer.houseNumber || '';
      document.getElementById('dealer-postal-code').value = dealer.postalCode || '';
      document.getElementById('dealer-city').value = dealer.city || '';
      document.getElementById('dealer-country').value = dealer.country || 'Netherlands';
      document.getElementById('dealer-email').value = dealer.email || '';
      document.getElementById('dealer-phone').value = dealer.phone || '';
      document.getElementById('dealer-website').value = dealer.website || '';
    } else {
      elements.modalTitle.textContent = 'Add Dealer';
      elements.dealerForm.reset();
      document.getElementById('dealer-id').value = '';
      document.getElementById('dealer-country').value = 'Netherlands';
    }

    elements.modal.style.display = 'flex';
  }

  /**
   * Close modal
   */
  function closeModal() {
    elements.modal.style.display = 'none';
    elements.dealerForm.reset();
  }

  /**
   * Handle form submit
   */
  function handleFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const dealerId = document.getElementById('dealer-id').value;

    const dealer = {
      id: dealerId || Date.now().toString(),
      name: formData.get('name'),
      street: formData.get('street'),
      houseNumber: formData.get('houseNumber'),
      postalCode: formData.get('postalCode'),
      city: formData.get('city'),
      country: formData.get('country'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      website: formData.get('website')
    };

    if (dealerId) {
      const index = dealers.findIndex(d => d.id === dealerId);
      if (index !== -1) dealers[index] = dealer;
    } else {
      dealers.push(dealer);
    }

    markUnsaved();
    renderTable();
    closeModal();
    showStatus('Dealer ' + (dealerId ? 'updated' : 'added'), 'success');
  }

  /**
   * Edit dealer
   */
  function editDealer(id) {
    const dealer = dealers.find(d => d.id === id);
    if (dealer) openModal(dealer);
  }

  /**
   * Delete dealer
   */
  function deleteDealer(id) {
    if (!confirm('Are you sure you want to delete this dealer?')) return;

    dealers = dealers.filter(d => d.id !== id);
    markUnsaved();
    renderTable();
    showStatus('Dealer deleted', 'success');
  }

  /**
   * Mark unsaved changes
   */
  function markUnsaved() {
    hasUnsavedChanges = true;
    elements.saveBtn.disabled = false;
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
   * Drag and drop handlers
   */
  function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }

  function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      elements.excelUpload.files = files;
      handleExcelUpload({ target: { files: files } });
    }
  }

  /**
   * Debounce function
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  /**
   * Escape HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public API
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
