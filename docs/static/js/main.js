function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  if (isMobile) {
    sidebar.classList.toggle('collapsed');
    return;
  }

  const nextMiniState = !sidebar.classList.contains('sidebar-mini');
  sidebar.classList.toggle('sidebar-mini', nextMiniState);
  sidebar.classList.remove('collapsed');

  try {
    window.localStorage.setItem('macsd.sidebar.mini', nextMiniState ? 'true' : 'false');
  } catch (err) {}
}

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const peekToggle = sidebar.querySelector('.sidebar-peek-toggle');

  const mobileQuery = window.matchMedia('(max-width: 900px)');
  let hoverTimer = null;

  function clearHoverTimer() {
    if (!hoverTimer) return;
    window.clearTimeout(hoverTimer);
    hoverTimer = null;
  }

  function syncSidebarMode() {
    if (mobileQuery.matches) {
      clearHoverTimer();
      sidebar.classList.remove('sidebar-mini');
      sidebar.classList.add('collapsed');
      return;
    }

    sidebar.classList.remove('collapsed');
    try {
      const savedMini = window.localStorage.getItem('macsd.sidebar.mini');
      sidebar.classList.toggle('sidebar-mini', savedMini === 'true');
    } catch (err) {
      sidebar.classList.remove('sidebar-mini');
    }
  }

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', syncSidebarMode);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(syncSidebarMode);
  }

  peekToggle?.addEventListener('mouseenter', function() {
    if (mobileQuery.matches) return;
    if (!sidebar.classList.contains('sidebar-mini')) return;
    clearHoverTimer();
    hoverTimer = window.setTimeout(function() {
      sidebar.classList.remove('sidebar-mini');
      try {
        window.localStorage.setItem('macsd.sidebar.mini', 'false');
      } catch (err) {}
      hoverTimer = null;
    }, 500);
  });

  peekToggle?.addEventListener('mouseleave', clearHoverTimer);

  syncSidebarMode();
}

function initFlashMessages() {
  document.querySelectorAll('.flash').forEach(function(el) {
    setTimeout(function() {
      el.style.transition = 'opacity 0.4s';
      el.style.opacity = '0';
      setTimeout(function() { el.remove(); }, 400);
    }, 3000);
  });
}

function initPalette() {
  const panel = document.getElementById('palette-panel');
  const toggle = document.getElementById('palette-toggle');
  const closeBtn = document.getElementById('palette-close');
  const dragHandle = document.getElementById('palette-drag-handle');
  const footer = document.querySelector('.sidebar-footer');

  if (!panel || !toggle || !dragHandle || !footer) {
    return;
  }

  const sidebar = document.getElementById('sidebar');
  const positionKey = 'macsd.palette.position.v2';
  const openKey = 'macsd.palette.open.v2';
  const margin = 16;
  let isOpen = panel.dataset.defaultOpen !== 'false';
  let currentPosition = null;
  let dragState = null;
  let pendingPosition = null;
  let dragFrame = null;

  function getPanelSize() {
    return {
      width: panel.offsetWidth || 320,
      height: panel.offsetHeight || 280
    };
  }

  function clampPosition(position) {
    const size = getPanelSize();
    const maxX = Math.max(margin, window.innerWidth - size.width - margin);
    const maxY = Math.max(margin, window.innerHeight - size.height - margin);
    return {
      x: Math.min(Math.max(position.x, margin), maxX),
      y: Math.min(Math.max(position.y, margin), maxY)
    };
  }

  function getDefaultPosition() {
    const sidebarRect = sidebar?.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const size = getPanelSize();
    const x = (sidebarRect?.left || 0) + margin;
    const preferredY = footerRect.top - size.height - margin;
    const minY = (sidebarRect?.top || 0) + 72;
    const y = Math.max(preferredY, minY);
    return clampPosition({ x, y });
  }

  function loadSavedPosition() {
    try {
      const raw = window.localStorage.getItem(positionKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') {
        return null;
      }
      return clampPosition(parsed);
    } catch (err) {
      return null;
    }
  }

  function applyPosition(position) {
    currentPosition = clampPosition(position);
    panel.style.left = currentPosition.x + 'px';
    panel.style.top = currentPosition.y + 'px';
  }

  function savePosition(position) {
    applyPosition(position);
    document.documentElement.style.setProperty('--palette-initial-x', currentPosition.x + 'px');
    document.documentElement.style.setProperty('--palette-initial-y', currentPosition.y + 'px');
    window.localStorage.setItem(positionKey, JSON.stringify(currentPosition));
  }

  function updateCloseVector() {
    const toggleRect = toggle.getBoundingClientRect();
    const size = getPanelSize();
    const basePosition = currentPosition || getDefaultPosition();
    const panelCenterX = basePosition.x + (size.width / 2);
    const panelCenterY = basePosition.y + (size.height / 2);
    const toggleCenterX = toggleRect.left + (toggleRect.width / 2);
    const toggleCenterY = toggleRect.top + (toggleRect.height / 2);
    panel.style.setProperty('--palette-close-x', (toggleCenterX - panelCenterX) + 'px');
    panel.style.setProperty('--palette-close-y', (toggleCenterY - panelCenterY) + 'px');
  }

  function syncOpenState() {
    panel.classList.remove('is-booting');
    document.documentElement.setAttribute('data-palette-state', isOpen ? 'open' : 'closed');
    panel.classList.toggle('is-closed', !isOpen);
    panel.setAttribute('aria-hidden', String(!isOpen));
    toggle.classList.toggle('is-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    updateCloseVector();
    window.localStorage.setItem(openKey, isOpen ? 'true' : 'false');
  }

  function ensureVisiblePosition() {
    const size = getPanelSize();
    const position = currentPosition || getDefaultPosition();
    const rect = {
      left: position.x,
      top: position.y,
      right: position.x + size.width,
      bottom: position.y + size.height
    };
    const visibleEnough =
      rect.right > margin &&
      rect.bottom > margin &&
      rect.left < window.innerWidth - margin &&
      rect.top < window.innerHeight - margin;

    if (!visibleEnough) {
      savePosition(getDefaultPosition());
    }
  }

  function restoreState() {
    currentPosition = loadSavedPosition() || getDefaultPosition();
    savePosition(currentPosition);
    const savedOpen = window.localStorage.getItem(openKey);
    if (savedOpen === 'true') isOpen = true;
    if (savedOpen === 'false') isOpen = false;
    if (isOpen) {
      ensureVisiblePosition();
    }
    syncOpenState();
  }

  function openPalette() {
    if (!currentPosition) {
      savePosition(getDefaultPosition());
    } else {
      applyPosition(currentPosition);
    }
    ensureVisiblePosition();
    isOpen = true;
    syncOpenState();
  }

  function closePalette() {
    updateCloseVector();
    isOpen = false;
    syncOpenState();
  }

  function onPointerMove(event) {
    if (!dragState) return;
    pendingPosition = {
      x: event.clientX - dragState.offsetX,
      y: event.clientY - dragState.offsetY
    };
    if (dragFrame) return;
    dragFrame = window.requestAnimationFrame(function() {
      dragFrame = null;
      if (!pendingPosition) return;
      applyPosition(pendingPosition);
      pendingPosition = null;
    });
  }

  function onPointerUp() {
    if (!dragState) return;
    panel.classList.remove('is-dragging');
    dragHandle.releasePointerCapture?.(dragState.pointerId);
    if (dragFrame) {
      window.cancelAnimationFrame(dragFrame);
      dragFrame = null;
    }
    if (pendingPosition) {
      applyPosition(pendingPosition);
      pendingPosition = null;
    }
    savePosition(currentPosition || getDefaultPosition());
    updateCloseVector();
    dragState = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  toggle.addEventListener('click', function(event) {
    event.preventDefault();
    if (isOpen) {
      closePalette();
    } else {
      openPalette();
    }
  });

  closeBtn?.addEventListener('click', function(event) {
    event.preventDefault();
    closePalette();
  });

  dragHandle.addEventListener('pointerdown', function(event) {
    if (!isOpen) return;
    if (event.target.closest('button')) return;
    event.preventDefault();
    const rect = {
      left: currentPosition?.x ?? panel.getBoundingClientRect().left,
      top: currentPosition?.y ?? panel.getBoundingClientRect().top
    };
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    panel.classList.add('is-dragging');
    dragHandle.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && isOpen) {
      closePalette();
    }
  });

  window.addEventListener('resize', function() {
    const fallback = currentPosition || getDefaultPosition();
    savePosition(fallback);
    syncOpenState();
  });

  restoreState();
}

function getViewerTimeZone() {
  try {
    return window.localStorage.getItem('macsd.user.timezone')
      || Intl.DateTimeFormat().resolvedOptions().timeZone
      || 'America/Los_Angeles';
  } catch (err) {
    return 'America/Los_Angeles';
  }
}

function parseUtcDateTime(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value || value === '—') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z');
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatUtcDateTime(rawValue, mode) {
  const date = parseUtcDateTime(rawValue);
  if (!date) return rawValue;

  const timeZone = getViewerTimeZone();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: mode === 'compact' ? undefined : 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  parts.forEach(function(part) {
    map[part.type] = part.value;
  });

  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short'
  });
  const tzParts = tzFormatter.formatToParts(date);
  const timeZoneShort = (tzParts.find(function(part) {
    return part.type === 'timeZoneName';
  }) || {}).value || 'UTC';

  const datePart = mode === 'compact'
    ? [map.month, map.day].filter(Boolean).join('-')
    : [map.year, map.month, map.day].filter(Boolean).join('-');
  const timePart = [map.hour, map.minute].filter(Boolean).join(':');
  return [datePart, timePart].filter(Boolean).join(' ') + ' (' + timeZoneShort + ')';
}

function initUtcDateTimes() {
  document.querySelectorAll('[data-utc]').forEach(function(el) {
    const rawValue = el.getAttribute('data-utc') || '';
    const mode = el.getAttribute('data-utc-format') || 'full';
    const formatted = formatUtcDateTime(rawValue, mode);
    if (!formatted || formatted === rawValue) return;
    el.textContent = formatted;
    el.setAttribute('title', rawValue + ' UTC');
  });
}

function initPalettePins() {
  document.querySelectorAll('[data-palette-pin]').forEach(function(button) {
    button.addEventListener('click', async function(event) {
      event.preventDefault();
      event.stopPropagation();
      const itemId = button.getAttribute('data-item-id');
      if (!itemId) return;
      try {
        const res = await fetch('/palette/toggle-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: itemId })
        });
        if (!res.ok) {
          throw new Error('Failed to update pin');
        }
        window.location.reload();
      } catch (err) {
        console.error(err);
      }
    });
  });
}

function initChatbot() {
  const shell = document.querySelector('[data-chatbot-shell]');
  const launcher = document.getElementById('chatbot-launcher');
  const restore = document.getElementById('chatbot-restore');
  const hideTrigger = document.getElementById('chatbot-hide');
  const panel = document.getElementById('chatbot-panel');
  const closeBtn = document.getElementById('chatbot-close');
  const panelHideBtn = document.getElementById('chatbot-panel-hide');
  const form = document.getElementById('chatbot-form');
  const input = document.getElementById('chatbot-input');
  const thread = document.getElementById('chatbot-thread');
  const hiddenKey = 'macsd.chatbot.hidden';

  if (!shell || !launcher || !restore || !panel || !form || !input || !thread) {
    return;
  }

  function setHidden(nextHidden) {
    shell.classList.toggle('is-hidden', nextHidden);
    restore.hidden = !nextHidden;
    if (nextHidden) {
      panel.setAttribute('data-chatbot-open', 'false');
      panel.setAttribute('aria-hidden', 'true');
      launcher.setAttribute('aria-expanded', 'false');
    }
    try {
      window.localStorage.setItem(hiddenKey, nextHidden ? 'true' : 'false');
    } catch (err) {}
  }

  function setOpen(nextOpen) {
    if (shell.classList.contains('is-hidden')) return;
    panel.setAttribute('data-chatbot-open', nextOpen ? 'true' : 'false');
    panel.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
    launcher.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    if (nextOpen) {
      window.setTimeout(function() {
        input.focus();
      }, 120);
    }
  }

  function appendMessage(role, text) {
    const article = document.createElement('article');
    article.className = 'chatbot-message chatbot-message--' + role;

    const meta = document.createElement('div');
    meta.className = 'chatbot-message__meta';
    meta.textContent = role === 'user' ? 'You' : 'MACSD Helper';

    const bubble = document.createElement('div');
    bubble.className = 'chatbot-message__bubble';
    bubble.textContent = text;

    article.appendChild(meta);
    article.appendChild(bubble);
    thread.appendChild(article);
    thread.scrollTop = thread.scrollHeight;
  }

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 132) + 'px';
  }

  launcher.addEventListener('click', function() {
    const isOpen = panel.getAttribute('data-chatbot-open') === 'true';
    setOpen(!isOpen);
  });

  function hideChatbot() {
    setHidden(true);
  }

  hideTrigger?.addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    hideChatbot();
  });

  hideTrigger?.addEventListener('keydown', function(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    hideChatbot();
  });

  restore.addEventListener('click', function() {
    setHidden(false);
    setOpen(true);
  });

  closeBtn?.addEventListener('click', function() {
    setOpen(false);
  });

  panelHideBtn?.addEventListener('click', function() {
    hideChatbot();
  });

  document.querySelectorAll('[data-chatbot-prompt]').forEach(function(button) {
    button.addEventListener('click', function() {
      const prompt = button.getAttribute('data-chatbot-prompt') || '';
      input.value = prompt;
      autoResize();
      setOpen(true);
    });
  });

  input.addEventListener('input', autoResize);

  input.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', function(event) {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;

    appendMessage('user', value);
    appendMessage('bot', 'UI skeleton is active. Next step is wiring this input to a Flask chat endpoint.');
    input.value = '';
    autoResize();
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && panel.getAttribute('data-chatbot-open') === 'true') {
      setOpen(false);
    }
  });

  try {
    setHidden(window.localStorage.getItem(hiddenKey) === 'true');
  } catch (err) {
    setHidden(false);
  }

  autoResize();
}

document.addEventListener('DOMContentLoaded', function() {
  initSidebar();
  initFlashMessages();
  initPalette();
  initPalettePins();
  initChatbot();
  initUtcDateTimes();
});
