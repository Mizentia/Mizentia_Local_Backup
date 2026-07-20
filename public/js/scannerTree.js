BackupApp.scanner.buildHierarchy = function(changes) {
  const root = { name: 'Root', type: 'folder', children: {}, path: '' };

  const list = [];
  if (changes.added) changes.added.forEach(f => list.push({ ...f, changeType: 'add' }));
  if (changes.modified) changes.modified.forEach(f => list.push({ ...f, changeType: 'modify' }));
  if (changes.deleted) changes.deleted.forEach(f => list.push({ ...f, changeType: 'delete' }));
  if (changes.renamed) changes.renamed.forEach(f => list.push({ ...f, changeType: 'rename', relativePath: f.newPath }));

  for (const item of list) {
    if (BackupApp.state.currentFilter !== 'all' && item.changeType !== BackupApp.state.currentFilter) {
      continue;
    }

    const parts = item.relativePath.split('/');
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = (i === parts.length - 1) && (item.type === 'file' || !item.type);

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          children: isFile ? null : {},
          item: null
        };
      }
      if (i === parts.length - 1) {
        current.children[part].item = item;
        current.children[part].type = item.type || 'file';
      }
      current = current.children[part];
    }
  }
  return root;
};

BackupApp.scanner.renderTree = function(changes) {
  const hierarchy = BackupApp.scanner.buildHierarchy(changes);
  BackupApp.elements.scanTreeBody.innerHTML = '';
  
  const childrenKeys = Object.keys(hierarchy.children);
  if (childrenKeys.length === 0) {
    BackupApp.elements.scanTreeBody.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
        <h3>কোন পরিবর্তন পাওয়া যায়নি</h3>
        <p>এই ফিল্টারের অধীনে কোন ফাইল তালিকাভুক্ত নেই।</p>
      </div>
    `;
    return;
  }

  const treeList = document.createElement('div');
  treeList.className = 'tree-nodes-wrapper';

  function createNodeHtml(node) {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'tree-node';

    const rowEl = document.createElement('div');
    rowEl.className = 'node-row';
    rowEl.dataset.path = node.path;
    rowEl.dataset.type = node.type;

    if (node.type === 'folder') {
      const toggleEl = document.createElement('span');
      toggleEl.className = 'node-toggle';
      toggleEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
      rowEl.appendChild(toggleEl);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'node-toggle';
      rowEl.appendChild(spacer);
    }

    const labelContainer = document.createElement('label');
    labelContainer.className = 'checkbox-container';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.path = node.path;
    checkbox.dataset.nodeType = node.type;
    checkbox.checked = BackupApp.state.selectedItems.has(node.path);
    
    const checkMark = document.createElement('span');
    checkMark.className = 'checkbox-mark';
    
    labelContainer.appendChild(checkbox);
    labelContainer.appendChild(checkMark);
    rowEl.appendChild(labelContainer);

    const iconEl = document.createElement('span');
    iconEl.className = 'node-icon';
    if (node.type === 'folder') {
      iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
      iconEl.style.color = '#f59e0b';
    } else {
      iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
      iconEl.style.color = '#818cf8';
    }
    rowEl.appendChild(iconEl);

    const labelText = document.createElement('span');
    labelText.className = 'node-label';
    labelText.textContent = node.name;
    rowEl.appendChild(labelText);

    if (node.item) {
      const badge = document.createElement('span');
      badge.className = `badge node-badge`;
      
      const type = node.item.changeType;
      if (type === 'add') {
        badge.classList.add('badge-add');
        badge.textContent = 'NEW';
      } else if (type === 'modify') {
        badge.classList.add('badge-modify');
        badge.textContent = 'MODIFIED';
      } else if (type === 'delete') {
        badge.classList.add('badge-delete');
        badge.textContent = 'DELETED';
      } else if (type === 'rename') {
        badge.classList.add('badge-rename');
        badge.textContent = 'MOVED';
        
        const renameDetail = document.createElement('span');
        renameDetail.className = 'node-meta';
        renameDetail.style.color = 'var(--text-muted)';
        renameDetail.style.marginLeft = '8px';
        renameDetail.style.fontSize = '0.75rem';
        renameDetail.textContent = `(from ${node.item.oldPath})`;
        rowEl.appendChild(renameDetail);
      }
      rowEl.appendChild(badge);
    }

    nodeEl.appendChild(rowEl);

    if (node.type === 'folder') {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'node-children';
      childrenContainer.style.display = 'none';
      
      for (const childKey in node.children) {
        childrenContainer.appendChild(createNodeHtml(node.children[childKey]));
      }
      nodeEl.appendChild(childrenContainer);

      rowEl.querySelector('.node-label').addEventListener('click', () => {
        const toggle = rowEl.querySelector('.node-toggle');
        const isExpanded = toggle.classList.contains('expanded');
        toggle.classList.toggle('expanded', !isExpanded);
        childrenContainer.style.display = isExpanded ? 'none' : 'block';
      });
      
      rowEl.querySelector('.node-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        const toggle = rowEl.querySelector('.node-toggle');
        const isExpanded = toggle.classList.contains('expanded');
        toggle.classList.toggle('expanded', !isExpanded);
        childrenContainer.style.display = isExpanded ? 'none' : 'block';
      });
    }

    checkbox.addEventListener('change', () => {
      const isChecked = checkbox.checked;
      
      if (node.type === 'folder') {
        const childCheckboxes = nodeEl.querySelectorAll('.node-children input[type="checkbox"]');
        childCheckboxes.forEach(cb => {
          cb.checked = isChecked;
          if (isChecked) {
            BackupApp.state.selectedItems.add(cb.dataset.path);
          } else {
            BackupApp.state.selectedItems.delete(cb.dataset.path);
          }
        });
      }
      
      if (isChecked) {
        BackupApp.state.selectedItems.add(node.path);
      } else {
        BackupApp.state.selectedItems.delete(node.path);
      }

      BackupApp.scanner.updateParentCheckboxState(nodeEl);
      BackupApp.scanner.updateSelectedCounter();
    });

    return nodeEl;
  }

  for (const key in hierarchy.children) {
    treeList.appendChild(createNodeHtml(hierarchy.children[key]));
  }
  BackupApp.elements.scanTreeBody.appendChild(treeList);
  BackupApp.elements.scannerFooter.style.display = 'flex';
};

BackupApp.scanner.updateParentCheckboxState = function(nodeEl) {
  const parentNode = nodeEl.parentElement.closest('.tree-node');
  if (!parentNode) return;

  const parentCheckbox = parentNode.querySelector(':scope > .node-row input[type="checkbox"]');
  const siblingCheckboxes = parentNode.querySelectorAll(':scope > .node-children > .tree-node > .node-row input[type="checkbox"]');
  
  let allChecked = true;
  let anyChecked = false;

  siblingCheckboxes.forEach(cb => {
    if (cb.checked) anyChecked = true;
    else allChecked = false;
  });

  parentCheckbox.checked = allChecked;
  if (allChecked) {
    BackupApp.state.selectedItems.add(parentCheckbox.dataset.path);
  } else {
    BackupApp.state.selectedItems.delete(parentCheckbox.dataset.path);
  }

  BackupApp.scanner.updateParentCheckboxState(parentNode);
};

BackupApp.scanner.updateSelectedCounter = function() {
  let fileCount = 0;
  let folderCount = 0;
  BackupApp.state.selectedItems.forEach(path => {
    const addedItem = BackupApp.state.scanResults.changes.added.find(f => f.relativePath === path);
    const modifiedItem = BackupApp.state.scanResults.changes.modified.find(f => f.relativePath === path);
    const deletedItem = BackupApp.state.scanResults.changes.deleted.find(f => f.relativePath === path);
    const renamedItem = BackupApp.state.scanResults.changes.renamed.find(f => f.newPath === path || f.relativePath === path);
    
    const item = addedItem || modifiedItem || deletedItem || renamedItem;
    if (item) {
      if (item.type === 'folder') {
        folderCount++;
      } else {
        fileCount++;
      }
    }
  });

  let text = '';
  if (fileCount > 0 && folderCount > 0) {
    text = `${fileCount} টি ফাইল এবং ${folderCount} টি ফোল্ডার সিলেক্ট করা হয়েছে`;
  } else if (fileCount > 0) {
    text = `${fileCount} টি ফাইল সিলেক্ট করা হয়েছে`;
  } else if (folderCount > 0) {
    text = `${folderCount} টি ফোল্ডার সিলেক্ট করা হয়েছে`;
  } else {
    text = `0 টি আইটেম সিলেক্ট করা হয়েছে`;
  }

  BackupApp.elements.selectedCountText.textContent = text;
  BackupApp.elements.btnExecuteBackup.disabled = (fileCount === 0 && folderCount === 0);
};
