const $ = (s) => document.querySelector(s);

const state = {
  characters: [],
  defaultCharacter: { reactions: {}, lines: {} },
  actors: [],
  actions: [],
  targets: [],
  pools: {},
  scenes: {},
  actorName: "",
  target: null
};

const els = {
  setup: $("#setup"),
  game: $("#game"),
  actorSelect: $("#actorSelect"),
  customActorWrap: $("#customActorWrap"),
  customActorInput: $("#customActorInput"),
  targetSelect: $("#targetSelect"),
  startBtn: $("#startBtn"),
  story: $("#story"),
  actionSelect: $("#actionSelect"),
  dynamicFields: $("#dynamicFields"),
  preview: $("#preview"),
  doBtn: $("#doBtn"),
  randomBtn: $("#randomBtn")
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(path);
  return res.json();
}

async function init() {
  try {
    const [charactersData, actors, actions, targets, pools, scenes] = await Promise.all([
      loadJson("./data/characters.json"),
      loadJson("./data/actors.json"),
      loadJson("./data/actions.json"),
      loadJson("./data/targets.json"),
      loadJson("./data/pools.json"),
      loadJson("./data/scenes.json")
    ]);

    // Новый формат characters.json:
    // { "default": {...}, "characters": [...] }
    // Старый формат-массив тоже поддерживаем, чтобы ничего не падало.
    if (Array.isArray(charactersData)) {
      state.characters = charactersData.filter(c => c.id !== "default");
      state.defaultCharacter = charactersData.find(c => c.id === "default") || { reactions: {}, lines: {} };
    } else {
      state.characters = charactersData.characters || [];
      state.defaultCharacter = charactersData.default || { reactions: {}, lines: {} };
    }

    state.actors = actors;
    state.actions = actions;
    state.targets = targets;
    state.pools = pools;
    state.scenes = scenes;

    fillSetup();
    fillActions();
    bind();
    renderFields();
    updatePreview();
  } catch (e) {
    document.body.innerHTML = `<main><h1>json не загрузился</h1><p>запусти через локальный сервер: <code>python3 -m http.server 8000</code></p><pre>${e}</pre></main>`;
  }
}

function fillSetup() {
  // custom может лежать первым в actors.json, но в UI пусть всегда будет последним
  const sortedActors = [
    ...state.actors.filter(a => a.id !== "custom"),
    ...state.actors.filter(a => a.id === "custom")
  ];

  els.actorSelect.innerHTML = sortedActors
    .map(a => `<option value="${a.id}">${a.name}</option>`)
    .join("");

  els.targetSelect.innerHTML = state.characters
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join("");

  // по умолчанию выбираем первого НЕ custom актора
  els.actorSelect.value = sortedActors[0]?.id || "custom";

  // важно: если значение выставлено кодом, change сам не сработает
  els.customActorWrap.hidden = els.actorSelect.value !== "custom";

  els.targetSelect.value = "grimmjow";
}

function fillActions() {
  els.actionSelect.innerHTML = state.actions
    .map(a => `<option value="${a.id}">${a.label}</option>`)
    .join("");
}

function bind() {
  els.actorSelect.addEventListener("change", () => {
    els.customActorWrap.hidden = els.actorSelect.value !== "custom";
  });

  els.startBtn.addEventListener("click", startStory);

  els.actionSelect.addEventListener("change", () => {
    renderFields();
    updatePreview();
  });

  els.dynamicFields.addEventListener("input", updatePreview);
  els.dynamicFields.addEventListener("change", updatePreview);

  els.doBtn.addEventListener("click", doTurn);
  els.randomBtn.addEventListener("click", randomizeAction);
}

function getCharacter(id) {
  return state.characters.find(c => c.id === id);
}

function getAction() {
  return state.actions.find(a => a.id === els.actionSelect.value);
}

function startStory() {
  state.actorName = getActorNameFromSetup();
  state.target = getCharacter(els.targetSelect.value);

  els.setup.hidden = true;
  els.game.hidden = false;

  addLine(makeSceneLine(), "scene");
  updatePreview();
}

function getActorNameFromSetup() {
  if (els.actorSelect.value === "custom") {
    return els.customActorInput.value.trim() || "Кто-то";
  }

  const selected = state.actors.find(a => a.id === els.actorSelect.value);
  return selected?.name || "Кто-то";
}

function makeSceneLine() {
  const action = pick(state.scenes.actions);
  const place = pick(state.scenes.places);
  return `${state.actorName} видит ${state.target.acc}, ${state.target.relative} ${action} ${place}.`;
}

function addLine(text, className = "") {
  const p = document.createElement("p");
  p.className = `story-line ${className}`;
  p.textContent = text;
  els.story.appendChild(p);
}

function addReaction(text) {
  const p = document.createElement("p");
  p.className = "story-line reaction";
  p.textContent = text;
  els.story.appendChild(p);
}

function renderFields() {
  const action = getAction();

  els.dynamicFields.innerHTML = action.fields.map(field => {
    if (field.type === "text") {
      return `
        <p>
          <label>
            ${field.label}<br>
            <textarea data-name="${field.name}" placeholder="можно пустым, тогда будет рандом"></textarea>
          </label>
        </p>
      `;
    }

    if (field.type === "object") {
      const options = state.targets
        .filter(t => field.tags.every(tag => t.tags.includes(tag)))
        .map(t => `<option value="${t.id}">${t.nom}</option>`)
        .join("");

      return `
        <p>
          <label>
            ${field.label}<br>
            <select data-name="${field.name}" data-kind="object">${options}</select>
          </label>
        </p>
        <p>
          <label>
            свой вариант целиком:<br>
            <input data-name="${field.name}Custom" placeholder="например: за рукав / по драме / в лоб">
          </label>
        </p>
      `;
    }

    if (field.type === "poolOrCustom") {
      const options = state.pools[field.source]
        .map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
        .join("");

      return `
        <p>
          <label>
            ${field.label}<br>
            <select data-name="${field.name}">${options}</select>
          </label>
        </p>
        <p>
          <label>
            свой вариант:<br>
            <input data-name="${field.name}Custom">
          </label>
        </p>
      `;
    }

    return "";
  }).join("");
}

function getFieldValues(action) {
  const values = {};

  for (const field of action.fields) {
    if (field.type === "text") {
      const el = els.dynamicFields.querySelector(`[data-name="${field.name}"]`);
      values[field.name] = el.value.trim() || pick(state.pools.defaultSpeech);
      continue;
    }

    if (field.type === "object") {
      const custom = els.dynamicFields.querySelector(`[data-name="${field.name}Custom"]`).value.trim();

      if (custom) {
        values.objectPhrase = custom;
        continue;
      }

      const select = els.dynamicFields.querySelector(`[data-name="${field.name}"]`);
      const object = state.targets.find(t => t.id === select.value);
      const override = object.actionOverrides?.[action.id] || {};
      const prep = override.preposition ?? field.preposition ?? "";
      const grammaticalCase = override.case ?? field.case ?? "acc";
      const word = object[grammaticalCase];

      values.objectPhrase = prep ? `${prep} ${word}` : word;
      continue;
    }

    if (field.type === "poolOrCustom") {
      const select = els.dynamicFields.querySelector(`[data-name="${field.name}"]`);
      const custom = els.dynamicFields.querySelector(`[data-name="${field.name}Custom"]`).value.trim();
      values[field.name] = custom || select.value;
    }
  }

  return values;
}

function buildSentence() {
  const action = getAction();
  const values = getFieldValues(action);

  return action.template
    .replaceAll("{actor}", state.actorName || "Кто-то")
    .replaceAll("{verb}", action.verb)
    .replaceAll("{targetAcc}", state.target?.acc || "")
    .replaceAll("{targetDat}", state.target?.dat || "")
    .replaceAll("{objectPhrase}", values.objectPhrase || "")
    .replaceAll("{text}", values.text || "")
    .replaceAll("{item}", values.item || "")
    .replaceAll("{place}", values.place || "")
    .replaceAll("{manner}", values.manner || "")
    .replace(/\s+/g, " ")
    .trim();
}

function updatePreview() {
  if (!state.target) {
    els.preview.textContent = "";
    return;
  }

  els.preview.textContent = buildSentence();
}

function doTurn() {
  const action = getAction();
  const sentence = buildSentence();

  addLine(sentence, "action");

  const reactions = getMergedPool("reactions", action.reactionType);
  const lines = getMergedPool("lines", action.reactionType);

  addReaction(`${state.target.name} ${pick(reactions)}
«${pick(lines)}»`);

  const nextMove = pick(state.pools.nextMoves);
  const outcome = pick(state.pools.outcomes);

  addLine(`${outcome}`, "small");
  addLine(`${state.target.name} ${nextMove}.`, "scene");

  renderFields();
  updatePreview();
}

function getMergedPool(section, reactionType) {
  const defaultSection = state.defaultCharacter?.[section] || {};
  const targetSection = state.target?.[section] || {};

  const defaultPool = defaultSection[reactionType] || defaultSection.presence || [];
  const targetPool = targetSection[reactionType] || [];

  const merged = [...defaultPool, ...targetPool];
  return merged.length ? merged : [section === "lines" ? "..." : "реагирует неопределённо."];
}

function randomizeAction() {
  const action = pick(state.actions);
  els.actionSelect.value = action.id;
  renderFields();

  for (const field of action.fields) {
    if (field.type === "text") {
      const el = els.dynamicFields.querySelector(`[data-name="${field.name}"]`);
      el.value = pick(state.pools.defaultSpeech);
      continue;
    }

    if (field.type === "object") {
      const select = els.dynamicFields.querySelector(`[data-name="${field.name}"]`);
      const options = Array.from(select.options);
      select.value = pick(options).value;
      continue;
    }

    if (field.type === "poolOrCustom") {
      const select = els.dynamicFields.querySelector(`[data-name="${field.name}"]`);
      const options = Array.from(select.options);
      select.value = pick(options).value;
    }
  }

  updatePreview();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

init();
