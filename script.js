(() => {
  const STORAGE_KEY = "todolist.groups.v1";

  /** @type {{ id: string, name: string, todos: { id: string, text: string, done: boolean }[] }[]} */
  let groups = [];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const groupsContainer = $("#groupsContainer");
  const emptyState = $("#emptyState");
  const groupNameInput = $("#groupNameInput");
  const addGroupBtn = $("#addGroupBtn");
  const groupTpl = $("#groupTemplate");
  const todoTpl = $("#todoTemplate");

  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      groups = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(groups)) groups = [];
    } catch {
      groups = [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  }

  function findGroup(groupId) {
    return groups.find((g) => g.id === groupId);
  }

  // ---------- Render ----------
  function render() {
    groupsContainer.innerHTML = "";
    if (groups.length === 0) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    for (const group of groups) {
      const node = groupTpl.content.firstElementChild.cloneNode(true);
      node.dataset.groupId = group.id;
      $(".group-title", node).textContent = group.name;

      const list = $(".todo-list", node);
      for (const todo of group.todos) {
        list.appendChild(buildTodoNode(todo));
      }

      groupsContainer.appendChild(node);
    }
  }

  function buildTodoNode(todo) {
    const node = todoTpl.content.firstElementChild.cloneNode(true);
    node.dataset.todoId = todo.id;
    $(".todo-text", node).textContent = todo.text;
    const cb = $(".todo-check", node);
    cb.checked = todo.done;
    if (todo.done) node.classList.add("completed");
    return node;
  }

  // ---------- Group CRUD ----------
  function addGroup(name) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    groups.push({ id: uid(), name: trimmed, todos: [] });
    save();
    render();
    return true;
  }

  function renameGroup(groupId, newName) {
    const g = findGroup(groupId);
    if (!g) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    g.name = trimmed;
    save();
  }

  function deleteGroup(groupId) {
    groups = groups.filter((g) => g.id !== groupId);
    save();
    render();
  }

  // ---------- Todo CRUD ----------
  function addTodo(groupId, text) {
    const g = findGroup(groupId);
    if (!g) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    g.todos.push({ id: uid(), text: trimmed, done: false });
    save();
    render();
    return true;
  }

  function updateTodoText(groupId, todoId, newText) {
    const g = findGroup(groupId);
    if (!g) return;
    const t = g.todos.find((x) => x.id === todoId);
    if (!t) return;
    const trimmed = newText.trim();
    if (!trimmed) return;
    t.text = trimmed;
    save();
  }

  function toggleTodo(groupId, todoId, done) {
    const g = findGroup(groupId);
    if (!g) return;
    const t = g.todos.find((x) => x.id === todoId);
    if (!t) return;
    t.done = done;
    save();
  }

  function deleteTodo(groupId, todoId) {
    const g = findGroup(groupId);
    if (!g) return;
    g.todos = g.todos.filter((t) => t.id !== todoId);
    save();
    render();
  }

  function reorderTodo(groupId, fromId, toId, position) {
    const g = findGroup(groupId);
    if (!g || fromId === toId) return;
    const fromIdx = g.todos.findIndex((t) => t.id === fromId);
    if (fromIdx === -1) return;
    const [moved] = g.todos.splice(fromIdx, 1);

    if (toId == null) {
      g.todos.push(moved);
    } else {
      let toIdx = g.todos.findIndex((t) => t.id === toId);
      if (toIdx === -1) {
        g.todos.push(moved);
      } else {
        if (position === "below") toIdx += 1;
        g.todos.splice(toIdx, 0, moved);
      }
    }
    save();
    render();
  }

  // ---------- Event delegation ----------
  addGroupBtn.addEventListener("click", () => {
    if (addGroup(groupNameInput.value)) {
      groupNameInput.value = "";
      groupNameInput.focus();
    }
  });

  groupNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addGroupBtn.click();
    }
  });

  groupsContainer.addEventListener("submit", (e) => {
    if (!e.target.classList.contains("todo-form")) return;
    e.preventDefault();
    const card = e.target.closest(".group-card");
    const input = $(".todo-input", e.target);
    if (addTodo(card.dataset.groupId, input.value)) {
      input.value = "";
      // 포커스 유지를 위해 새로 렌더된 동일 그룹의 입력란 찾기
      const refreshedInput = $(
        `.group-card[data-group-id="${card.dataset.groupId}"] .todo-input`
      );
      refreshedInput?.focus();
    }
  });

  groupsContainer.addEventListener("click", (e) => {
    const target = e.target;
    const card = target.closest(".group-card");
    if (!card) return;
    const groupId = card.dataset.groupId;
    const todoItem = target.closest(".todo-item");
    const todoId = todoItem?.dataset.todoId;

    if (target.classList.contains("btn-delete-group")) {
      if (confirm("이 그룹과 모든 할 일이 삭제됩니다. 진행할까요?")) {
        deleteGroup(groupId);
      }
      return;
    }

    if (target.classList.contains("btn-rename")) {
      const titleEl = $(".group-title", card);
      titleEl.contentEditable = "true";
      titleEl.focus();
      // 텍스트 전체 선택
      const range = document.createRange();
      range.selectNodeContents(titleEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }

    if (target.classList.contains("btn-delete")) {
      deleteTodo(groupId, todoId);
      return;
    }

    if (target.classList.contains("btn-edit")) {
      const textEl = $(".todo-text", todoItem);
      textEl.contentEditable = "true";
      textEl.classList.add("editing");
      textEl.focus();
      const range = document.createRange();
      range.selectNodeContents(textEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
  });

  groupsContainer.addEventListener("change", (e) => {
    if (!e.target.classList.contains("todo-check")) return;
    const todoItem = e.target.closest(".todo-item");
    const card = todoItem.closest(".group-card");
    const done = e.target.checked;
    toggleTodo(card.dataset.groupId, todoItem.dataset.todoId, done);
    todoItem.classList.toggle("completed", done);
  });

  // 그룹명 / 할일 텍스트 인라인 편집 — blur, Enter로 확정
  function commitEdit(el) {
    const card = el.closest(".group-card");
    const groupId = card.dataset.groupId;

    if (el.classList.contains("group-title")) {
      const newName = el.textContent;
      if (!newName.trim()) {
        el.textContent = findGroup(groupId)?.name ?? "";
      } else {
        renameGroup(groupId, newName);
      }
      el.contentEditable = "false";
      return;
    }

    if (el.classList.contains("todo-text")) {
      const todoItem = el.closest(".todo-item");
      const todoId = todoItem.dataset.todoId;
      const newText = el.textContent;
      const orig = findGroup(groupId)?.todos.find((t) => t.id === todoId);
      if (!newText.trim()) {
        el.textContent = orig?.text ?? "";
      } else {
        updateTodoText(groupId, todoId, newText);
      }
      el.contentEditable = "false";
      el.classList.remove("editing");
    }
  }

  groupsContainer.addEventListener(
    "blur",
    (e) => {
      const t = e.target;
      if (
        (t.classList?.contains("group-title") ||
          t.classList?.contains("todo-text")) &&
        t.isContentEditable
      ) {
        commitEdit(t);
      }
    },
    true
  );

  groupsContainer.addEventListener("keydown", (e) => {
    const t = e.target;
    if (
      (t.classList?.contains("group-title") ||
        t.classList?.contains("todo-text")) &&
      t.isContentEditable
    ) {
      if (e.key === "Enter") {
        e.preventDefault();
        t.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        // 원본 복구 후 종료
        const card = t.closest(".group-card");
        const groupId = card.dataset.groupId;
        if (t.classList.contains("group-title")) {
          t.textContent = findGroup(groupId)?.name ?? "";
        } else {
          const todoItem = t.closest(".todo-item");
          const todoId = todoItem.dataset.todoId;
          t.textContent =
            findGroup(groupId)?.todos.find((x) => x.id === todoId)?.text ?? "";
          t.classList.remove("editing");
        }
        t.contentEditable = "false";
      }
    }
  });

  // ---------- Drag & Drop (그룹 내 순서 조정) ----------
  let dragState = null;

  groupsContainer.addEventListener("dragstart", (e) => {
    const item = e.target.closest?.(".todo-item");
    if (!item) return;
    const card = item.closest(".group-card");
    dragState = {
      todoId: item.dataset.todoId,
      groupId: card.dataset.groupId,
    };
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.dataset.todoId);
  });

  groupsContainer.addEventListener("dragend", (e) => {
    const item = e.target.closest?.(".todo-item");
    if (item) item.classList.remove("dragging");
    $$(".drop-target-above, .drop-target-below").forEach((el) =>
      el.classList.remove("drop-target-above", "drop-target-below")
    );
    dragState = null;
  });

  groupsContainer.addEventListener("dragover", (e) => {
    if (!dragState) return;
    const card = e.target.closest?.(".group-card");
    if (!card) return;
    if (card.dataset.groupId !== dragState.groupId) return; // 그룹 간 이동 비허용

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    $$(".drop-target-above, .drop-target-below", card).forEach((el) =>
      el.classList.remove("drop-target-above", "drop-target-below")
    );

    const overItem = e.target.closest?.(".todo-item");
    if (overItem && overItem.dataset.todoId !== dragState.todoId) {
      const rect = overItem.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      if (offsetY < rect.height / 2) {
        overItem.classList.add("drop-target-above");
      } else {
        overItem.classList.add("drop-target-below");
      }
    }
  });

  groupsContainer.addEventListener("drop", (e) => {
    if (!dragState) return;
    const card = e.target.closest?.(".group-card");
    if (!card || card.dataset.groupId !== dragState.groupId) return;
    e.preventDefault();

    const overItem = e.target.closest?.(".todo-item");
    if (!overItem || overItem.dataset.todoId === dragState.todoId) {
      // 빈 공간 드롭 → 맨 끝
      reorderTodo(dragState.groupId, dragState.todoId, null);
      return;
    }

    const rect = overItem.getBoundingClientRect();
    const position = e.clientY - rect.top < rect.height / 2 ? "above" : "below";
    reorderTodo(
      dragState.groupId,
      dragState.todoId,
      overItem.dataset.todoId,
      position
    );
  });

  // ---------- Init ----------
  load();
  render();

  // 디버깅 / 자동화 테스트용 훅
  window.__todoApp = {
    getState: () => JSON.parse(JSON.stringify(groups)),
    reset: () => {
      groups = [];
      save();
      render();
    },
    addGroup,
    addTodo,
    deleteGroup,
    deleteTodo,
    reorderTodo,
    updateTodoText,
    renameGroup,
    toggleTodo,
  };
})();
