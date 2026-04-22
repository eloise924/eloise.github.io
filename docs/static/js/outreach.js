/* ============================================================
   OUTREACH WORKSPACE — outreach.js
   ============================================================ */

(function () {
  'use strict';

  const outreachSelection = new Set();

  const SUGGESTED_SHARED_TEMPLATE = [
    'Dear {{ recipient_first_name }},',
    '',
    'I hope this email finds you well. We will be showing {{ film_title }}.',
    '',
    '{{ film_logline }}',
    '',
    'Synopsis: {{ film_synopsis }}',
    '',
    'The screening information is as follows: {{ film_screening_info }}',
    '',
    'We would gladly hand out a pair of free tickets if you could help promote this movie at {{ recipient_org }} and/or provide a ticket discount to {{ recipient_group_phrase }}.',
    '',
    'For more information about the movie, feel free to click here: {{ film_link }}',
    'Trailer: {{ trailer_link }}',
    '',
    'Thank you for your time, and I look forward to hearing from you. If you have any questions, please feel free to contact me.'
  ].join('\n');

  /* ── Utility ──────────────────────────────────────────────── */
  function debounce(fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }

  async function apiFetch(url, options = {}) {
    const defaults = { headers: { 'Content-Type': 'application/json' } };
    const res = await fetch(url, { ...defaults, ...options });
    const responseText = await res.text();
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      if (contentType.includes('application/json')) {
        throw new Error(responseText);
      }

      if (/^\s*<!doctype html/i.test(responseText) || /^\s*<html/i.test(responseText)) {
        throw new Error('Server returned an unexpected HTML error page instead of JSON.');
      }

      throw new Error(responseText || 'Request failed.');
    }

    if (!responseText) return {};
    if (contentType.includes('application/json')) {
      return JSON.parse(responseText);
    }
    return { raw: responseText };
  }

  function setStatus(el, state, text) {
    if (!el) return;
    el.className = 'ow-save-status ' + state;
    el.textContent = text;
  }

  async function saveSharedDraftNow() {
    const ta = document.getElementById('first-draft-ta');
    const status = document.getElementById('first-draft-status');
    const projectId = ta?.dataset.projectId || String(window.OW_PROJECT_ID || '');
    if (!ta || !projectId) return;
    setStatus(status, 'saving', 'Saving…');
    await apiFetch(`/outreach/project/${projectId}/first-draft`, {
      method: 'POST',
      body: JSON.stringify({ text: ta.value })
    });
    window.OW_FIRST_DRAFT = ta.value;
    setStatus(status, 'saved', 'Saved ✓');
  }

  function findGroup(groupId) {
    return (window.OW_GROUPS || []).find(item => String(item.id) === String(groupId));
  }

  function getDraftedRecipientCount(group) {
    return ((group?.members) || []).filter(member => !!member.draft_created).length;
  }

  function getDraftStatusLabel(member) {
    return member?.draft_created ? 'Draft created' : 'Not drafted';
  }

  function getDraftStatusClass(member) {
    return member?.draft_created ? 'is-created' : 'is-pending';
  }

  function canCreateDraftForMember(member) {
    return !member?.draft_created && !!String(member?.email || '').trim();
  }

  function resetOutreachSelection(group) {
    outreachSelection.clear();
    ((group?.members) || []).forEach(member => {
      if (!member?.draft_created) return;
      outreachSelection.delete(String(member.id));
    });
  }

  function getSelectableRecipients(group) {
    return ((group?.members) || []).filter(member => canCreateDraftForMember(member));
  }

  function getSelectedRecipientIds(group) {
    return getSelectableRecipients(group)
      .map(member => String(member.id))
      .filter(memberId => outreachSelection.has(memberId));
  }

  function updateOutreachSelectionUI(group) {
    const selectable = getSelectableRecipients(group);
    const selectedCount = selectable.filter(member => outreachSelection.has(String(member.id))).length;
    const summary = document.getElementById('ow-outreach-selection-summary');
    if (summary) {
      if (!selectable.length) {
        summary.textContent = 'No draft-eligible recipients are available in this group.';
      } else {
        summary.textContent = `${selectedCount} selected · ${selectable.length} draft-eligible recipients`;
      }
    }
    const markBtn = document.getElementById('ow-outreach-mark-drafted-btn');
    if (markBtn) {
      markBtn.disabled = selectedCount === 0;
      markBtn.textContent = selectedCount > 0 ? `Mark Selected as Drafted (${selectedCount})` : 'Mark Selected as Drafted';
    }
    const selectAll = document.getElementById('ow-outreach-select-all');
    if (selectAll) {
      selectAll.checked = !!selectable.length && selectedCount === selectable.length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
      selectAll.disabled = !selectable.length;
    }
  }

  async function resetDraftedRecipients(groupId, memberIds = []) {
    const payload = Array.isArray(memberIds) && memberIds.length
      ? { member_ids: memberIds }
      : {};
    const res = await apiFetch(`/outreach/group/${groupId}/reset-drafted`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const resetIds = new Set((res.reset_member_ids || []).map(id => String(id)));
    const group = findGroup(groupId);
    if (group) {
      (group.members || []).forEach(member => {
        if (!resetIds.has(String(member.id))) return;
        member.draft_created = false;
        member.draft_count = 0;
        member.last_draft_created_at = null;
      });
    }
    syncGroupDraftUI(groupId);
    openOutreachPanel(groupId, { activate: false });
    if (group) openGroupDetail(groupId, group.name || '');
    return res;
  }

  function syncRecipientCheckboxes(group) {
    const selectableIds = new Set(getSelectableRecipients(group).map(member => String(member.id)));
    document.querySelectorAll('.ow-recipient-table__checkbox').forEach(input => {
      const memberId = String(input.dataset.memberId || '');
      if (!selectableIds.has(memberId)) {
        input.checked = false;
        return;
      }
      input.checked = outreachSelection.has(memberId);
    });
    updateOutreachSelectionUI(group);
  }

  function setDraftProgress(text = '', options = {}) {
    const el = document.getElementById('ow-draft-progress');
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-error', 'is-complete');
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('is-error', !!options.error);
    el.classList.toggle('is-complete', !!options.complete);
  }

  function selectFirstRecipients(group, count) {
    const selectable = getSelectableRecipients(group);
    outreachSelection.clear();
    selectable.slice(0, count).forEach(member => {
      outreachSelection.add(String(member.id));
    });
    syncRecipientCheckboxes(group);
  }

  function buildFilmScreeningInfo(film) {
    if (!film) return '';
    if (film.screening_info) return film.screening_info;
    const parts = [];
    if (film.year) parts.push(film.year);
    if (film.runtime) parts.push(film.runtime);
    if (film.language) parts.push(film.language);
    if (film.country) parts.push(film.country);
    if (film.premiere) parts.push(film.premiere);
    if (film.showtimes) parts.push(film.showtimes);
    return parts.filter(Boolean).join(' · ');
  }

  function buildAudiencePhrase(group) {
    const members = (group && group.members) || [];
    const text = members.map(member =>
      `${member.organization || ''} ${member.role || ''} ${member.display_name || ''}`.toLowerCase()
    ).join(' ');

    if (/(student|faculty|professor|teacher|university|college|school|department)/.test(text)) {
      return 'your students and colleagues';
    }
    if (/(press|journal|media|news|tribune)/.test(text)) {
      return 'your readers and audience';
    }
    return 'your community';
  }

  function buildRecipientName(member) {
    const firstName = String(member?.first_name || '').trim();
    if (firstName && member?.target_type !== 'org') {
      return firstName;
    }
    const displayName = member?.display_name || member?.organization || member?.role || member?.target_name || member?.target_id || 'there';
    if (member?.target_type === 'org') {
      const cleanName = String(displayName).trim();
      if (/\bteam$/i.test(cleanName)) return cleanName;
      return cleanName ? `${cleanName} team` : 'there';
    }
    return displayName;
  }

  function buildRecipientFirstName(member) {
    const firstName = String(member?.first_name || '').trim();
    if (firstName && member?.target_type !== 'org') {
      return firstName;
    }
    return buildRecipientName(member);
  }

  function buildTemplateContext(group, recipientOverride = null) {
    const film = window.OW_FILM || {};
    const members = (group && group.members) || [];
    const primary = recipientOverride || members[0] || {};
    return {
      film_title: film.title || film.film_title || '',
      film_logline: film.logline || film.short_description || film.description || '',
      film_synopsis: film.synopsis || film.description || film.short_description || '',
      film_screening_info: buildFilmScreeningInfo(film),
      film_link: film.public_url || film.website || film.source_website || '',
      trailer_link: film.trailer_url || film.trailer || '',
      recipient_first_name: buildRecipientFirstName(primary),
      recipient_name: buildRecipientName(primary),
      recipient_org: primary.organization || primary.display_name || '',
      recipient_role: primary.role || '',
      recipient_email: primary.email || '',
      recipient_group_phrase: buildAudiencePhrase(group)
    };
  }

  function renderEmailTemplate(text, context) {
    return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => {
      const value = context[key];
      return value == null || value === '' ? '' : String(value);
    });
  }

  function getCanvaExportOptions() {
    return Array.isArray(window.OW_CANVA_EXPORTS) ? window.OW_CANVA_EXPORTS : [];
  }

  function getEmailModeStorageKey() {
    return `ow:email-mode:${String(window.OW_PROJECT_ID || 'default')}`;
  }

  function getStoredEmailMode() {
    try {
      const value = window.localStorage.getItem(getEmailModeStorageKey());
      return value === 'plain' || value === 'canva' ? value : '';
    } catch {
      return '';
    }
  }

  function persistEmailMode(mode) {
    try {
      if (mode === 'plain' || mode === 'canva') {
        window.localStorage.setItem(getEmailModeStorageKey(), mode);
      } else {
        window.localStorage.removeItem(getEmailModeStorageKey());
      }
    } catch {}
  }

  function inferInitialEmailMode() {
    const stored = getStoredEmailMode();
    if (stored) return stored;

    const canvaExportId = String(document.getElementById('ow-outreach-canva-export')?.value || '').trim();
    if (canvaExportId) return 'canva';

    const firstDraft = (document.getElementById('first-draft-ta')?.value || window.OW_FIRST_DRAFT || '').trim();
    if (firstDraft) return 'plain';

    return '';
  }

  function getSelectedEmailMode() {
    return document.body?.dataset.owEmailMode || '';
  }

  function isCanvaFlow() {
    return getSelectedEmailMode() === 'canva';
  }

  function syncWorkflowModeUI() {
    const canvaFlow = isCanvaFlow();
    const customTab = document.querySelector('.ow-stage-tab[data-target-step="custom"]');
    const customStep = document.getElementById('ow-step-custom');
    if (customTab) customTab.hidden = canvaFlow;
    if (customStep) customStep.hidden = canvaFlow;

    const stageNumCustom = document.getElementById('ow-stage-num-custom');
    const stageNumOutreach = document.getElementById('ow-stage-num-outreach');
    const stepNumCustom = document.getElementById('ow-step-num-custom');
    const stepNumOutreach = document.getElementById('ow-step-num-outreach');
    const stepLabelCustom = document.getElementById('ow-step-label-custom');
    const stepLabelOutreach = document.getElementById('ow-step-label-outreach');

    if (stageNumCustom) stageNumCustom.textContent = '3';
    if (stepNumCustom) stepNumCustom.textContent = '3';
    if (stepLabelCustom) stepLabelCustom.textContent = 'Step 3';
    if (stageNumOutreach) stageNumOutreach.textContent = canvaFlow ? '3' : '4';
    if (stepNumOutreach) stepNumOutreach.textContent = canvaFlow ? '3' : '4';
    if (stepLabelOutreach) stepLabelOutreach.textContent = canvaFlow ? 'Step 3' : 'Step 4';
  }

  function applyEmailMode(mode) {
    const normalizedMode = mode === 'plain' || mode === 'canva' ? mode : '';
    if (document.body) {
      if (normalizedMode) {
        document.body.dataset.owEmailMode = normalizedMode;
      } else {
        delete document.body.dataset.owEmailMode;
      }
    }

    const picker = document.getElementById('ow-email-mode-picker');
    const switcher = document.getElementById('ow-email-mode-switcher');
    if (picker) picker.hidden = !!normalizedMode;
    if (switcher) switcher.hidden = !normalizedMode;

    document.querySelectorAll('[data-email-mode-panel]').forEach(panel => {
      panel.hidden = panel.dataset.emailModePanel !== normalizedMode;
    });

    document.querySelectorAll('[data-email-mode-choice]').forEach(button => {
      button.classList.toggle('is-active', !!normalizedMode && button.dataset.emailModeChoice === normalizedMode);
    });

    persistEmailMode(normalizedMode);
    syncWorkflowModeUI();
    updateWorkflowState();
  }

  function populateCanvaExportSelect(selectedId = '') {
    const select = document.getElementById('ow-outreach-canva-export');
    if (!select) return;
    const options = getCanvaExportOptions();
    const normalizedSelected = String(selectedId || '');
    const baseOption = '<option value="">Choose a saved Canva export</option>';
    const exportOptions = options.map(item => {
      const value = String(item.id || '');
      const filename = item.source_filename || item.html_filename || `Export ${value}`;
      const assetCount = Number(item.asset_count || 0);
      const selected = value === normalizedSelected ? ' selected' : '';
      return `<option value="${escHtml(value)}"${selected}>${escHtml(filename)}${assetCount ? ` (${assetCount} assets)` : ''}</option>`;
    }).join('');
    select.innerHTML = baseOption + exportOptions;
    select.value = normalizedSelected;
  }

  function buildFinalEmail(sharedTemplate, groupDraft, personalDraft, context) {
    const renderedGroup = renderEmailTemplate(groupDraft || '', context).trim();
    const renderedPersonal = renderEmailTemplate(personalDraft || '', context).trim();
    const sharedHasGroupSlot = /\{\{\s*group_message\s*\}\}/i.test(sharedTemplate || '');
    const sharedHasPersonalSlot = /\{\{\s*personal_message\s*\}\}/i.test(sharedTemplate || '');

    const layeredContext = {
      ...context,
      group_message: renderedGroup,
      personal_message: renderedPersonal
    };

    const renderedShared = renderEmailTemplate(sharedTemplate || '', layeredContext).trim();
    const fallbackParts = [renderedShared];

    if (!sharedHasGroupSlot && renderedGroup) {
      fallbackParts.push(renderedGroup);
    }
    if (!sharedHasPersonalSlot && renderedPersonal) {
      fallbackParts.push(renderedPersonal);
    }

    return fallbackParts.filter(Boolean).join('\n\n').trim();
  }

  function plainTextToHtml(text) {
    return escHtml(text || '').replace(/\n/g, '<br>');
  }

  function htmlToPlainText(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return (div.innerText || div.textContent || '').trim();
  }

  function getSelectedMember(group) {
    const selectedMemberId = document.getElementById('ow-group-detail')?.dataset.memberId;
    return (group?.members || []).find(member => String(member.id) === String(selectedMemberId)) || group?.members?.[0] || null;
  }

  function getRenderedFinalEmailText(group, member) {
    if (!group || !member) return '';
    if ((member.final_email_override || '').trim()) {
      return htmlToPlainText(member.final_email_override);
    }
    const firstDraft = document.getElementById('first-draft-ta')?.value || window.OW_FIRST_DRAFT || '';
    const secondDraft = document.getElementById('second-draft-ta')?.value || group.second_draft || '';
    const personalDraft = document.getElementById('personal-draft-ta')?.value || member.personal_draft || '';
    const context = buildTemplateContext(group, member);
    return buildFinalEmail(firstDraft, secondDraft, personalDraft, context);
  }

  function getRenderedFinalEmailHtml(group, member) {
    if (!group || !member) return '';
    if ((member.final_email_override || '').trim()) {
      return member.final_email_override.trim();
    }
    return plainTextToHtml(getRenderedFinalEmailText(group, member));
  }

  function setPreviewEditMode(isEditing) {
    const previewEl = document.getElementById('gd-email-preview');
    const editorEl = document.getElementById('gd-email-preview-editor-wrap');
    const editBtn = document.getElementById('gd-email-preview-edit-btn');
    const cancelBtn = document.getElementById('gd-email-preview-cancel-btn');
    const saveBtn = document.getElementById('gd-email-preview-save-btn');
    const resetBtn = document.getElementById('gd-email-preview-reset-btn');
    if (previewEl) previewEl.hidden = !!isEditing;
    if (editorEl) editorEl.hidden = !isEditing;
    if (editBtn) editBtn.textContent = isEditing ? 'Editing…' : 'Edit Final Email';
    if (editBtn) editBtn.hidden = !!isEditing;
    if (cancelBtn) cancelBtn.hidden = !isEditing;
    if (saveBtn) saveBtn.hidden = !isEditing;
    if (resetBtn) resetBtn.hidden = !!isEditing || resetBtn.style.display === 'none';
  }

  function syncPreviewMeta(member) {
    const modeBadge = document.getElementById('gd-email-preview-mode');
    const resetBtn = document.getElementById('gd-email-preview-reset-btn');
    const isEditing = !document.getElementById('gd-email-preview-editor-wrap')?.hidden;
    const hasOverride = !!((member && member.final_email_override) || '').trim();
    if (modeBadge) modeBadge.textContent = hasOverride ? 'Manual override' : 'Auto-generated';
    if (resetBtn) {
      resetBtn.style.display = hasOverride ? '' : 'none';
      resetBtn.hidden = isEditing || !hasOverride;
    }
  }

  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const current = textarea.value || '';
    textarea.value = current.slice(0, start) + text + current.slice(end);
    const next = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(next, next);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function refreshRenderedPreview(groupId) {
    const previewEl = document.getElementById('gd-email-preview');
    if (!previewEl) return;
    const group = findGroup(groupId);
    if (!group) {
      previewEl.textContent = 'Create or select a group to see the rendered email preview.';
      syncPreviewMeta(null);
      return;
    }

    const selectedMember = getSelectedMember(group);
    const rendered = selectedMember ? getRenderedFinalEmailHtml(group, selectedMember) : '';

    previewEl.innerHTML = rendered || 'No rendered email preview yet.';
    syncPreviewMeta(selectedMember);
  }

  function openMemberDetail(groupId, memberId) {
    const group = findGroup(groupId);
    if (!group) return;
    const member = (group.members || []).find(item => String(item.id) === String(memberId));
    if (!member) return;

    const detail = document.getElementById('ow-group-detail');
    if (detail) detail.dataset.memberId = memberId;

    document.querySelectorAll('.ow-person-pill').forEach(pill => {
      pill.classList.toggle('is-active', pill.dataset.memberId === String(memberId));
    });

    const ta = document.getElementById('personal-draft-ta');
    if (ta) ta.value = member.personal_draft || '';
    setPreviewEditMode(false);
    setStatus(document.getElementById('gd-email-preview-status'), '', '');
    refreshRenderedPreview(groupId);
  }

  function setActiveStep(step) {
    if (step === 'custom' && isCanvaFlow()) {
      step = 'outreach';
    }
    document.querySelectorAll('.ow-step').forEach(panel => {
      panel.classList.toggle('is-active', panel.dataset.step === step);
    });
    document.querySelectorAll('.ow-stage-tab').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset.targetStep === step);
    });
  }

  function hasSharedEmailSource() {
    const emailMode = getSelectedEmailMode();
    const firstDraft = (document.getElementById('first-draft-ta')?.value || '').trim();
    const canvaExportId = String(document.getElementById('ow-outreach-canva-export')?.value || '').trim();
    if (emailMode === 'plain') return !!firstDraft;
    if (emailMode === 'canva') return !!canvaExportId;
    return !!firstDraft || !!canvaExportId;
  }

  function updateWorkflowState(options = {}) {
    const groupsStep = document.getElementById('ow-step-groups');
    const customStep = document.getElementById('ow-step-custom');
    const outreachStep = document.getElementById('ow-step-outreach');
    const groupsTab = document.querySelector('.ow-stage-tab[data-target-step="groups"]');
    const customTab = document.querySelector('.ow-stage-tab[data-target-step="custom"]');
    const outreachTab = document.querySelector('.ow-stage-tab[data-target-step="outreach"]');
    const hasSharedSource = hasSharedEmailSource();
    const canvaFlow = isCanvaFlow();
    const groupCount = Array.isArray(window.OW_GROUPS) ? window.OW_GROUPS.length : document.querySelectorAll('[data-group-cards] .ow-card:not(.ow-card--empty)').length;
    const activeStep = document.querySelector('.ow-step.is-active')?.dataset.step || 'shared';

    if (groupsStep) {
      groupsStep.classList.toggle('ow-step--locked', !hasSharedSource);
      if (groupsTab) {
        groupsTab.disabled = !hasSharedSource;
        groupsTab.classList.toggle('is-disabled', !hasSharedSource);
      }
    }

    if (customStep) {
      customStep.classList.toggle('ow-step--locked', groupCount === 0);
      if (customTab) {
        customTab.disabled = canvaFlow || groupCount === 0;
        customTab.classList.toggle('is-disabled', canvaFlow || groupCount === 0);
      }
    }

    if (outreachStep) {
      outreachStep.classList.toggle('ow-step--locked', groupCount === 0);
      if (outreachTab) {
        outreachTab.disabled = groupCount === 0;
        outreachTab.classList.toggle('is-disabled', groupCount === 0);
      }
    }

    if ((activeStep === 'groups' && !hasSharedSource) || ((activeStep === 'custom' || activeStep === 'outreach') && groupCount === 0)) {
      setActiveStep('shared');
      return;
    }

    if (activeStep === 'custom' && canvaFlow) {
      setActiveStep('outreach');
      return;
    }

    if (options.activate === 'groups' && hasSharedSource) {
      setActiveStep('groups');
    } else if (options.activate === 'custom' && groupCount > 0) {
      setActiveStep(canvaFlow ? 'outreach' : 'custom');
    } else if (options.activate === 'outreach' && groupCount > 0) {
      setActiveStep('outreach');
    }
  }

  /* ── Film select page ─────────────────────────────────────── */
  function initFilmSelect() {
    const grid    = document.getElementById('ow-film-grid');
    if (!grid) return;
    const cta     = document.getElementById('ow-film-cta');
    const ctaName = document.getElementById('ow-film-cta-name');
    const ctaBtn  = document.getElementById('ow-film-cta-btn');
    const hidFilmId    = document.getElementById('hid-film-id');
    const hidFilmTitle = document.getElementById('hid-film-title');

    let selected = null;

    grid.addEventListener('click', e => {
      const card = e.target.closest('.ow-film-card');
      if (!card) return;
      if (selected) selected.classList.remove('selected');
      card.classList.add('selected');
      selected = card;
      const id    = card.dataset.id;
      const title = card.dataset.title;
      ctaName.textContent = `"${title}" 선택됨`;
      hidFilmId.value    = id;
      hidFilmTitle.value = title;
      cta.classList.add('visible');
    });

    if (ctaBtn) {
      ctaBtn.addEventListener('click', () => {
        if (!hidFilmId.value) return;
        document.getElementById('ow-film-form').submit();
      });
    }
  }

  /* ── First Draft auto-save ────────────────────────────────── */
  function initFirstDraft() {
    const ta     = document.getElementById('first-draft-ta');
    const status = document.getElementById('first-draft-status');
    const canvaSelect = document.getElementById('ow-outreach-canva-export');
    const modeButtons = document.querySelectorAll('[data-email-mode-choice]');
    const projectId = ta?.dataset.projectId || String(window.OW_PROJECT_ID || '');

    if (modeButtons.length) {
      modeButtons.forEach(button => {
        button.addEventListener('click', () => {
          applyEmailMode(button.dataset.emailModeChoice || '');
        });
      });
    }

    applyEmailMode(inferInitialEmailMode());

    if (!ta) {
      if (canvaSelect) {
        canvaSelect.addEventListener('change', () => {
          updateWorkflowState({ activate: hasSharedEmailSource() ? 'groups' : undefined });
        });
      }
      return;
    }

    const save = debounce(async () => {
      setStatus(status, 'saving', 'Saving…');
      try {
        await apiFetch(`/outreach/project/${projectId}/first-draft`, {
          method: 'POST',
          body: JSON.stringify({ text: ta.value })
        });
        setStatus(status, 'saved', 'Saved ✓');
      } catch {
        setStatus(status, '', 'Save failed');
      }
    }, 1000);

    ta.addEventListener('input', save);
    ta.addEventListener('input', () => {
      window.OW_FIRST_DRAFT = ta.value;
      updateWorkflowState();
      const activeGroupId = document.getElementById('ow-group-detail')?.dataset.groupId;
      if (activeGroupId) refreshRenderedPreview(activeGroupId);
    });

    const fillBtn = document.getElementById('ow-fill-suggested-template');
    if (fillBtn) {
      fillBtn.addEventListener('click', () => {
        if (ta.value.trim() && !confirm('Replace the current shared template with the suggested structure?')) return;
        applyEmailMode('plain');
        ta.value = SUGGESTED_SHARED_TEMPLATE;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        updateWorkflowState({ activate: 'groups' });
      });
    }

    if (canvaSelect) {
      canvaSelect.addEventListener('change', () => {
        if (canvaSelect.value) {
          applyEmailMode('canva');
          updateWorkflowState({ activate: 'groups' });
          return;
        }
        updateWorkflowState();
      });
    }
  }

  /* ── Target selection ──────────────────────────────────────── */
  function initTargetSelect() {
    const panel = document.getElementById('ow-target-panel');
    if (!panel) return;

    const searchInput  = panel.querySelector('#target-search');
    const typeTabs     = panel.querySelectorAll('.ow-type-tab');
    const listEl       = panel.querySelector('#target-list');
    const countEl      = panel.querySelector('#target-sel-count');
    const createBtn    = document.getElementById('create-group-btn');

    const projectId  = panel.dataset.projectId;
    const filmType   = panel.dataset.filmType;
    // Set of used {type:id} from server
    const usedSet    = new Set(
      (window.OW_USED_TARGETS || []).map(([t, id]) => `${t}:${id}`)
    );

    let allTargets   = [];
    let selected     = new Map(); // key = `type:id` → target obj
    let currentType  = 'all';
    let loading      = false;

    async function loadTargets(q = '') {
      if (loading) return;
      loading = true;
      listEl.innerHTML = '<div class="ow-skeleton" style="height:36px;margin-bottom:6px"></div>'.repeat(4);
      try {
        allTargets = await apiFetch(`/outreach/api/targets?q=${encodeURIComponent(q)}&type=${currentType}&film_type=${filmType}`);
      } catch { allTargets = []; }
      loading = false;
      renderList();
    }

    function renderList() {
      listEl.innerHTML = '';
      if (!allTargets.length) {
        listEl.innerHTML = '<p style="color:var(--ow-muted);font-size:12px;padding:10px">No results</p>';
        return;
      }
      const orderedTargets = [...allTargets].sort((a, b) => {
        const aKey = `${a.type}:${a.id}`;
        const bKey = `${b.type}:${b.id}`;
        const aSelected = selected.has(aKey) ? 1 : 0;
        const bSelected = selected.has(bKey) ? 1 : 0;
        if (aSelected !== bSelected) return aSelected - bSelected;
        const aUsed = usedSet.has(aKey) ? 1 : 0;
        const bUsed = usedSet.has(bKey) ? 1 : 0;
        if (aUsed !== bUsed) return aUsed - bUsed;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      orderedTargets.forEach(t => {
        const key     = `${t.type}:${t.id}`;
        const isUsed  = usedSet.has(key);
        const isSel   = selected.has(key);
        const initials = (t.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

        const typeLabel = t.type === 'crm_group'
          ? '· Saved Group'
          : (t.type === 'org' ? '· Org' : '· Person');
        const metaText = [t.subtype || t.category || '', typeLabel].filter(Boolean).join(' ');
        const el = document.createElement('div');
        el.className = `ow-target-item${t.type === 'crm_group' ? ' ow-target-item--crm-group' : ''}${isSel ? ' selected' : ''}${isUsed ? ' disabled' : ''}`;
        el.dataset.key = key;
        el.innerHTML = `
          <div class="ow-target-check"></div>
          <div class="ow-target-avatar ow-target-avatar--${t.type}">${initials}</div>
          <div class="ow-target-info">
            ${t.type === 'crm_group' ? '<div class="ow-target-badge ow-target-badge--crm-group">Saved Group</div>' : ''}
            <div class="ow-target-name">${escHtml(t.name)}</div>
            <div class="ow-target-sub">${escHtml(metaText)}</div>
          </div>
          ${t.score ? `<div class="ow-target-score">${t.score}</div>` : ''}
        `;

        if (!isUsed) {
          el.addEventListener('click', () => toggleSelect(key, t, el));
        }
        listEl.appendChild(el);
      });
    }

    function toggleSelect(key, t, el) {
      if (selected.has(key)) {
        selected.delete(key);
        el.classList.remove('selected');
      } else {
        selected.set(key, t);
        el.classList.add('selected');
      }
      updateCount();
      renderList();
    }

    function updateCount() {
      countEl.innerHTML = `<strong>${selected.size}</strong> selected`;
      createBtn.disabled = selected.size === 0;
    }

    // Tabs
    typeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        typeTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentType = tab.dataset.type;
        loadTargets(searchInput.value.trim());
      });
    });

    // Search
    const debouncedSearch = debounce(q => loadTargets(q), 400);
    searchInput.addEventListener('input', e => debouncedSearch(e.target.value.trim()));

    // Create group button
    createBtn.addEventListener('click', async () => {
      if (!selected.size) return;
      createBtn.disabled = true;
      createBtn.textContent = 'Creating…';
      const targets = [...selected.values()].map(t => ({ type: t.type, id: t.id, name: t.name }));
      try {
        const group = await apiFetch('/outreach/group/create', {
          method: 'POST',
          body: JSON.stringify({ project_id: projectId, targets })
        });
        // Add to used set so targets become disabled
        targets.forEach(t => usedSet.add(`${t.type}:${t.id}`));
        selected.clear();
        updateCount();
        renderList();
        appendGroupCard(group);
        createBtn.textContent = 'Create Group';
        updateWorkflowState({ activate: 'custom' });
      } catch (err) {
        alert('Failed to create group: ' + err.message);
        createBtn.disabled = false;
        createBtn.textContent = 'Create Group';
      }
    });

    // Initial load
    loadTargets();
    updateCount();
  }

  /* ── Recommendations ─────────────────────────────────────── */
  async function initRecommendations() {
    const itemsEl = document.getElementById('ow-reco-items');
    const tagsEl = document.getElementById('ow-reco-film-tags');
    if (!itemsEl || !tagsEl || !window.OW_PROJECT_ID) return;

    itemsEl.innerHTML = '<div class="ow-reco-preview__item ow-reco-preview__item--muted">Loading recommendations…</div>';

    try {
      const payload = await apiFetch(`/recommend?project_id=${encodeURIComponent(window.OW_PROJECT_ID)}&limit=8`);
      const filmTags = Array.isArray(payload.film_tags) ? payload.film_tags : [];
      const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];

      tagsEl.innerHTML = filmTags.length
        ? filmTags.map(tag => `<span class="ow-reco-tag">${escHtml(tag.tag_name)}</span>`).join('')
        : '<span class="ow-reco-tag ow-reco-tag--muted">No migrated film tags yet</span>';

      if (!recommendations.length) {
        itemsEl.innerHTML = `
          <div class="ow-reco-preview__item ow-reco-preview__item--muted">
            아직 태그 겹침이 없어 추천 결과가 없습니다. 먼저 \`python migrate_tags.py\` 로 영화 태그를 채워주세요.
          </div>
        `;
        return;
      }

      itemsEl.innerHTML = recommendations.map(item => `
        <div class="ow-reco-preview__item">
          <div class="ow-reco-preview__top">
            <div>
              <div class="ow-reco-preview__name">${escHtml(item.target_name || item.target_id)}</div>
              <div class="ow-reco-preview__meta">${escHtml(item.target_type === 'org' ? 'Organization' : 'Person')} · ${escHtml(item.organization || item.role || 'CRM target')}</div>
            </div>
            <div class="ow-reco-preview__score">${escHtml(String(item.match_score || 0))}</div>
          </div>
          <div class="ow-reco-preview__reason">Matched tags: ${escHtml((item.matched_tags || []).join(', ') || 'None')}</div>
          <div class="ow-reco-preview__actions">
            <button
              type="button"
              class="ow-btn ow-btn--ghost ow-btn--sm ow-reco-explain-btn"
              data-target-id="${escHtml(String(item.target_id))}"
              data-target-type="${escHtml(item.target_type)}"
            >
              Why recommended?
            </button>
          </div>
          <div class="ow-reco-preview__explain" data-explain-for="${escHtml(item.target_type)}:${escHtml(String(item.target_id))}"></div>
        </div>
      `).join('');

      itemsEl.querySelectorAll('.ow-reco-explain-btn').forEach(button => {
        button.addEventListener('click', async () => {
          const targetId = button.dataset.targetId;
          const targetType = button.dataset.targetType;
          const explainEl = itemsEl.querySelector(`[data-explain-for="${targetType}:${targetId}"]`);
          if (!explainEl) return;

          button.disabled = true;
          button.textContent = 'Explaining…';
          explainEl.textContent = '';

          try {
            const response = await apiFetch('/explain', {
              method: 'POST',
              body: JSON.stringify({
                project_id: window.OW_PROJECT_ID,
                target_id: targetId,
                target_type: targetType
              })
            });
            explainEl.textContent = response.message || 'No explanation available.';
          } catch (err) {
            explainEl.textContent = `Explanation failed: ${err.message}`;
          } finally {
            button.disabled = false;
            button.textContent = 'Why recommended?';
          }
        });
      });
    } catch (err) {
      tagsEl.innerHTML = '<span class="ow-reco-tag ow-reco-tag--muted">Unavailable</span>';
      itemsEl.innerHTML = `<div class="ow-reco-preview__item ow-reco-preview__item--muted">추천 결과를 불러오지 못했습니다: ${escHtml(err.message)}</div>`;
    }
  }

  function initRecommendationPanel() {
    const panel = document.getElementById('ow-reco-panel');
    const toggle = document.getElementById('ow-reco-toggle');
    if (!panel || !toggle) return;

    toggle.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  }

  /* ── Group cards (bottom section) ─────────────────────────── */
  function initGroupCards() {
    const containers = document.querySelectorAll('[data-group-cards]');
    if (!containers.length) return;
    containers.forEach(container => {
      container.addEventListener('click', async e => {
        const selectorCard = e.target.closest('.ow-outreach-switcher__card');
        if (selectorCard) {
          openOutreachPanel(selectorCard.dataset.groupId);
          return;
        }

        const delBtn = e.target.closest('.ow-card__del');
        const sendBtn = e.target.closest('.ow-card__send');
        if (delBtn) {
          e.stopPropagation();
          const card = delBtn.closest('.ow-card');
          if (!confirm('Delete this group? Targets will become selectable again.')) return;
          const groupId = card.dataset.groupId;
          try {
            await apiFetch(`/outreach/group/${groupId}/delete`, { method: 'POST' });
            document.querySelectorAll(`.ow-card[data-group-id="${groupId}"]`).forEach(node => node.remove());
            if (Array.isArray(window.OW_GROUPS)) {
              window.OW_GROUPS = window.OW_GROUPS.filter(item => String(item.id) !== String(groupId));
            }
            const panel = document.getElementById('ow-target-panel');
            if (panel) location.reload();
            updateCardCount();
            updateWorkflowState();
          } catch { alert('Could not delete group'); }
          return;
        }

        if (sendBtn) {
          e.stopPropagation();
          const card = sendBtn.closest('.ow-card');
          if (!card) return;
          const groupId = card.dataset.groupId;
          openOutreachPanel(groupId);
          return;
        }

        const card = e.target.closest('.ow-card:not(.ow-card--empty)');
        if (card) {
          const containerId = card.closest('[data-group-cards]')?.id || '';
          if (containerId === 'ow-outreach-cards') {
            openOutreachPanel(card.dataset.groupId);
          } else {
            openGroupDetail(card.dataset.groupId, card.dataset.groupName);
          }
        }
      });
    });
  }

  function appendGroupCard(group) {
    const containers = document.querySelectorAll('[data-group-cards]');
    if (!containers.length) return;
    containers.forEach(container => {
      const card = document.createElement('div');
      card.className = 'ow-card';
      card.dataset.groupId = group.group_id;
      card.dataset.groupName = group.name;
      card.innerHTML = buildCardHTML(group);
      container.insertBefore(card, container.querySelector('.ow-card--empty'));
    });
    if (Array.isArray(window.OW_GROUPS)) {
      window.OW_GROUPS.unshift({
        id: group.group_id,
        name: group.name,
        status: group.status || 'draft',
        created_at: new Date().toISOString(),
        subject: group.subject || '',
        cc_emails: group.cc_emails || '',
        second_draft: group.second_draft || '',
        last_sent_at: '',
        last_sent_by: '',
        send_note: '',
        send_result_status: '',
        members: group.members || [],
        attachments: group.attachments || [],
        send_log: null
      });
    }
    updateCardCount();
    updateWorkflowState();

    // Immediately open detail
    setTimeout(() => openGroupDetail(group.group_id, group.name), 100);
  }

  function buildCardHTML(group) {
    const members = group.members || [];
    const visible  = members.slice(0, 3);
    const extra    = members.length - visible.length;
    const draftedCount = getDraftedRecipientCount(group);
    const tags = visible.map(m =>
      `<span class="ow-card__member-tag ow-card__member-tag--${m.target_type}">${escHtml(m.target_name || m.target_id)}</span>`
    ).join('');
    return `
      <div class="ow-card__head">
        <span class="ow-card__name">${escHtml(group.name)}</span>
        <span class="ow-card__status ow-card__status--${group.status || 'draft'}">${group.status || 'draft'}</span>
      </div>
      <div class="ow-card__members">
        ${tags}
        ${extra > 0 ? `<span class="ow-card__member-more">+${extra} more</span>` : ''}
      </div>
      <div class="ow-card__progress">${draftedCount}/${members.length} draft created</div>
      <div class="ow-card__draft-preview">${escHtml(group.second_draft || 'No draft yet…')}</div>
      <div class="ow-card__footer">
        <button class="ow-card__send" type="button">Outreach</button>
        <button class="ow-card__del" title="Delete group">✕</button>
      </div>
    `;
  }

  function syncGroupDraftUI(groupId) {
    const group = findGroup(groupId);
    if (!group) return;
    const total = (group.members || []).length;
    const draftedCount = getDraftedRecipientCount(group);
    document.querySelectorAll(`.ow-card[data-group-id="${groupId}"]`).forEach(card => {
      const progress = card.querySelector('.ow-card__progress');
      if (progress) progress.textContent = `${draftedCount}/${total} draft created`;
    });
    document.querySelectorAll(`.ow-outreach-switcher__card[data-group-id="${groupId}"]`).forEach(card => {
      const meta = card.querySelector('.ow-outreach-switcher__meta');
      if (meta) meta.textContent = `${total} recipient${total === 1 ? '' : 's'} · ${draftedCount} drafted`;
    });
  }

  function updateCardCount() {
    const count = Array.isArray(window.OW_GROUPS) ? window.OW_GROUPS.length : document.querySelectorAll('[data-group-cards] .ow-card:not(.ow-card--empty)').length;
    document.querySelectorAll('#ow-card-count, #ow-card-count-step2, #ow-card-count-step4').forEach(el => {
      el.textContent = count;
    });
  }

  function formatAttachmentList(items) {
    if (!items || !items.length) {
      return '<div class="ow-modal__empty">No attachments</div>';
    }
    return items.map(item => `
      <a class="ow-modal__attachment" href="/static/${escHtml(item.filepath)}" target="_blank" rel="noopener noreferrer">
        <span class="ow-modal__attachment-icon">📎</span>
        <span>${escHtml(item.filename)}</span>
      </a>
    `).join('');
  }

  function buildCombinedPreview(firstDraft, secondDraft) {
    const parts = [firstDraft, secondDraft].map(value => (value || '').trim()).filter(Boolean);
    return parts.length ? parts.join('\n\n') : 'No outreach content yet.';
  }

  function buildGmailComposeUrl({ to, subject, body }) {
    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      tf: '1',
      to,
      su: subject,
      body
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
  }

  async function loadGmailStatus() {
    try {
      const status = await apiFetch('/gmail/status');
      window.OW_GMAIL_STATUS = status;
      return status;
    } catch {
      return { configured: false, connected: false, email: '' };
    }
  }

  function renderGmailStatus(status) {
    const statusEl = document.getElementById('ow-gmail-status');
    if (!statusEl) return;
    if (!status.configured) {
      statusEl.textContent = 'Gmail OAuth not configured. Add credentials.json first.';
      statusEl.className = 'ow-gmail-status is-error';
      return;
    }
    if (status.connected) {
      statusEl.textContent = status.email ? `Connected to Gmail as ${status.email}` : 'Gmail connected';
      statusEl.className = 'ow-gmail-status is-connected';
      return;
    }
    statusEl.textContent = 'Gmail not connected yet. Creating drafts will prompt Google sign-in.';
    statusEl.className = 'ow-gmail-status';
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function renderFact(label, value) {
    return `
      <div class="ow-modal__fact">
        <div class="ow-modal__fact-label">${escHtml(label)}</div>
        <div class="ow-modal__fact-value">${escHtml(value || '—')}</div>
      </div>
    `;
  }

  function syncOutreachPreviewMode() {
    const hasCanvaExport = !!String(document.getElementById('ow-outreach-canva-export')?.value || '').trim();
    document.querySelectorAll('[data-outreach-mode-panel]').forEach(block => {
      const mode = block.dataset.outreachModePanel || 'plain';
      block.hidden = hasCanvaExport ? mode !== 'canva' : mode !== 'plain';
    });
  }

  function buildIframePreviewHtml(html) {
    const raw = String(html || '').trim();
    if (!raw) {
      return '<div style="padding:24px;font-family:sans-serif;color:#444;">No HTML preview available.</div>';
    }
    const baseHref = `${window.location.origin}/`;
    if (/<base\s/i.test(raw)) return raw;
    if (/<head[^>]*>/i.test(raw)) {
      return raw.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
    }
    return `<head><base href="${baseHref}"></head>${raw}`;
  }

  async function refreshOutreachHtmlPreview(group, member) {
    const metaEl = document.getElementById('ow-outreach-html-preview-meta');
    const emptyEl = document.getElementById('ow-outreach-html-preview-empty');
    const frameEl = document.getElementById('ow-outreach-html-preview-frame');
    if (!metaEl || !emptyEl || !frameEl) return;
    syncOutreachPreviewMode();

    if (!group || !member) {
      metaEl.textContent = 'Choose a recipient to load the actual Gmail rendering preview.';
      emptyEl.hidden = false;
      emptyEl.textContent = 'Choose a recipient first to preview the final Gmail HTML.';
      frameEl.hidden = true;
      frameEl.srcdoc = '';
      return;
    }

    const canvaExportId = String(document.getElementById('ow-outreach-canva-export')?.value || '').trim();
    if (!canvaExportId) {
      metaEl.textContent = 'Canva HTML preview inactive';
      emptyEl.hidden = false;
      emptyEl.textContent = 'Canva HTML preview appears here only when a saved Canva export is selected for this group.';
      frameEl.hidden = true;
      frameEl.srcdoc = '';
      return;
    }

    metaEl.textContent = `Loading HTML preview for ${member.display_name || member.target_name || member.target_id || 'recipient'}…`;
    emptyEl.hidden = false;
    emptyEl.textContent = 'Loading preview…';
    frameEl.hidden = true;
    frameEl.srcdoc = '';

    try {
      const res = await apiFetch(`/outreach/group/${group.id}/preview`, {
        method: 'POST',
        body: JSON.stringify({
          member_id: String(member.id),
          canva_export_id: canvaExportId
        })
      });
      const recipientName = res.recipient_name || member.display_name || member.target_name || member.target_id || 'recipient';
      metaEl.textContent = res.used_canva_html
        ? `Actual Gmail HTML preview for ${recipientName}`
        : `Plain-text rendering preview for ${recipientName}`;
      frameEl.srcdoc = buildIframePreviewHtml(res.html_body);
      frameEl.hidden = false;
      emptyEl.hidden = true;
    } catch (err) {
      metaEl.textContent = 'Could not load HTML preview';
      emptyEl.hidden = false;
      emptyEl.textContent = err.message || 'Preview failed to load.';
      frameEl.hidden = true;
      frameEl.srcdoc = '';
    }
  }

  function updateModalPreviewForMember(group, member) {
    const firstDraft = document.getElementById('first-draft-ta')?.value || window.OW_FIRST_DRAFT || '';
    const context = buildTemplateContext(group, member || undefined);
    const firstDraftEl = document.getElementById('ow-outreach-first-draft');
    const secondDraftEl = document.getElementById('ow-outreach-second-draft');
    const combined = document.getElementById('ow-outreach-combined');

    if (firstDraftEl) {
      firstDraftEl.textContent = renderEmailTemplate(firstDraft || 'No shared promo written yet.', context);
    }

    if (secondDraftEl) {
      secondDraftEl.textContent = renderEmailTemplate(group?.second_draft || 'No group draft written yet.', context);
    }

    if (combined) {
      combined.innerHTML = member ? getRenderedFinalEmailHtml(group, member) : 'No outreach content yet.';
    }

    const testMemberSelect = document.getElementById('ow-outreach-test-member');
    if (testMemberSelect && member) {
      testMemberSelect.value = String(member.id);
    }

    document.querySelectorAll('.ow-recipient-table__row').forEach(row => {
      row.classList.toggle('is-active', row.dataset.memberId === String(member?.id || ''));
    });

    refreshOutreachHtmlPreview(group, member);
  }

  function getPreferredModalMember(group) {
    const detail = document.getElementById('ow-group-detail');
    const detailGroupId = detail?.dataset.groupId;
    const detailMemberId = detail?.dataset.memberId;
    if (String(detailGroupId || '') === String(group?.id || '')) {
      const selected = (group?.members || []).find(member => String(member.id) === String(detailMemberId || ''));
      if (selected) return selected;
    }
    return (group?.members || [])[0] || null;
  }

  function openOutreachPanel(groupId, options = {}) {
    const panel = document.getElementById('ow-outreach-panel');
    if (!panel) return;
    const group = findGroup(groupId);
    if (!group) return;
    const shouldActivate = options.activate !== false;
    if (shouldActivate) setActiveStep('outreach');

    const recipients = group.members || [];
    const draftedCount = getDraftedRecipientCount(group);
    const preferredMember = getPreferredModalMember(group);
    resetOutreachSelection(group);
    const recipientsHtml = recipients.length
      ? `
        <div class="ow-recipient-table-scroll">
          <table class="ow-recipient-table">
            <thead>
              <tr>
                <th class="ow-recipient-table__check-col">
                  <input type="checkbox" id="ow-outreach-select-all" aria-label="Select all not-yet-drafted recipients">
                </th>
                <th>Name</th>
                <th>Organization / Role</th>
                <th>Email</th>
                <th>Type</th>
                <th>
                  <div class="ow-recipient-table__header-status">
                    <span>Draft Status</span>
                    <button type="button" class="ow-recipient-table__reset-all" id="ow-outreach-reset-drafted-btn" ${draftedCount ? '' : 'disabled'} title="Reset all drafted recipients">🔄</button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              ${recipients.map(member => `
                <tr class="ow-recipient-table__row${String(member.id) === String(preferredMember?.id || '') ? ' is-active' : ''} ${member.draft_created ? 'is-drafted' : ''}" data-member-id="${escHtml(String(member.id))}">
                  <td class="ow-recipient-table__check-col">
                    <input class="ow-recipient-table__checkbox" type="checkbox" data-member-id="${escHtml(String(member.id))}" ${canCreateDraftForMember(member) ? '' : 'disabled'} aria-label="Select recipient ${escHtml(member.display_name || member.target_name || member.target_id)}">
                  </td>
                  <td>
                    <div class="ow-recipient-table__name">
                      <span class="ow-card__member-tag ow-card__member-tag--${member.target_type} ${member.draft_created ? 'ow-card__member-tag--drafted' : ''}">${escHtml(member.display_name || member.target_name || member.target_id)}</span>
                      <div class="ow-recipient-table__name-text">
                        <div class="ow-recipient-table__main">${escHtml(member.display_name || member.target_name || member.target_id)}</div>
                        <div class="ow-recipient-table__sub">${escHtml(member.target_id || '')}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="ow-recipient-table__main">${escHtml(member.organization || '—')}</div>
                    <div class="ow-recipient-table__sub">${escHtml(member.role || '—')}</div>
                  </td>
                  <td class="ow-recipient-table__email">${escHtml(member.email || '—')}</td>
                  <td class="ow-recipient-table__type">${member.target_type === 'org' ? 'Organization' : 'Person'}</td>
                  <td>
                    ${member.draft_created
                      ? `<button type="button" class="ow-recipient-table__status ow-recipient-table__status-btn ${getDraftStatusClass(member)}" data-reset-drafted-member-id="${escHtml(String(member.id))}" title="Reset this drafted recipient">${escHtml(getDraftStatusLabel(member))}</button>`
                      : `<div class="ow-recipient-table__status ${getDraftStatusClass(member)}">${escHtml(getDraftStatusLabel(member))}</div>`}
                    <div class="ow-recipient-table__sub">${member.last_draft_created_at ? escHtml(formatDateTime(member.last_draft_created_at)) : '—'}</div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="ow-modal__empty">No recipients in this group.</div>';

    const factsHtml = [
      renderFact('Group Name', group.name),
      renderFact('Status', group.status || 'draft'),
      renderFact('Created', formatDateTime(group.created_at)),
      renderFact('Recipients', String(recipients.length)),
      renderFact('Drafted Recipients', `${draftedCount}/${recipients.length}`)
    ].join('');

    const historyHtml = [
      renderFact('Last Sent', formatDateTime(group.last_sent_at)),
      renderFact('Sent By', group.last_sent_by || '—'),
      renderFact('CC', group.cc_emails || '—'),
      renderFact('Result', group.send_result_status || '—'),
      renderFact('Memo', group.send_note || '—')
    ].join('');

    document.getElementById('ow-outreach-meta').innerHTML = `
      <span class="ow-proj-chip">${recipients.length} recipients</span>
      <span class="ow-proj-chip">${draftedCount} drafted</span>
      <span class="ow-topbar__badge ow-topbar__badge--${escHtml(group.status || 'draft')}">${escHtml(group.status || 'draft')}</span>
    `;
    document.getElementById('ow-outreach-facts').innerHTML = factsHtml;
    document.getElementById('ow-outreach-history').innerHTML = historyHtml;
    document.getElementById('ow-outreach-recipients').innerHTML = recipientsHtml;
    document.getElementById('ow-outreach-subject').value = group.subject || '';
    document.getElementById('ow-outreach-cc').value = group.cc_emails || '';
    populateCanvaExportSelect(group.canva_export_id || '');
    document.getElementById('ow-outreach-project-attachments').innerHTML = formatAttachmentList(window.OW_PROJECT_ATTACHMENTS || []);
    document.getElementById('ow-outreach-group-attachments').innerHTML = formatAttachmentList(group.attachments || []);
    document.getElementById('ow-outreach-note').value = group.send_note || '';
    document.getElementById('ow-outreach-result-status').value = group.send_result_status || '';
    const emptyEl = document.getElementById('ow-outreach-empty');
    const contentEl = document.getElementById('ow-outreach-content');
    if (emptyEl) emptyEl.style.display = 'none';
    if (contentEl) contentEl.style.display = '';
    document.querySelectorAll('.ow-outreach-switcher__card').forEach(card => {
      card.classList.toggle('active', card.dataset.groupId === String(groupId));
    });
    document.querySelectorAll('.ow-recipient-table__row').forEach(row => {
      row.addEventListener('click', () => {
        const member = recipients.find(item => String(item.id) === String(row.dataset.memberId || ''));
        updateModalPreviewForMember(group, member || null);
      });
    });
    document.querySelectorAll('.ow-recipient-table__checkbox').forEach(input => {
      input.addEventListener('click', evt => evt.stopPropagation());
      input.addEventListener('change', () => {
        const memberId = String(input.dataset.memberId || '');
        if (input.checked) {
          outreachSelection.add(memberId);
        } else {
          outreachSelection.delete(memberId);
        }
        syncRecipientCheckboxes(group);
      });
    });
    const selectAll = document.getElementById('ow-outreach-select-all');
    if (selectAll) {
      selectAll.addEventListener('click', evt => evt.stopPropagation());
      selectAll.addEventListener('change', () => {
        getSelectableRecipients(group).forEach(member => {
          const memberId = String(member.id);
          if (selectAll.checked) {
            outreachSelection.add(memberId);
          } else {
            outreachSelection.delete(memberId);
          }
        });
        document.querySelectorAll('.ow-recipient-table__checkbox:not(:disabled)').forEach(input => {
          input.checked = selectAll.checked;
        });
        syncRecipientCheckboxes(group);
      });
    }
    const testMemberSelect = document.getElementById('ow-outreach-test-member');
    if (testMemberSelect) {
      testMemberSelect.innerHTML = recipients.length
        ? recipients.map(member => {
            const selected = String(member.id) === String(preferredMember?.id || '');
            const label = member.email
              ? `${member.display_name || member.target_name || member.target_id} (${member.email})`
              : `${member.display_name || member.target_name || member.target_id}`;
            return `<option value="${escHtml(String(member.id))}"${selected ? ' selected' : ''}>${escHtml(label)}</option>`;
          }).join('')
        : '<option value="">No recipients available</option>';
      testMemberSelect.disabled = !recipients.length;
    }
    document.querySelectorAll('.ow-outreach-quick-select').forEach(button => {
      button.onclick = () => {
        const count = Number(button.dataset.count || 0);
        selectFirstRecipients(group, count);
      };
    });
    const clearSelectionBtn = document.getElementById('ow-outreach-clear-selection-btn');
    if (clearSelectionBtn) {
      clearSelectionBtn.onclick = () => {
        outreachSelection.clear();
        syncRecipientCheckboxes(group);
      };
    }
    const resetAllDraftedBtn = document.getElementById('ow-outreach-reset-drafted-btn');
    if (resetAllDraftedBtn) {
      resetAllDraftedBtn.onclick = async evt => {
        evt.stopPropagation();
        const draftedMembers = (group.members || []).filter(member => member.draft_created);
        if (!draftedMembers.length) return;
        if (!confirm(`Reset drafted status for ${draftedMembers.length} recipient(s)?`)) return;
        try {
          const res = await resetDraftedRecipients(groupId);
          alert(`${res.reset_count || 0} recipient(s) reset to Not drafted.`);
        } catch (err) {
          let payload = null;
          try { payload = JSON.parse(err.message); } catch {}
          if (payload?.message) {
            alert(payload.message);
            return;
          }
          alert('Could not reset drafted recipients: ' + err.message);
        }
      };
    }
    document.querySelectorAll('[data-reset-drafted-member-id]').forEach(button => {
      button.addEventListener('click', async evt => {
        evt.stopPropagation();
        const memberId = String(button.dataset.resetDraftedMemberId || '');
        const member = (group.members || []).find(item => String(item.id) === memberId);
        if (!member?.draft_created) return;
        if (!confirm(`Reset drafted status for ${member.display_name || member.target_name || member.target_id}?`)) return;
        try {
          const res = await resetDraftedRecipients(groupId, [memberId]);
          if (!Number(res.reset_count || 0)) {
            alert('This recipient is already not drafted.');
            return;
          }
          alert(`${member.display_name || member.target_name || member.target_id} reset to Not drafted.`);
        } catch (err) {
          let payload = null;
          try { payload = JSON.parse(err.message); } catch {}
          if (payload?.message) {
            alert(payload.message);
            return;
          }
          alert('Could not reset drafted recipient: ' + err.message);
        }
      });
    });
    document.getElementById('ow-outreach-test-email').value = '';
    panel.dataset.groupId = groupId;
    setDraftProgress('');
    syncRecipientCheckboxes(group);
    updateModalPreviewForMember(group, preferredMember || null);
    loadGmailStatus().then(renderGmailStatus);
  }

  function initOutreachPanel() {
    const panel = document.getElementById('ow-outreach-panel');
    if (!panel) return;
    populateCanvaExportSelect('');
    const testMemberSelect = document.getElementById('ow-outreach-test-member');
    if (testMemberSelect) {
      testMemberSelect.addEventListener('change', () => {
        const groupId = panel.dataset.groupId;
        const group = findGroup(groupId);
        const member = (group?.members || []).find(item => String(item.id) === String(testMemberSelect.value || ''));
        updateModalPreviewForMember(group, member || null);
      });
    }

    const canvaSelect = document.getElementById('ow-outreach-canva-export');
    if (canvaSelect) {
      canvaSelect.addEventListener('change', () => {
        const groupId = panel.dataset.groupId;
        const group = findGroup(groupId);
        const memberId = String(document.getElementById('ow-outreach-test-member')?.value || '');
        const member = (group?.members || []).find(item => String(item.id) === memberId) || getPreferredModalMember(group);
        updateModalPreviewForMember(group, member || null);
      });
    }

    syncOutreachPreviewMode();

    const saveBtn = document.getElementById('ow-outreach-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        await handleOutreachAction('save');
        alert('Outreach details saved.');
      });
    }

    const markDraftedBtn = document.getElementById('ow-outreach-mark-drafted-btn');
    if (markDraftedBtn) {
      markDraftedBtn.addEventListener('click', async () => {
        const groupId = panel.dataset.groupId;
        if (!groupId) return;
        const group = findGroup(groupId);
        if (!group) return;
        const selectedMemberIds = getSelectedRecipientIds(group);
        if (!selectedMemberIds.length) {
          alert('Select at least one recipient first.');
          return;
        }

        const subject = document.getElementById('ow-outreach-subject').value.trim();
        const ccEmails = document.getElementById('ow-outreach-cc').value.trim();
        const canvaExportId = document.getElementById('ow-outreach-canva-export')?.value || '';
        const note = document.getElementById('ow-outreach-note').value.trim();
        const resultStatus = document.getElementById('ow-outreach-result-status').value;

        try {
          await saveSharedDraftNow();
          const res = await apiFetch(`/outreach/group/${groupId}/mark-drafted`, {
            method: 'POST',
            body: JSON.stringify({
              member_ids: selectedMemberIds,
              subject,
              cc_emails: ccEmails,
              canva_export_id: canvaExportId,
              note,
              result_status: resultStatus || 'pending'
            })
          });
          const markedById = new Map((res.marked || []).map(item => [String(item.member_id), item]));
          (group.members || []).forEach(member => {
            const marked = markedById.get(String(member.id));
            if (!marked) return;
            member.draft_created = true;
            member.draft_count = Number(marked.draft_count || 0);
            member.last_draft_created_at = marked.last_draft_created_at || new Date().toISOString();
          });
          syncGroupDraftUI(groupId);
          openOutreachPanel(groupId, { activate: false });
          openGroupDetail(groupId, group.name || '');
          const skippedCount = Number(res.skipped_member_ids?.length || 0);
          const skippedSuffix = skippedCount ? ` ${skippedCount} already-marked recipient(s) were skipped.` : '';
          alert(`${res.marked_count || 0} recipient(s) marked as drafted.${skippedSuffix}`);
        } catch (err) {
          let payload = null;
          try { payload = JSON.parse(err.message); } catch {}
          if (payload?.message) {
            alert(payload.message);
            return;
          }
          alert('Could not mark selected recipients as drafted: ' + err.message);
        }
      });
    }

    async function handleOutreachAction(action) {
      const groupId = panel.dataset.groupId;
      if (!groupId) return;

      const subject = document.getElementById('ow-outreach-subject').value.trim();
      const ccEmails = document.getElementById('ow-outreach-cc').value.trim();
      const canvaExportId = document.getElementById('ow-outreach-canva-export')?.value || '';
      const note = document.getElementById('ow-outreach-note').value.trim();
      const resultStatus = document.getElementById('ow-outreach-result-status').value;

      try {
        await saveSharedDraftNow();
        const res = await apiFetch(`/outreach/group/${groupId}/outreach-action`, {
          method: 'POST',
          body: JSON.stringify({ action, subject, cc_emails: ccEmails, canva_export_id: canvaExportId, note, result_status: resultStatus })
        });

        const group = (window.OW_GROUPS || []).find(item => String(item.id) === String(groupId));
        if (group && res.group) {
          Object.assign(group, res.group);
        }

        const card = document.querySelector(`.ow-card[data-group-id="${groupId}"]`);
        if (card) {
          const badge = card.querySelector('.ow-card__status');
          if (badge && res.group && res.group.status) {
            badge.className = `ow-card__status ow-card__status--${res.group.status}`;
            badge.textContent = res.group.status;
          }
        }

        openOutreachPanel(groupId, { activate: false });
        if (action === 'mark_sent' || action === 'send') {
          alert(action === 'send' ? 'Outreach details saved and marked as sent.' : 'Group marked as sent.');
        }
      } catch (err) {
        alert('Could not save outreach detail: ' + err.message);
      }
    }

    const sendBtn = document.getElementById('ow-outreach-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        const groupId = panel.dataset.groupId;
        if (!groupId) return;

        const group = findGroup(groupId);
        if (!group) return;

        const subject = document.getElementById('ow-outreach-subject').value.trim();
        const ccEmails = document.getElementById('ow-outreach-cc').value.trim();
        const canvaExportId = document.getElementById('ow-outreach-canva-export')?.value || '';
        const note = document.getElementById('ow-outreach-note').value.trim();
        const resultStatus = document.getElementById('ow-outreach-result-status').value;
        const selectedMemberIds = getSelectedRecipientIds(group);
        if (!selectedMemberIds.length) {
          alert('Select the recipients first. Quick-select 20/30/40 or check people manually before creating drafts.');
          return;
        }
        const recipients = getSelectableRecipients(group)
          .filter(member => (member.email || '').trim());
        const targetedRecipients = recipients.filter(member => selectedMemberIds.includes(String(member.id)));

        if (!targetedRecipients.length) {
          alert('None of the selected recipients can receive a draft.');
          return;
        }

        try {
          await saveSharedDraftNow();
          await apiFetch(`/outreach/group/${groupId}/outreach-action`, {
            method: 'POST',
            body: JSON.stringify({
              action: 'save',
              subject,
              cc_emails: ccEmails,
              canva_export_id: canvaExportId,
              note,
              result_status: resultStatus || 'pending'
            })
          });
        } catch (err) {
          alert('Could not save outreach detail before creating drafts: ' + err.message);
          return;
        }

        if (targetedRecipients.length > 6 && !confirm(`This will create ${targetedRecipients.length} Gmail drafts, one per recipient. Continue?`)) {
          return;
        }

        const saveBtnEl = document.getElementById('ow-outreach-save-btn');
        const testBtnEl = document.getElementById('ow-outreach-test-send-btn');
        const markSentBtnEl = document.getElementById('ow-outreach-mark-sent-btn');
        const markDraftedBtnEl = document.getElementById('ow-outreach-mark-drafted-btn');
        const quickButtons = Array.from(document.querySelectorAll('.ow-outreach-quick-select'));
        const clearBtnEl = document.getElementById('ow-outreach-clear-selection-btn');
        const disableDuringRun = [sendBtn, saveBtnEl, testBtnEl, markSentBtnEl, markDraftedBtnEl, clearBtnEl, ...quickButtons].filter(Boolean);
        disableDuringRun.forEach(el => { el.disabled = true; });

        try {
          const groupForUpdate = findGroup(groupId);
          let processedCount = 0;
          let createdCount = 0;
          let skippedCount = 0;
          const skippedRecipients = [];
          const failedRecipients = [];
          let totalAttachmentCount = 0;
          for (const member of targetedRecipients) {
            setDraftProgress(`Creating Gmail drafts... ${processedCount}/${targetedRecipients.length} processed`);
            try {
              const res = await apiFetch(`/outreach/group/${groupId}/gmail-drafts`, {
                method: 'POST',
                body: JSON.stringify({
                  subject,
                  cc_emails: ccEmails,
                  canva_export_id: canvaExportId,
                  note,
                  result_status: resultStatus || 'pending',
                  member_ids: [String(member.id)],
                  skip_group_update: true,
                  return_to: window.location.pathname + window.location.search
                })
              });
              totalAttachmentCount = Math.max(totalAttachmentCount, Number(res.attachment_count || 0));
              if (groupForUpdate) {
                const draftedMemberIds = new Set((res.drafts || []).map(item => String(item.member_id || '')));
                (groupForUpdate.members || []).forEach(item => {
                  if (draftedMemberIds.has(String(item.id))) {
                    item.draft_created = true;
                    item.draft_count = Number(item.draft_count || 0) + 1;
                    item.last_draft_created_at = new Date().toISOString();
                  }
                });
              }
              createdCount += Number(res.draft_count || 0);
              skippedCount += Number(res.skipped_count || 0);
              skippedRecipients.push(...(Array.isArray(res.skipped_recipients) ? res.skipped_recipients : []));
            } catch (err) {
              let payload = null;
              try { payload = JSON.parse(err.message); } catch {}
              if (payload?.error === 'gmail_auth_required' && payload.auth_url) {
                window.location.href = payload.auth_url;
                return;
              }
              failedRecipients.push({
                recipient_name: member.display_name || member.target_name || member.target_id || 'Unknown recipient',
                message: payload?.message || err.message || 'Unknown error'
              });
              skippedCount += 1;
            } finally {
              processedCount += 1;
              setDraftProgress(`Creating Gmail drafts... ${processedCount}/${targetedRecipients.length} processed`);
            }
          }
          await loadGmailStatus().then(renderGmailStatus);
          syncGroupDraftUI(groupId);
          openOutreachPanel(groupId, { activate: false });
          openGroupDetail(groupId, groupForUpdate?.name || group?.name || '');
          setDraftProgress(`Gmail drafts complete: ${processedCount}/${targetedRecipients.length} processed`, { complete: true });
          const attachmentLabel = totalAttachmentCount > 0
            ? ` with ${totalAttachmentCount} attachment(s) each`
            : '';
          const skippedLabel = skippedCount > 0
            ? ` ${skippedCount} recipient(s) were skipped due to errors.`
            : '';
          const skippedDetails = skippedRecipients.length > 0 || failedRecipients.length > 0
            ? '\n\nSkipped:\n' + [
                ...skippedRecipients.map(item => {
                  const name = item.recipient_name || item.to || 'Unknown recipient';
                  const reason = item.reason === 'invalid_email' ? 'invalid email' : 'Gmail API error';
                  return `- ${name}: ${reason}`;
                }),
                ...failedRecipients.map(item => `- ${item.recipient_name}: ${item.message}`)
              ].join('\n')
            : '';
          alert(`${createdCount} Gmail draft(s) created successfully${attachmentLabel}.${skippedLabel}${skippedDetails}`);
        } catch (err) {
          const progressText = document.getElementById('ow-draft-progress')?.textContent || '';
          if (progressText) {
            setDraftProgress(`${progressText} - stopped due to an error`, { error: true });
          }
          let payload = null;
          try { payload = JSON.parse(err.message); } catch {}
          if (payload?.error === 'gmail_auth_required' && payload.auth_url) {
            window.location.href = payload.auth_url;
            return;
          }
          if (payload?.message) {
            alert(payload.message);
            return;
          }
          alert('Could not create Gmail drafts: ' + err.message);
        } finally {
          disableDuringRun.forEach(el => { el.disabled = false; });
          const refreshedGroup = findGroup(groupId);
          if (refreshedGroup) updateOutreachSelectionUI(refreshedGroup);
        }
      });
    }

    const testSendBtn = document.getElementById('ow-outreach-test-send-btn');
    if (testSendBtn) {
      testSendBtn.addEventListener('click', async () => {
        const groupId = panel.dataset.groupId;
        if (!groupId) return;

        const group = findGroup(groupId);
        if (!group) return;

        const subject = document.getElementById('ow-outreach-subject').value.trim();
        const ccEmails = document.getElementById('ow-outreach-cc').value.trim();
        const canvaExportId = document.getElementById('ow-outreach-canva-export')?.value || '';
        const testEmail = document.getElementById('ow-outreach-test-email').value.trim();
        const memberId = document.getElementById('ow-outreach-test-member').value;

        if (!memberId) {
          alert('Choose a reference recipient first.');
          return;
        }

        if (!testEmail) {
          alert('Enter the email address that should receive the test draft.');
          return;
        }

        try {
          await saveSharedDraftNow();
          const res = await apiFetch(`/outreach/group/${groupId}/gmail-test-draft`, {
            method: 'POST',
            body: JSON.stringify({
              member_id: memberId,
              test_email: testEmail,
              subject,
              cc_emails: ccEmails,
              canva_export_id: canvaExportId,
              return_to: window.location.pathname + window.location.search
            })
          });
          await loadGmailStatus().then(renderGmailStatus);
          const attachmentLabel = (res.attachment_count || 0) > 0
            ? ` with ${res.attachment_count} attachment(s)`
            : '';
          alert(`Test Gmail draft created for ${res.to}${attachmentLabel}.`);
        } catch (err) {
          let payload = null;
          try { payload = JSON.parse(err.message); } catch {}
          if (payload?.error === 'gmail_auth_required' && payload.auth_url) {
            window.location.href = payload.auth_url;
            return;
          }
          if (payload?.message) {
            alert(payload.message);
            return;
          }
          alert('Could not create test Gmail draft: ' + err.message);
        }
      });
    }

    const markSentBtn = document.getElementById('ow-outreach-mark-sent-btn');
    if (markSentBtn) markSentBtn.addEventListener('click', () => handleOutreachAction('mark_sent'));
  }

  /* ── Group detail panel (right col) ───────────────────────── */
  function openGroupDetail(groupId, groupName) {
    const rightCol     = document.getElementById('ow-right-col');
    const detailPanel  = document.getElementById('ow-group-detail');
    if (!detailPanel) return;
    const group = findGroup(groupId);
    if (!group) return;
    updateWorkflowState({ activate: isCanvaFlow() ? 'outreach' : 'custom' });

    // Mark card active
    document.querySelectorAll('.ow-card').forEach(c => c.classList.remove('active'));
    const cards = document.querySelectorAll(`.ow-card[data-group-id="${groupId}"]`);
    cards.forEach(node => node.classList.add('active'));

    // Show panel
    detailPanel.classList.add('visible');
    detailPanel.dataset.groupId = groupId;

    const nameEl = detailPanel.querySelector('.ow-group-detail__name');
    if (nameEl) nameEl.textContent = group.name || groupName;

    const membersEl = document.getElementById('gd-members');
    if (membersEl) {
      membersEl.innerHTML = (group.members || []).map(m => `
        <span class="ow-card__member-tag ow-card__member-tag--${m.target_type} ${m.draft_created ? 'ow-card__member-tag--drafted' : ''}">
          ${escHtml(m.display_name || m.target_name || m.target_id)}
        </span>
      `).join('') || '<span class="ow-modal__empty">No members yet.</span>';
    }

    const draftTa = detailPanel.querySelector('#second-draft-ta');
    if (draftTa) {
      draftTa.value = group.second_draft || '';
    }

    const personList = document.getElementById('gd-person-list');
    if (personList) {
      const members = group.members || [];
      personList.innerHTML = members.length
        ? members.map((member, index) => `
            <button type="button" class="ow-person-pill${index === 0 ? ' is-active' : ''} ${member.draft_created ? 'is-drafted' : ''}" data-member-id="${member.id}">
              <span>${escHtml(member.display_name || member.target_name || member.target_id)}</span>
              <span class="ow-person-pill__status ${getDraftStatusClass(member)}">${escHtml(getDraftStatusLabel(member))}</span>
            </button>
          `).join('')
        : '<div class="ow-modal__empty">No recipients yet.</div>';

      personList.querySelectorAll('.ow-person-pill').forEach(pill => {
        pill.addEventListener('click', () => openMemberDetail(groupId, pill.dataset.memberId));
      });
    }

    if ((group.members || []).length) {
      openMemberDetail(groupId, group.members[0].id);
    } else {
      detailPanel.dataset.memberId = '';
      const personalTa = document.getElementById('personal-draft-ta');
      if (personalTa) personalTa.value = '';
      setPreviewEditMode(false);
      setStatus(document.getElementById('gd-email-preview-status'), '', '');
    }

    const attachList = document.getElementById('gd-attach-list');
    if (attachList) {
      attachList.dataset.attachList = `group-${groupId}`;
      attachList.innerHTML = (group.attachments || []).map(att => `
        <div class="ow-attach-item" data-attach-id="${att.id}">
          <span class="ow-attach-icon">📎</span>
          <span class="ow-attach-name">${escHtml(att.filename)}</span>
          <button class="ow-attach-del" data-id="${att.id}">✕</button>
        </div>
      `).join('');
    }

    const attachBtn = document.getElementById('gd-attach-btn');
    if (attachBtn) {
      attachBtn.dataset.refId = groupId;
    }

    refreshRenderedPreview(groupId);
    const hint = document.getElementById('ow-no-group-hint');
    if (hint) hint.style.display = 'none';

    // Rename
    const renameBtn = detailPanel.querySelector('#rename-group-btn');
    if (renameBtn) {
      renameBtn.onclick = () => {
        const newName = prompt('Rename group:', groupName);
        if (!newName || !newName.trim()) return;
        apiFetch(`/outreach/group/${groupId}/rename`, {
          method: 'POST',
          body: JSON.stringify({ name: newName.trim() })
        }).then(() => {
          if (nameEl) nameEl.textContent = newName.trim();
          group.name = newName.trim();
          document.querySelectorAll(`.ow-card[data-group-id="${groupId}"]`).forEach(node => {
            const n = node.querySelector('.ow-card__name');
            if (n) n.textContent = newName.trim();
            node.dataset.groupName = newName.trim();
          });
        });
      };
    }
  }

  /* ── Second draft (per group) ──────────────────────────────── */
  function initSecondDraft() {
    const detail = document.getElementById('ow-group-detail');
    if (!detail) return;

    const ta     = detail.querySelector('#second-draft-ta');
    const status = detail.querySelector('#second-draft-status');
    const saveBtn = detail.querySelector('#second-draft-save-btn');

    if (!ta) return;

    // Auto-save (just sends to server, not finalised)
    const autoSave = debounce(async () => {
      const groupId = detail.dataset.groupId;
      if (!groupId) return;
      setStatus(status, 'saving', 'Saving…');
      try {
        await apiFetch(`/outreach/group/${groupId}/draft`, {
          method: 'POST',
          body: JSON.stringify({ text: ta.value, action: 'autosave' })
        });
        setStatus(status, 'saved', 'Auto-saved ✓');
      } catch {
        setStatus(status, '', 'Auto-save failed');
      }
    }, 1000);

    ta.addEventListener('input', autoSave);
    ta.addEventListener('input', () => {
      const groupId = detail.dataset.groupId;
      const group = findGroup(groupId);
      if (group) {
        group.second_draft = ta.value;
      }
      refreshRenderedPreview(groupId);
    });

    // Save button (finalise)
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const groupId = detail.dataset.groupId;
        if (!groupId) return;
        setStatus(status, 'saving', 'Saving…');
        try {
          const res = await apiFetch(`/outreach/group/${groupId}/draft`, {
            method: 'POST',
            body: JSON.stringify({ text: ta.value, action: 'save' })
          });
          setStatus(status, 'saved', 'Saved ✓');
          const group = findGroup(groupId);
          if (group) {
            group.second_draft = ta.value;
            group.status = 'ready';
          }
          // Update card status badge
          document.querySelectorAll(`.ow-card[data-group-id="${groupId}"]`).forEach(card => {
            const badge = card.querySelector('.ow-card__status');
            if (badge) {
              badge.className = 'ow-card__status ow-card__status--ready';
              badge.textContent = 'ready';
            }
            const preview = card.querySelector('.ow-card__draft-preview');
            if (preview) preview.textContent = ta.value.slice(0, 80) + (ta.value.length > 80 ? '…' : '');
          });
          refreshRenderedPreview(groupId);
        } catch {
          setStatus(status, '', 'Save failed');
        }
      });
    }

  }

  function initPersonalDraft() {
    const detail = document.getElementById('ow-group-detail');
    if (!detail) return;

    const ta = document.getElementById('personal-draft-ta');
    const status = document.getElementById('personal-draft-status');
    const saveBtn = document.getElementById('personal-draft-save-btn');
    if (!ta) return;

    const autoSave = debounce(async () => {
      const memberId = detail.dataset.memberId;
      const groupId = detail.dataset.groupId;
      if (!memberId || !groupId) return;
      setStatus(status, 'saving', 'Saving…');
      try {
        await apiFetch(`/outreach/member/${memberId}/draft`, {
          method: 'POST',
          body: JSON.stringify({ text: ta.value })
        });
        const group = findGroup(groupId);
        const member = group ? (group.members || []).find(item => String(item.id) === String(memberId)) : null;
        if (member) member.personal_draft = ta.value;
        setStatus(status, 'saved', 'Auto-saved ✓');
        refreshRenderedPreview(groupId);
      } catch {
        setStatus(status, '', 'Auto-save failed');
      }
    }, 1000);

    ta.addEventListener('input', autoSave);
    ta.addEventListener('input', () => {
      const memberId = detail.dataset.memberId;
      const groupId = detail.dataset.groupId;
      const group = findGroup(groupId);
      const member = group ? (group.members || []).find(item => String(item.id) === String(memberId)) : null;
      if (member) member.personal_draft = ta.value;
      refreshRenderedPreview(groupId);
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const memberId = detail.dataset.memberId;
        const groupId = detail.dataset.groupId;
        if (!memberId || !groupId) return;
        setStatus(status, 'saving', 'Saving…');
        try {
          await apiFetch(`/outreach/member/${memberId}/draft`, {
            method: 'POST',
            body: JSON.stringify({ text: ta.value })
          });
          const group = findGroup(groupId);
          const member = group ? (group.members || []).find(item => String(item.id) === String(memberId)) : null;
          if (member) member.personal_draft = ta.value;
          setStatus(status, 'saved', 'Saved ✓');
          refreshRenderedPreview(groupId);
        } catch {
          setStatus(status, '', 'Save failed');
        }
      });
    }
  }

  function initPreviewEditor() {
    const detail = document.getElementById('ow-group-detail');
    const previewTa = document.getElementById('gd-email-preview-ta');
    const editorWrap = document.getElementById('gd-email-preview-editor-wrap');
    const editBtn = document.getElementById('gd-email-preview-edit-btn');
    const cancelBtn = document.getElementById('gd-email-preview-cancel-btn');
    const saveBtn = document.getElementById('gd-email-preview-save-btn');
    const resetBtn = document.getElementById('gd-email-preview-reset-btn');
    const status = document.getElementById('gd-email-preview-status');
    if (!detail || !previewTa) return;

    const formatButtons = {
      bold: document.getElementById('gd-email-preview-bold-btn'),
      italic: document.getElementById('gd-email-preview-italic-btn'),
    };

    function refreshToolbarState() {
      if (!editorWrap || editorWrap.hidden) return;
      Object.entries(formatButtons).forEach(([command, btn]) => {
        if (!btn) return;
        let isActive = false;
        try {
          isActive = document.queryCommandState(command);
        } catch (err) {}
        btn.classList.toggle('is-active', !!isActive);
      });
    }

    function fillEditor() {
      const groupId = detail.dataset.groupId;
      const group = findGroup(groupId);
      const member = getSelectedMember(group);
      previewTa.innerHTML = member ? getRenderedFinalEmailHtml(group, member) : '';
      syncPreviewMeta(member);
      refreshToolbarState();
    }

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        fillEditor();
        setPreviewEditMode(true);
        setStatus(status, '', '');
        previewTa.focus();
        refreshToolbarState();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        setPreviewEditMode(false);
        setStatus(status, '', '');
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const memberId = detail.dataset.memberId;
        const groupId = detail.dataset.groupId;
        if (!memberId || !groupId) return;
        setStatus(status, 'saving', 'Saving…');
        try {
          await apiFetch(`/outreach/member/${memberId}/final-email`, {
            method: 'POST',
            body: JSON.stringify({ text: previewTa.innerHTML })
          });
          const group = findGroup(groupId);
          const member = getSelectedMember(group);
          if (member) member.final_email_override = previewTa.innerHTML;
          setPreviewEditMode(false);
          refreshRenderedPreview(groupId);
          setStatus(status, 'saved', 'Saved ✓');
        } catch {
          setStatus(status, '', 'Save failed');
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        const memberId = detail.dataset.memberId;
        const groupId = detail.dataset.groupId;
        if (!memberId || !groupId) return;
        setStatus(status, 'saving', 'Resetting…');
        try {
          await apiFetch(`/outreach/member/${memberId}/final-email`, {
            method: 'POST',
            body: JSON.stringify({ reset: true })
          });
          const group = findGroup(groupId);
          const member = getSelectedMember(group);
          if (member) member.final_email_override = '';
          setPreviewEditMode(false);
          refreshRenderedPreview(groupId);
          setStatus(status, 'saved', 'Reset ✓');
        } catch {
          setStatus(status, '', 'Reset failed');
        }
      });
    }

    function runEditorCommand(command, value = null) {
      if (!editorWrap || editorWrap.hidden) return;
      previewTa.focus();
      document.execCommand(command, false, value);
      refreshToolbarState();
    }

    const boldBtn = document.getElementById('gd-email-preview-bold-btn');
    if (boldBtn) {
      boldBtn.addEventListener('click', () => runEditorCommand('bold'));
    }

    const italicBtn = document.getElementById('gd-email-preview-italic-btn');
    if (italicBtn) {
      italicBtn.addEventListener('click', () => runEditorCommand('italic'));
    }

    const smallBtn = document.getElementById('gd-email-preview-small-btn');
    if (smallBtn) {
      smallBtn.addEventListener('click', () => runEditorCommand('fontSize', '2'));
    }

    const linkBtn = document.getElementById('gd-email-preview-link-btn');
    if (linkBtn) {
      linkBtn.addEventListener('click', () => {
        if (!editorWrap || editorWrap.hidden) return;
        const url = window.prompt('Enter hyperlink URL');
        if (!url) return;
        runEditorCommand('createLink', url.trim());
      });
    }

    previewTa.addEventListener('mouseup', refreshToolbarState);
    previewTa.addEventListener('keyup', refreshToolbarState);
    previewTa.addEventListener('input', refreshToolbarState);
    previewTa.addEventListener('keydown', event => {
      if (!editorWrap || editorWrap.hidden) return;
      const isMetaShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
      if (isMetaShortcut && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        runEditorCommand('bold');
      }
      if (isMetaShortcut && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        runEditorCommand('italic');
      }
    });

    document.addEventListener('selectionchange', () => {
      const selection = document.getSelection();
      if (!selection || !selection.anchorNode) return;
      if (!previewTa.contains(selection.anchorNode)) return;
      refreshToolbarState();
    });
  }

  /* ── Attachments ────────────────────────────────────────────── */
  function initAttachments() {
    document.querySelectorAll('.ow-upload-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const refType = btn.dataset.refType;
        const refId   = btn.dataset.refId;
        const input   = document.createElement('input');
        input.type    = 'file';
        input.multiple = false;
        input.accept   = '.pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.zip';
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          const fd = new FormData();
          fd.append('file', file);
          fd.append('ref_type', refType);
          fd.append('ref_id', refId);
          try {
            const res = await fetch('/outreach/attach', { method: 'POST', body: fd });
            const data = await res.json();
            const list = document.querySelector(`[data-attach-list="${refType}-${refId}"]`);
            if (list) {
              const item = document.createElement('div');
              item.className = 'ow-attach-item';
              item.dataset.attachId = data.id;
              item.innerHTML = `
                <span class="ow-attach-icon">📎</span>
                <span class="ow-attach-name">${escHtml(data.filename)}</span>
                <button class="ow-attach-del" data-id="${data.id}">✕</button>
              `;
              list.appendChild(item);
            }
            const group = refType === 'group' ? findGroup(refId) : null;
            if (group) {
              group.attachments = group.attachments || [];
              group.attachments.push(data);
            } else if (refType === 'project' && Array.isArray(window.OW_PROJECT_ATTACHMENTS)) {
              window.OW_PROJECT_ATTACHMENTS.push(data);
            }
          } catch { alert('Upload failed'); }
        };
        input.click();
      });
    });

    // Delete attachment
    document.addEventListener('click', async e => {
      const btn = e.target.closest('.ow-attach-del');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!confirm('Remove attachment?')) return;
      try {
        await apiFetch(`/outreach/attach/${id}/delete`, { method: 'POST' });
        if (Array.isArray(window.OW_PROJECT_ATTACHMENTS)) {
          window.OW_PROJECT_ATTACHMENTS = window.OW_PROJECT_ATTACHMENTS.filter(item => String(item.id) !== String(id));
        }
        if (Array.isArray(window.OW_GROUPS)) {
          window.OW_GROUPS.forEach(group => {
            group.attachments = (group.attachments || []).filter(item => String(item.id) !== String(id));
          });
        }
        btn.closest('.ow-attach-item').remove();
      } catch { alert('Could not remove'); }
    });
  }

  function initTemplateHelpers() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-insert-token]');
      if (!btn) return;
      const token = btn.dataset.insertToken || '';
      const activeTextarea = document.activeElement && document.activeElement.tagName === 'TEXTAREA'
        ? document.activeElement
        : null;
      const target = btn.closest('.ow-draft')?.querySelector('textarea') || activeTextarea;
      const textarea = target && target.tagName === 'TEXTAREA'
        ? target
        : btn.closest('.ow-col')?.querySelector('textarea');
      if (!textarea) return;
      insertAtCursor(textarea, token);
      textarea.focus();
      textarea.classList.add('ow-textarea--inserted');
      window.setTimeout(() => textarea.classList.remove('ow-textarea--inserted'), 900);
    });
  }

  function initStageTabs() {
    const tabs = document.querySelectorAll('.ow-stage-tab');
    if (!tabs.length) return;
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.disabled || tab.classList.contains('is-disabled')) return;
        setActiveStep(tab.dataset.targetStep);
      });
    });
  }

  /* ── Complete project button ────────────────────────────────── */
  function initCompleteBtn() {
    const btn = document.getElementById('complete-project-btn');
    if (!btn) return;
    const projectId = btn.dataset.projectId;
    btn.addEventListener('click', async () => {
      if (!confirm('Mark this project as completed?')) return;
      try {
        await apiFetch(`/outreach/project/${projectId}/complete`, { method: 'POST' });
        const badge = document.querySelector('.ow-topbar__badge');
        if (badge) { badge.className = 'ow-topbar__badge ow-topbar__badge--completed'; badge.textContent = 'Completed'; }
        btn.textContent = '✓ Completed';
        btn.disabled = true;
      } catch { alert('Failed'); }
    });
  }

  /* ── Escape HTML helper ─────────────────────────────────────── */
  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Init ───────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    initFilmSelect();
    initFirstDraft();
    initRecommendationPanel();
    initRecommendations();
    initTargetSelect();
    initGroupCards();
    initSecondDraft();
    initPersonalDraft();
    initPreviewEditor();
    initAttachments();
    initCompleteBtn();
    initOutreachPanel();
    initTemplateHelpers();
    initStageTabs();
    updateCardCount();
    updateWorkflowState();
    const initialGroupId = document.getElementById('ow-group-detail')?.dataset.groupId;
    if (initialGroupId) refreshRenderedPreview(initialGroupId);
    const initialOutreachGroupId = Array.isArray(window.OW_GROUPS) && window.OW_GROUPS.length
      ? window.OW_GROUPS[0].id
      : '';
    if (initialOutreachGroupId) openOutreachPanel(initialOutreachGroupId, { activate: false });
  });

})();
