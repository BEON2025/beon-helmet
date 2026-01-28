/**
 * Dealer Manager Inline - API Version
 * Manages dealer locations with CRUD operations and bulk Excel upload
 * Now connects to external Vercel API for data persistence
 */

(function() {
  'use strict';

  // Get API URL from window (set by Liquid template)
  const API_URL = window.DEALER_API_URL || 'https://dealer-manager-three.vercel.app/api/dealers';

  // Dutch column names for template/export
  const DUTCH_COLUMNS = ['Bedrijfsnaam', 'Straatnaam', 'Huisnummer', 'Postcode', 'Plaatsnaam', 'Land', 'E-mail', 'Telefoonnummer', 'Website'];

  // Configuration
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
    // Check if dealer manager section exists
    if (!document.getElementById('dealer-manager-inline')) return;

    cacheElements();
    loadDealersFromAPI();
    setupEventListeners();
    loadSheetJS();
    setupToggle();
  }

  /**
   * Setup toggle button
   */
  function setupToggle() {
    const toggleBtn = document.getElementById('dealer-manager-toggle');
    const panel = document.getElementById('dealer-manager-inline');
    
    if (toggleBtn && panel) {
      toggleBtn.addEventListener('click', function() {
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        toggleBtn.textContent = isVisible ? 'Manage Dealers' : 'Hide Dealer Manager';
        toggleBtn.classList.toggle('active', !isVisible);
      });
    }
  }

  /**
   * Cache frequently used DOM elements
   */
  function cacheElements() {
    elements.tbody = document.getElementById('dealers-tbody-inline');
    elements.table = document.getElementById('dealers-table-inline');
    elements.searchInput = document.getElementById('dealer-search-inline');
    elements.visibleCount = document.getElementById('visible-count-inline');
    elements.totalCount = document.getElementById('total-count-inline');
    elements.saveBtn = document.getElementById('save-dealers-btn-inline');
    elements.addBtn = document.getElementById('add-dealer-btn-inline');
    elements.exportBtn = document.getElementById('export-dealers-btn-inline');
    elements.templateBtn = document.getElementById('download-template-btn-inline');
    elements.excelUpload = document.getElementById('excel-upload-inline');
    elements.modal = document.getElementById('dealer-modal-inline');
    elements.modalTitle = document.getElementById('modal-title-inline');
    elements.modalClose = document.getElementById('modal-close-btn-inline');
    elements.modalCancel = document.getElementById('modal-cancel-btn-inline');
    elements.dealerForm = document.getElementById('dealer-form-inline');
    elements.status = document.getElementById('dealer-manager-status-inline');
    elements.jsonModal = document.getElementById('json-modal-inline');
    elements.jsonOutput = document.getElementById('json-output-inline');
    elements.copyBtn = document.getElementById('copy-json-btn-inline');
    elements.jsonModalClose = document.getElementById('json-modal-close-inline');
  }

  /**
   * Setup all event listeners
   */
  function setupEventListeners() {
    elements.addBtn?.addEventListener('click', () => openModal());
    elements.saveBtn?.addEventListener('click', saveDealerToAPI);
    elements.exportBtn?.addEventListener('click', exportDealers);
    elements.templateBtn?.addEventListener('click', downloadTemplate);
    elements.excelUpload?.addEventListener('change', handleExcelUpload);
    elements.searchInput?.addEventListener('input', debounce(handleSearch, 300));

    const sortableHeaders = document.querySelectorAll('#dealers-table-inline th.sortable');
    sortableHeaders.forEach(header => {
      header.addEventListener('click', () => handleSort(header.dataset.column));
    });

    // Modal close handlers
    elements.modalClose?.addEventListener('click', closeModal);
    elements.modalCancel?.addEventListener('click', closeModal);
    elements.modal?.querySelector('.modal-overlay')?.addEventListener('click', closeModal);

    // Form submit
    elements.dealerForm?.addEventListener('submit', handleFormSubmit);

    // JSON Modal handlers
    elements.copyBtn?.addEventListener('click', copyJsonToClipboard);
    elements.jsonModalClose?.addEventListener('click', closeJsonModal);
    elements.jsonModal?.querySelector('.modal-overlay')?.addEventListener('click', closeJsonModal);

    // Drag and drop
    const uploadArea = document.querySelector('#dealer-manager-inline .upload-area');
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
   * Load dealers from API
   */
  async function loadDealersFromAPI() {
    showStatus('Loading dealers from API...', 'loading');

    try {
      const response = await fetch(API_URL + '?all=true');
      if (!response.ok) throw new Error('Failed to fetch dealers');
      
      const data = await response.json();
      dealers = data.dealers || [];

      renderTable();
      showStatus(`Loaded ${dealers.length} dealers from API`, 'success');
      setTimeout(() => hideStatus(), 2000);
    } catch (error) {
      console.error('Error loading dealers:', error);
      showStatus('Failed to load dealers: ' + error.message, 'error');
      dealers = [];
      renderTable();
    }
  }

  /**
   * Save dealer to API (create or update)
   */
  async function saveDealerToAPI() {
    if (!hasUnsavedChanges) {
      showStatus('No changes to save', 'info');
      setTimeout(() => hideStatus(), 2000);
      return;
    }

    showStatus('Saving to API...', 'loading');

    try {
      // For now, do a full replace (bulk update)
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealers, mode: 'replace' })
      });

      if (!response.ok) throw new Error('Failed to save dealers');

      const data = await response.json();
      hasUnsavedChanges = false;
      updateSaveButtonState();
      showStatus('Saved successfully! Refresh the page to see changes on the map.', 'success');
      setTimeout(() => hideStatus(), 3000);
    } catch (error) {
      console.error('Error saving dealers:', error);
      showStatus('Failed to save: ' + error.message, 'error');
    }
  }

  /**
   * Show JSON modal for copying (legacy - kept for debugging)
   */
  function showJsonModal() {
    const jsonStr = JSON.stringify(dealers, null, 2);
    elements.jsonOutput.value = jsonStr;
    elements.jsonModal.style.display = 'flex';
  }

  /**
   * Close JSON modal
   */
  function closeJsonModal() {
    elements.jsonModal.style.display = 'none';
  }

  /**
   * Copy JSON to clipboard
   */
  async function copyJsonToClipboard() {
    try {
      await navigator.clipboard.writeText(elements.jsonOutput.value);
      elements.copyBtn.textContent = '✓ Copied!';
      elements.copyBtn.classList.add('copied');
      setTimeout(() => {
        elements.copyBtn.textContent = 'Copy to Clipboard';
        elements.copyBtn.classList.remove('copied');
      }, 2000);
    } catch (err) {
      // Fallback for older browsers
      elements.jsonOutput.select();
      document.execCommand('copy');
      elements.copyBtn.textContent = '✓ Copied!';
      setTimeout(() => {
        elements.copyBtn.textContent = 'Copy to Clipboard';
      }, 2000);
    }
  }

  /**
   * Combine address fields for display
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
    if (!elements.tbody) return;

    filteredDealers = dealers.filter(dealer => {
      if (!elements.searchInput?.value) return true;
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
    if (elements.visibleCount) elements.visibleCount.textContent = filteredDealers.length;
    if (elements.totalCount) elements.totalCount.textContent = dealers.length;

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
            <button class="btn-icon" onclick="window.dealerManagerInline.editDealer('${dealer.id}')" title="Edit">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.146.854a.5.5 0 01.708 0l2.292 2.292a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10z"/>
              </svg>
            </button>
            <button class="btn-icon btn-delete" onclick="window.dealerManagerInline.deleteDealer('${dealer.id}')" title="Delete">
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
    document.querySelectorAll('#dealers-table-inline th.sortable').forEach(th => {
      th.classList.remove('sorted');
      const indicator = th.querySelector('.sort-indicator');
      if (indicator) indicator.textContent = '';
    });
    
    const activeHeader = document.querySelector(`#dealers-table-inline th[data-column="${sortColumn}"]`);
    if (activeHeader) {
      activeHeader.classList.add('sorted');
      const indicator = activeHeader.querySelector('.sort-indicator');
      if (indicator) indicator.textContent = sortDirection === 'asc' ? '↑' : '↓';
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
        const mode = document.querySelector('#dealer-manager-inline input[name="upload-mode-inline"]:checked')?.value || 'add';
        
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
      document.getElementById('dealer-id-inline').value = dealer.id;
      document.getElementById('dealer-name-inline').value = dealer.name || '';
      document.getElementById('dealer-street-inline').value = dealer.street || '';
      document.getElementById('dealer-house-number-inline').value = dealer.houseNumber || '';
      document.getElementById('dealer-postal-code-inline').value = dealer.postalCode || '';
      document.getElementById('dealer-city-inline').value = dealer.city || '';
      document.getElementById('dealer-country-inline').value = dealer.country || 'Netherlands';
      document.getElementById('dealer-email-inline').value = dealer.email || '';
      document.getElementById('dealer-phone-inline').value = dealer.phone || '';
      document.getElementById('dealer-website-inline').value = dealer.website || '';
    } else {
      elements.modalTitle.textContent = 'Add Dealer';
      elements.dealerForm.reset();
      document.getElementById('dealer-id-inline').value = '';
      document.getElementById('dealer-country-inline').value = 'Netherlands';
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
    const dealerId = document.getElementById('dealer-id-inline').value;

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
    if (elements.saveBtn) elements.saveBtn.disabled = false;
  }

  /**
   * Show status message
   */
  function showStatus(message, type) {
    if (!elements.status) return;
    elements.status.className = `dealer-manager-status status-${type}`;
    const msgEl = elements.status.querySelector('.status-message');
    if (msgEl) msgEl.textContent = message;
    elements.status.style.display = 'flex';
  }

  /**
   * Hide status message
   */
  function hideStatus() {
    if (elements.status) elements.status.style.display = 'none';
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
    if (files.length > 0 && elements.excelUpload) {
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
  window.dealerManagerInline = {
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
