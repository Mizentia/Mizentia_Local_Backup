let activeIgnoreItem = null;

BackupApp.ignore.loadRules = async function() {
  try {
    const response = await fetch('/api/ignore');
    const data = await response.json();
    if (data.success) {
      BackupApp.elements.ignoreRulesTextarea.value = data.content;
      BackupApp.utils.logToConsole('Loaded .backupignore rules from disk.', 'info');
      BackupApp.ignore.renderActiveList();
    }
  } catch (e) {
    BackupApp.utils.logToConsole(`Error loading .backupignore: ${e.message}`, 'error');
  }
};

BackupApp.ignore.parseRules = function(content) {
  if (!content) return [];
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
};

BackupApp.ignore.renderActiveList = function() {
  const content = BackupApp.elements.ignoreRulesTextarea.value;
  const list = BackupApp.elements.activeRulesList;
  if (!list) return;
  list.innerHTML = '';
  
  const rules = BackupApp.ignore.parseRules(content);
  if (rules.length === 0) {
    list.innerHTML = '<div style="font-size: 0.85rem; opacity: 0.5; text-align: center; padding: 20px 0;">কোন সক্রিয় রুলস পাওয়া যায়নি।</div>';
    return;
  }
  
  rules.forEach(rule => {
    const chip = document.createElement('div');
    chip.style.display = 'flex';
    chip.style.justifyContent = 'space-between';
    chip.style.alignItems = 'center';
    chip.style.background = 'rgba(255, 255, 255, 0.03)';
    chip.style.border = '1px solid var(--border-color)';
    chip.style.borderRadius = '6px';
    chip.style.padding = '6px 10px';
    chip.style.marginBottom = '6px';
    chip.style.fontSize = '0.8rem';
    
    const ruleText = document.createElement('span');
    ruleText.textContent = rule;
    ruleText.style.fontFamily = 'monospace';
    ruleText.style.color = '#e2e8f0';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '✕';
    deleteBtn.style.background = 'none';
    deleteBtn.style.border = 'none';
    deleteBtn.style.color = '#f43f5e';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.padding = '0 4px';
    deleteBtn.style.fontSize = '0.9rem';
    deleteBtn.style.fontWeight = 'bold';
    
    deleteBtn.addEventListener('click', () => {
      BackupApp.ignore.removeRule(rule);
    });
    
    chip.appendChild(ruleText);
    chip.appendChild(deleteBtn);
    list.appendChild(chip);
  });
};

BackupApp.ignore.removeRule = function(rule) {
  const content = BackupApp.elements.ignoreRulesTextarea.value;
  const lines = content.split('\n');
  const updatedLines = lines.filter(line => line.trim() !== rule);
  BackupApp.elements.ignoreRulesTextarea.value = updatedLines.join('\n');
  
  BackupApp.ignore.renderActiveList();
  
  const row = document.querySelector(`.workspace-row[data-relative-path="${rule}"]`) || 
              document.querySelector(`.workspace-row[data-relative-path="${rule.slice(0, -1)}"]`);
  if (row) {
    row.style.opacity = '1';
    row.style.background = 'rgba(255, 255, 255, 0.01)';
    row.style.borderColor = 'transparent';
    
    const nameSpan = row.querySelector('.node-name');
    if (nameSpan) {
      nameSpan.style.textDecoration = 'none';
      nameSpan.style.color = '#f1f5f9';
    }
    
    const rightSide = row.querySelector('div:last-child');
    if (rightSide) {
      const badge = rightSide.querySelector('.ignored-badge');
      if (badge) badge.remove();
      
      const ignoreBtn = rightSide.querySelector('button');
      if (ignoreBtn) {
        ignoreBtn.style.opacity = '1';
        ignoreBtn.style.cursor = 'pointer';
        ignoreBtn.disabled = false;
      }
    }
  }

  BackupApp.utils.showToast('ইগনোর লিস্ট থেকে সরানো হয়েছে (সেভ করতে নিচে ক্লিক করুন)!', 'info');
};

BackupApp.ignore.addRule = function(rule) {
  const content = BackupApp.elements.ignoreRulesTextarea.value;
  const rules = BackupApp.ignore.parseRules(content);
  if (rules.includes(rule)) {
    BackupApp.utils.showToast('রুলটি ইতিমধ্যেই বিদ্যমান!', 'warning');
    return;
  }

  const separator = content.endsWith('\n') || content.length === 0 ? '' : '\n';
  BackupApp.elements.ignoreRulesTextarea.value = content + separator + rule + '\n';
  
  BackupApp.ignore.renderActiveList();

  const row = document.querySelector(`.workspace-row[data-relative-path="${rule}"]`) || 
              document.querySelector(`.workspace-row[data-relative-path="${rule.slice(0, -1)}"]`);
  if (row) {
    row.style.opacity = '0.55';
    row.style.background = 'rgba(244, 63, 94, 0.03)';
    row.style.borderColor = 'rgba(244, 63, 94, 0.1)';
    
    const nameSpan = row.querySelector('.node-name');
    if (nameSpan) {
      nameSpan.style.textDecoration = 'line-through';
      nameSpan.style.color = 'rgba(255,255,255,0.4)';
    }
    
    const rightSide = row.querySelector('div:last-child');
    if (rightSide) {
      if (!rightSide.querySelector('.ignored-badge')) {
        const badge = document.createElement('span');
        badge.className = 'ignored-badge';
        badge.textContent = 'Ignored';
        badge.style.fontSize = '0.65rem';
        badge.style.background = 'rgba(244, 63, 94, 0.15)';
        badge.style.color = '#f43f5e';
        badge.style.border = '1px solid rgba(244, 63, 94, 0.3)';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '4px';
        badge.style.marginRight = '8px';
        rightSide.insertBefore(badge, rightSide.firstChild);
      }
      
      const ignoreBtn = rightSide.querySelector('button');
      if (ignoreBtn) {
        ignoreBtn.style.opacity = '0.4';
        ignoreBtn.style.cursor = 'not-allowed';
        ignoreBtn.disabled = true;
      }
    }
  }
  
  BackupApp.utils.showToast('ইগনোর লিস্টে যোগ করা হয়েছে (সেভ করতে নিচে ক্লিক করুন)!', 'info');
};

BackupApp.ignore.saveRules = async function(notify = true) {
  const content = BackupApp.elements.ignoreRulesTextarea.value;
  if (notify) BackupApp.utils.logToConsole('Saving updated ignore rules to .backupignore...', 'info');
  
  try {
    const response = await fetch('/api/ignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await response.json();
    if (data.success) {
      if (notify) {
        BackupApp.utils.logToConsole('Successfully saved ignore rules.', 'success');
        BackupApp.utils.showToast('ইগনোর রুলস সেভ হয়েছে!', 'success');
      }
      BackupApp.ignore.renderActiveList();
      BackupApp.ignore.loadWorkspaceBrowser();
      if (typeof BackupApp.scanner.scan === 'function') {
        BackupApp.scanner.scan(true);
      }
    } else {
      throw new Error(data.error);
    }
  } catch (e) {
    BackupApp.utils.logToConsole(`Failed to save ignore rules: ${e.message}`, 'error');
    if (notify) BackupApp.utils.showToast(`রুলস সেভ করতে সমস্যা হয়েছে: ${e.message}`, 'error');
  }
};

BackupApp.ignore.loadWorkspaceBrowser = async function() {
  const browserContainer = BackupApp.elements.ignoreWorkspaceBrowser;
  if (!browserContainer) return;
  browserContainer.innerHTML = '<div style="font-size: 0.85rem; opacity: 0.6; padding: 10px;">ওয়ার্কস্পেস ডিরেক্টরি লোড হচ্ছে...</div>';
  
  try {
    const response = await fetch('/api/workspace/list?path=');
    const data = await response.json();
    if (data.success) {
      browserContainer.innerHTML = '';
      const listContainer = document.createElement('div');
      listContainer.className = 'workspace-tree-container';
      
      data.items.forEach(item => {
        listContainer.appendChild(BackupApp.ignore.createWorkspaceNodeHtml(item));
      });
      browserContainer.appendChild(listContainer);
    } else {
      throw new Error(data.error);
    }
  } catch (e) {
    browserContainer.innerHTML = `<div style="font-size: 0.85rem; color: #f43f5e; padding: 10px;">লোড ব্যর্থ হয়েছে: ${e.message}</div>`;
  }
};

BackupApp.ignore.createWorkspaceNodeHtml = function(item) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'workspace-node';
  nodeEl.style.marginLeft = '0px';
  
  const rowEl = document.createElement('div');
  rowEl.className = 'workspace-row';
  rowEl.dataset.relativePath = item.relativePath;
  rowEl.style.display = 'flex';
  rowEl.style.alignItems = 'center';
  rowEl.style.justifyContent = 'space-between';
  rowEl.style.padding = '6px 8px';
  rowEl.style.borderRadius = '4px';
  rowEl.style.marginBottom = '2px';
  rowEl.style.background = 'rgba(255, 255, 255, 0.01)';
  rowEl.style.border = '1px solid transparent';
  rowEl.style.transition = 'all 0.2s';
  
  if (item.isIgnored) {
    rowEl.style.opacity = '0.55';
    rowEl.style.background = 'rgba(244, 63, 94, 0.03)';
    rowEl.style.borderColor = 'rgba(244, 63, 94, 0.1)';
  }

  rowEl.addEventListener('mouseenter', () => {
    rowEl.style.background = 'rgba(255, 255, 255, 0.04)';
    rowEl.style.borderColor = 'rgba(255, 255, 255, 0.04)';
  });
  rowEl.addEventListener('mouseleave', () => {
    rowEl.style.background = item.isIgnored ? 'rgba(244, 63, 94, 0.03)' : 'rgba(255, 255, 255, 0.01)';
    rowEl.style.borderColor = item.isIgnored ? 'rgba(244, 63, 94, 0.1)' : 'transparent';
  });

  const leftSide = document.createElement('div');
  leftSide.style.display = 'flex';
  leftSide.style.alignItems = 'center';
  leftSide.style.gap = '8px';

  const toggleBtn = document.createElement('span');
  toggleBtn.style.display = 'inline-block';
  toggleBtn.style.width = '16px';
  toggleBtn.style.textAlign = 'center';
  toggleBtn.style.cursor = 'pointer';
  toggleBtn.style.fontSize = '0.8rem';
  toggleBtn.style.userSelect = 'none';
  toggleBtn.style.color = '#818cf8';

  if (item.type === 'folder') {
    toggleBtn.innerHTML = '▶';
  } else {
    toggleBtn.innerHTML = '&bull;';
    toggleBtn.style.color = 'rgba(255,255,255,0.2)';
    toggleBtn.style.cursor = 'default';
  }
  leftSide.appendChild(toggleBtn);

  const iconSpan = document.createElement('span');
  iconSpan.style.fontSize = '1rem';
  iconSpan.innerHTML = item.type === 'folder' ? '📁' : '📄';
  leftSide.appendChild(iconSpan);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'node-name';
  nameSpan.textContent = item.name;
  nameSpan.style.fontSize = '0.85rem';
  nameSpan.style.color = '#f1f5f9';
  if (item.isIgnored) {
    nameSpan.style.textDecoration = 'line-through';
    nameSpan.style.color = 'rgba(255,255,255,0.4)';
  }
  leftSide.appendChild(nameSpan);
  rowEl.appendChild(leftSide);

  const rightSide = document.createElement('div');
  rightSide.style.display = 'flex';
  rightSide.style.alignItems = 'center';
  
  if (item.isIgnored) {
    const badge = document.createElement('span');
    badge.className = 'ignored-badge';
    badge.textContent = 'Ignored';
    badge.style.fontSize = '0.65rem';
    badge.style.background = 'rgba(244, 63, 94, 0.15)';
    badge.style.color = '#f43f5e';
    badge.style.border = '1px solid rgba(244, 63, 94, 0.3)';
    badge.style.padding = '2px 6px';
    badge.style.borderRadius = '4px';
    badge.style.marginRight = '8px';
    rightSide.appendChild(badge);
  }

  const ignoreBtn = document.createElement('button');
  ignoreBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 10px; height: 10px; margin-right: 4px; display: inline-block; vertical-align: middle;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg><span style="vertical-align: middle;">Ignore</span>';
  ignoreBtn.style.display = 'inline-flex';
  ignoreBtn.style.alignItems = 'center';
  ignoreBtn.style.fontSize = '0.7rem';
  ignoreBtn.style.padding = '3px 8px';
  ignoreBtn.style.borderRadius = '4px';
  ignoreBtn.style.border = '1px solid rgba(244, 63, 94, 0.3)';
  ignoreBtn.style.background = 'rgba(244, 63, 94, 0.1)';
  ignoreBtn.style.color = '#f43f5e';
  ignoreBtn.style.cursor = 'pointer';
  ignoreBtn.style.transition = 'all 0.2s';
  
  if (item.isIgnored) {
    ignoreBtn.style.opacity = '0.4';
    ignoreBtn.style.cursor = 'not-allowed';
    ignoreBtn.disabled = true;
  } else {
    ignoreBtn.addEventListener('mouseenter', () => {
      ignoreBtn.style.background = '#f43f5e';
      ignoreBtn.style.color = '#fff';
    });
    ignoreBtn.addEventListener('mouseleave', () => {
      ignoreBtn.style.background = 'rgba(244, 63, 94, 0.1)';
      ignoreBtn.style.color = '#f43f5e';
    });
    ignoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      BackupApp.ignore.openOptionsModal(item);
    });
  }
  rightSide.appendChild(ignoreBtn);
  rowEl.appendChild(rightSide);
  nodeEl.appendChild(rowEl);

  if (item.type === 'folder') {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'node-children';
    childrenContainer.style.display = 'none';
    childrenContainer.style.marginLeft = '18px';
    childrenContainer.style.borderLeft = '1px dashed rgba(255, 255, 255, 0.07)';
    childrenContainer.style.paddingLeft = '6px';
    nodeEl.appendChild(childrenContainer);

    let childrenLoaded = false;

    const handleToggle = async (e) => {
      e.stopPropagation();
      const isExpanded = toggleBtn.innerHTML === '▼';
      
      if (isExpanded) {
        toggleBtn.innerHTML = '▶';
        childrenContainer.style.display = 'none';
      } else {
        toggleBtn.innerHTML = '▼';
        childrenContainer.style.display = 'block';
        
        if (!childrenLoaded) {
          childrenContainer.innerHTML = '<div style="font-size: 0.75rem; opacity: 0.5; padding: 4px 10px;">লোড হচ্ছে...</div>';
          try {
            const response = await fetch(`/api/workspace/list?path=${encodeURIComponent(item.relativePath)}`);
            const data = await response.json();
            if (data.success) {
              childrenContainer.innerHTML = '';
              if (data.items.length === 0) {
                childrenContainer.innerHTML = '<div style="font-size: 0.75rem; opacity: 0.4; padding: 4px 10px; font-style: italic;">ফোল্ডারটি ফাঁকা</div>';
              } else {
                data.items.forEach(child => {
                  childrenContainer.appendChild(BackupApp.ignore.createWorkspaceNodeHtml(child));
                });
              }
              childrenLoaded = true;
            } else {
              throw new Error(data.error);
            }
          } catch (err) {
            childrenContainer.innerHTML = `<div style="font-size: 0.75rem; color: #f43f5e; padding: 4px 10px;">এরর: ${err.message}</div>`;
          }
        }
      }
    };

    toggleBtn.addEventListener('click', handleToggle);
    rowEl.addEventListener('dblclick', handleToggle);
  }

  return nodeEl;
};

BackupApp.ignore.openOptionsModal = function(item) {
  activeIgnoreItem = item;
  const modal = BackupApp.elements.ignoreOptionsModal;
  const pathText = BackupApp.elements.selectedIgnorePathText;
  const specificExample = BackupApp.elements.specificPathExampleText;
  const globalExample = BackupApp.elements.globalPatternExampleText;

  if (pathText) pathText.textContent = item.relativePath;

  if (item.type === 'folder') {
    if (specificExample) specificExample.textContent = `${item.relativePath}/`;
    if (globalExample) globalExample.textContent = `**/${item.name}/`;
  } else {
    if (specificExample) specificExample.textContent = `${item.relativePath}`;
    if (globalExample) globalExample.textContent = `**/${item.name}`;
  }

  const radio = document.querySelector('input[name="ignorePatternType"][value="specific"]');
  if (radio) radio.checked = true;
  if (modal) modal.style.display = 'flex';
};

BackupApp.ignore.closeOptionsModal = function() {
  const modal = BackupApp.elements.ignoreOptionsModal;
  if (modal) modal.style.display = 'none';
  activeIgnoreItem = null;
};

BackupApp.ignore.init = function() {
  if (BackupApp.elements.btnSaveIgnore) {
    BackupApp.elements.btnSaveIgnore.addEventListener('click', () => BackupApp.ignore.saveRules(true));
  }

  if (BackupApp.elements.btnCancelIgnoreChanges) {
    BackupApp.elements.btnCancelIgnoreChanges.addEventListener('click', () => {
      BackupApp.utils.logToConsole('Discarding unsaved ignore changes...', 'info');
      BackupApp.ignore.loadRules().then(() => {
        BackupApp.ignore.loadWorkspaceBrowser();
        BackupApp.utils.showToast('পরিবর্তন বাতিল করে পূর্বের অবস্থায় ফিরে যাওয়া হয়েছে।', 'info');
      });
    });
  }

  const btnCancelModal = document.getElementById('btnCancelIgnoreModal');
  if (btnCancelModal) {
    btnCancelModal.addEventListener('click', (e) => {
      e.preventDefault();
      BackupApp.ignore.closeOptionsModal();
    });
  }

  const btnConfirmAdd = document.getElementById('btnConfirmAddIgnore');
  if (btnConfirmAdd) {
    btnConfirmAdd.addEventListener('click', (e) => {
      e.preventDefault();
      if (!activeIgnoreItem) return;

      const patternType = document.querySelector('input[name="ignorePatternType"]:checked').value;
      let rule = '';

      if (patternType === 'specific') {
        rule = activeIgnoreItem.type === 'folder' 
          ? `${activeIgnoreItem.relativePath}/`
          : activeIgnoreItem.relativePath;
      } else {
        rule = activeIgnoreItem.type === 'folder'
          ? `**/${activeIgnoreItem.name}/`
          : `**/${activeIgnoreItem.name}`;
      }

      BackupApp.ignore.addRule(rule);
      BackupApp.ignore.closeOptionsModal();
    });
  }

  document.querySelectorAll('.hint-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pattern = link.getAttribute('data-pattern');
      if (pattern) {
        BackupApp.ignore.addRule(pattern);
      }
    });
  });
};
