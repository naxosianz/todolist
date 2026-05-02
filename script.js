import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAKDXOs3S5wkKMDyWGsK7XmzOop7VfdjPA",
  authDomain: "naxosian-ab99d.firebaseapp.com",
  databaseURL: "https://naxosian-ab99d-default-rtdb.firebaseio.com",
  projectId: "naxosian-ab99d",
  storageBucket: "naxosian-ab99d.firebasestorage.app",
  messagingSenderId: "320344615893",
  appId: "1:320344615893:web:680566659cb0c5b0c22b5c",
  measurementId: "G-L3X43YXMR2",
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);
const auth = getAuth(app);
const db = getDatabase(app);

let userRef = null;
let listenerAttached = false;
let currentUid = null;

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

function findGroup(groupId) {
  return groups.find((g) => g.id === groupId);
}

async function persist() {
  if (!userRef) {
    console.warn("[Firebase] persist skipped — auth not ready");
    return;
  }
  try {
    await set(userRef, { groups, updatedAt: Date.now() });
  } catch (e) {
    console.error("[Firebase] write failed:", e);
    alert(
      "저장에 실패했어요.\n\nFirebase Realtime Database 규칙(Rules)이 사용자 UID로 설정되지 않았을 수 있어요. 콘솔의 자세한 오류를 확인해 주세요."
    );
  }
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
  render();
  persist();
  return true;
}

function renameGroup(groupId, newName) {
  const g = findGroup(groupId);
  if (!g) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  g.name = trimmed;
  persist();
}

function deleteGroup(groupId) {
  groups = groups.filter((g) => g.id !== groupId);
  render();
  persist();
}

// ---------- Todo CRUD ----------
function addTodo(groupId, text) {
  const g = findGroup(groupId);
  if (!g) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!Array.isArray(g.todos)) g.todos = [];
  g.todos.push({ id: uid(), text: trimmed, done: false });
  render();
  persist();
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
  persist();
}

function toggleTodo(groupId, todoId, done) {
  const g = findGroup(groupId);
  if (!g) return;
  const t = g.todos.find((x) => x.id === todoId);
  if (!t) return;
  t.done = done;
  persist();
}

function deleteTodo(groupId, todoId) {
  const g = findGroup(groupId);
  if (!g) return;
  g.todos = g.todos.filter((t) => t.id !== todoId);
  render();
  persist();
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
  render();
  persist();
}

// ---------- Auth + Realtime sync ----------
// 페이지 로드 시 익명 로그인 → uid 확보 → 자기 영역에만 read/write.
// 같은 브라우저는 캐시된 uid를 유지(영구). 데이터 삭제·다른 브라우저는 새 uid.
function attachListenerOnce() {
  if (listenerAttached || !userRef) return;
  listenerAttached = true;
  onValue(
    userRef,
    (snap) => {
      const data = snap.val();
      const remoteGroups = Array.isArray(data?.groups) ? data.groups : [];
      for (const g of remoteGroups) {
        if (!Array.isArray(g.todos)) g.todos = [];
      }
      groups = remoteGroups;
      render();
    },
    (err) => {
      console.error("[Firebase] read failed:", err);
      alert(
        "데이터를 불러오지 못했어요.\n\nDatabase Rules가 사용자 UID 기반으로 설정되었는지 확인해 주세요."
      );
    }
  );
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch((err) => {
      console.error("[Firebase] anonymous sign-in failed:", err);
      alert(
        "로그인에 실패했어요.\n\nFirebase Console에서 Authentication → Sign-in method → Anonymous를 활성화해 주세요.\n\n" +
          (err?.message ?? "")
      );
    });
    return;
  }
  if (currentUid === user.uid) return; // 동일 uid 재호출 시 노옵
  currentUid = user.uid;
  userRef = ref(db, `users/${user.uid}/state`);
  attachListenerOnce();
});

// ---------- Event delegation ----------
addGroupBtn.addEventListener("click", () => {
  if (addGroup(groupNameInput.value)) {
    groupNameInput.value = "";
    groupNameInput.focus();
  }
});

groupNameInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  // 한글 IME 조합 중 Enter는 조합 확정용이므로 무시 (이중 입력 방지)
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  addGroupBtn.click();
});

groupsContainer.addEventListener("submit", (e) => {
  if (!e.target.classList.contains("todo-form")) return;
  e.preventDefault();
  const card = e.target.closest(".group-card");
  const input = $(".todo-input", e.target);
  if (addTodo(card.dataset.groupId, input.value)) {
    input.value = "";
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

  // 할일 input: IME 조합 중 Enter는 form submit을 발생시키지 않도록 차단
  if (
    e.key === "Enter" &&
    (e.isComposing || e.keyCode === 229) &&
    t.classList?.contains("todo-input")
  ) {
    e.preventDefault();
    return;
  }

  if (
    (t.classList?.contains("group-title") ||
      t.classList?.contains("todo-text")) &&
    t.isContentEditable
  ) {
    if (e.key === "Enter") {
      // IME 조합 중 Enter는 무시 (조합 확정만 하고 편집 종료는 안 함)
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      t.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
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

// ---------- Drag & Drop ----------
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
  if (card.dataset.groupId !== dragState.groupId) return;

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

// 디버깅 / 자동화 테스트용 훅
window.__todoApp = {
  getState: () => JSON.parse(JSON.stringify(groups)),
  getUid: () => currentUid,
  reset: () => {
    groups = [];
    render();
    persist();
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
