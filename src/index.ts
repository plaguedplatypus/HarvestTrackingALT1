import * as a1lib from "alt1";
import ChatboxReader from "alt1/chatbox";

import "./index.html";
import "./appconfig.json";
import "./css/style.css";
import "./icon.png";

type SkillType =
	| "all"
	| "mining"
	| "woodcutting"
	| "fishing"
	| "archaeology"
	| "seren"
	| "other";

type TrackedItem = {
    count: number;
    goal: number | null;
    settingsOpen: boolean;
    skill?: SkillType;
    colorClass?: string;
    lastUpdated?: number;
};

type SaveData = {
    chat?: string;
    activeTab?: SkillType;
    items: Record<string, TrackedItem>;
    history: string[];
};

const appName = "GatheringTracker";
const appColor = a1lib.mixColor(0, 255, 0);
const timestampRegex = /\[\d{2}:\d{2}:\d{2}\]/g;
const reader = new ChatboxReader();

function getTimeStamp() {
	return new Date().toLocaleTimeString("en-US", {
		hour12: false,
	});
}

function setStatus(message: string) {
	status.innerText = `${message} @ ${getTimeStamp()}`;
}
let activeSkillTab: SkillType = "all";
let sortMode = "recent";

const appCog = document.querySelector(".app-cog") as HTMLElement;
const appSettingsPanel = document.querySelector(".app-settings-panel") as HTMLElement;
const chatSelector = document.querySelector(".chat") as HTMLSelectElement;
const tracker = document.querySelector(".tracker") as HTMLElement;
const status = document.querySelector(".status") as HTMLElement;
const clearButton = document.querySelector(".clear") as HTMLElement;
const exportButton = document.querySelector(".export") as HTMLElement;
const importInput = document.querySelector(".import") as HTMLInputElement;

const savedData = getSaveData();
activeSkillTab = savedData.activeTab || "all";

document.querySelectorAll(".skill-tab").forEach((btn) => {
	btn.classList.remove("active");
});

function updateClearButtonLabel() {
	clearButton.innerText =
		activeSkillTab === "all"
			? "Clear All"
			: `Clear ${titleCase(activeSkillTab)}`;
}

const savedTabButton = document.querySelector(
	`.skill-tab[data-skill="${activeSkillTab}"]`
);

if (savedTabButton) {
	savedTabButton.classList.add("active");
}

reader.readargs = {
	colors: [
		a1lib.mixColor(255, 255, 255),
		a1lib.mixColor(230, 230, 230),
		a1lib.mixColor(200, 200, 200),
		a1lib.mixColor(255, 255, 0),
		a1lib.mixColor(0, 255, 255),
		a1lib.mixColor(127, 169, 255),
		a1lib.mixColor(255, 153, 0),
		a1lib.mixColor(255, 128, 0),
		a1lib.mixColor(255, 102, 0),

		// Blessing / component orange text
		a1lib.mixColor(255, 153, 0),
		a1lib.mixColor(255, 128, 0),
		a1lib.mixColor(255, 102, 0),
	],
};

if (window.alt1) {
	alt1.identifyAppUrl("./appconfig.json");
} else {
	const addappurl = `alt1://addapp/${new URL("./appconfig.json", document.location.href).href}`;
	status.innerHTML = `Alt1 not detected. <a href='${addappurl}'>Add this app to Alt1</a>`;
}

window.setTimeout(function () {
	if (!window.alt1) {
		render();
		return;
	}

	reader.find();

	const findChat = setInterval(function () {
		if (reader.pos === null) {
			reader.find();
			status.innerText = "Looking for chatbox...";
			return;
		}

		clearInterval(findChat);
		populateChatSelector();
		selectSavedChat();
		showSelectedChat(reader.pos);
		status.innerText = "Chat found. Tracking started.";
		render();

		setInterval(function () {
			readChatbox();
		}, 600);
	}, 1000);
}, 50);

const redBlessingItems = [
	"precious components",
	"fortunate components"
];

function populateChatSelector() {
	chatSelector.innerHTML = `<option value="">Select Chat</option>`;

	reader.pos.boxes.forEach((_box, i) => {
		chatSelector.insertAdjacentHTML("beforeend", `<option value="${i}">Chat ${i}</option>`);
	});

	chatSelector.addEventListener("change", function () {
		if (this.value === "") return;

		reader.pos.mainbox = reader.pos.boxes[Number(this.value)];
		showSelectedChat(reader.pos);

		const data = getSaveData();
		data.chat = this.value;
		saveData(data);

		status.innerText = `Using Chat ${this.value}.`;
	});
}

function selectSavedChat() {
	const data = getSaveData();
	const savedChat = data.chat || "0";

	reader.pos.mainbox = reader.pos.boxes[Number(savedChat)] || reader.pos.boxes[0];
	chatSelector.value = savedChat;

	data.chat = savedChat;
	saveData(data);
}

function readChatbox() {
	const opts = reader.read() || [];
	const chatArr = processChat(opts);

	for (const line of chatArr) {
		const chatLine = line.trim();
		if (!chatLine) continue;
		if (isInHistory(chatLine)) continue;

			updateChatHistory(chatLine);
			processHarvestLine(chatLine);
	}
}

function processChat(opts: any[]) {
	let chatStr = "";

	if (opts.length !== 0) {
		for (const line in opts) {
			if (!opts[line].text.match(timestampRegex) && line === "0") {
				continue;
			}

			if (opts[line].text.match(timestampRegex)) {
				if (Number(line) > 0) chatStr += "\n";
				chatStr += opts[line].text + " ";
				continue;
			}

			chatStr += opts[line].text;
		}
	}

	if (chatStr.trim() === "") return [];

	return chatStr
		.trim()
		.split("\n")
		.map((line) => line.trim());
}

function processHarvestLine(chatLine: string) {
	const cleanLine = chatLine.replace(timestampRegex, "").trim();

	const serenMatch = cleanLine.match(
		/The Seren spirit gifts you:\s*(\d+)\s*x\s*(.+?)\./i
	);

	if (serenMatch) {
		const amount = parseInt(serenMatch[1], 10);
		const item = normalizeItemName(serenMatch[2]);

		if (!item || isNaN(amount)) return;

		incrementItem(item, amount, "seren", "seren-item");
		setStatus(`Seren Spirit: ${amount} x ${item}`);
		return;
	}

		const blessingMatch = cleanLine.match(
			/Materials gained:\s*(\d+)\s*x\s*([A-Za-z\s-]+components)\.?/i
		);

	if (blessingMatch) {
		const amount = parseInt(blessingMatch[1], 10);
		const item = normalizeItemName(blessingMatch[2]);

		if (!item || isNaN(amount)) return;

		const redBlessingItems = [
			"precious components",
			"fortunate components"
		];

		const colorClass = redBlessingItems.includes(item)
			? "blessing-item-red"
			: "blessing-item-orange";

		incrementItem(item, amount, "seren", colorClass);
		setStatus(`Blessing: ${amount} x ${item}`);
		return;
	}

	const transportMatch = cleanLine.match(
		/You transport to your\s+(.+?):\s*(\d+)\s*x\s*(.+?)\.?$/i
	);

	if (transportMatch) {
		const destination = transportMatch[1].toLowerCase();
		const amount = parseInt(transportMatch[2], 10);
		const item = normalizeItemName(transportMatch[3]);

		if (!item || isNaN(amount)) return;

		let skill: SkillType = "other";

		if (destination.includes("metal bank")) {
			skill = "mining";
		} else if (destination.includes("material storage")) {
			skill = "archaeology";
		} else if (destination.includes("bank")) {
			skill = getSkillForItem(item);
		}

		incrementItem(item, amount, skill);
		setStatus(`Tracked: ${amount} x ${item}`);
		return;
	}

	const boonMetalBankMatch = cleanLine.match(
		/sent it to your metal bank:\s*(\d+)\s*x\s*(.+?)\./i
	);

	if (boonMetalBankMatch) {
		const amount = parseInt(boonMetalBankMatch[1], 10);
		const item = normalizeItemName(boonMetalBankMatch[2]);

		if (!item || isNaN(amount)) return;

		incrementItem(item, amount, "mining");
		setStatus(`Tracked: ${amount} x ${item}`);
		return;
	}

	const skillPatterns: Array<{
		pattern: RegExp;
		skill: SkillType;
	}> = [
		{ pattern: /You manage to mine some (.+?)\./i, skill: "mining" },
		{ pattern: /You mine (?:some |an? )?(.+?)\./i, skill: "mining" },

		{ pattern: /You get some (bamboo |logs|.+? logs)\./i, skill: "woodcutting" },
		{ pattern: /You cut (?:some |an? )?(.+?)\./i, skill: "woodcutting" },
		{ pattern: /You successfully cut (?:some |an? )?(.+?)\./i, skill: "woodcutting" },
		{ pattern: /You chop (?:some |an? )?(.+?)\./i, skill: "woodcutting" },

		//{ pattern: /You catch a[n]? (.+?)\./i, skill: "fishing" },
		//{ pattern: /You catch some (.+?)\./i, skill: "fishing" },

		{ pattern: /You find (?:a|an|some) (.+?)\./i, skill: "archaeology" },
	];

	for (const entry of skillPatterns) {
		const match = cleanLine.match(entry.pattern);
		if (!match) continue;

		const item = normalizeItemName(match[1]);
		if (!item) return;

		incrementItem(item, 1, entry.skill);
		setStatus(`Tracked: ${item}`);
		return;
	}
}

function getSkillForItem(item: string): SkillType {
	if (item.includes("ore")) return "mining";
	if (item.includes("logs")) return "woodcutting";
	if (item.includes("raw ") || item.includes("lobster") || item.includes("tuna") || item.includes("shark") || item.includes("sailfish")) return "fishing";

	return "other";
}

function normalizeItemName(item: string) {
	return item
		.toLowerCase()
		.replace(/\.$/, "")
		.trim();
}

function getSaveData(): SaveData {
	const raw = localStorage.getItem(appName);

	if (!raw) {
		return {
			items: {},
			history: [],
		};
	}

	try {
		const data = JSON.parse(raw);
		return {
			chat: data.chat,
			activeTab: data.activeTab || "all",
			items: data.items || {},
			history: data.history || [],
		};
	} catch {
		return {
			items: {},
			history: [],
		};
	}
}

function saveData(data: SaveData) {
	localStorage.setItem(appName, JSON.stringify(data));
}

function ensureItem(data: SaveData, item: string) {
	if (!data.items[item]) {
		data.items[item] = {
			count: 0,
			goal: null,
			settingsOpen: false,
		};
	}
}

function incrementItem(
	item: string,
	amount: number = 1,
	skill: SkillType = "other",
	colorClass?: string
) {
	const data = getSaveData();
	ensureItem(data, item);
	data.items[item].count += amount;
	data.items[item].skill = skill;
	data.items[item].lastUpdated = Date.now();

	if (colorClass) {
		data.items[item].colorClass = colorClass;
	}

	saveData(data);
	render(item);
}

let recentLines: string[] = [];

function isInHistory(chatLine: string) {
	return recentLines.includes(chatLine);
}

function updateChatHistory(chatLine: string) {
	recentLines.push(chatLine);

	if (recentLines.length > 300) {
		recentLines = recentLines.slice(-300);
	}
}

function render(highlightItem?: string) {
	const data = getSaveData();
	const items = Object.keys(data.items)
	.filter((item) => {
		if (activeSkillTab === "all") return true;
		return (data.items[item].skill || "other") === activeSkillTab;
	})

	.sort((a, b) => {
    	const timeA = data.items[a].lastUpdated || 0;
    	const timeB = data.items[b].lastUpdated || 0;

    	return timeB - timeA;
	});

	if (sortMode === "recent") {
    	items.sort((a, b) =>
        	(data.items[b].lastUpdated || 0) -
        	(data.items[a].lastUpdated || 0)
    	);
	} else {
    	items.sort();
	}

	tracker.innerHTML = "";

	if (items.length === 0) {
		tracker.innerHTML = `<div class="empty">No tracked items yet.</div>`;
		return;
	}

	for (const item of items) {
		const itemData = data.items[item];
		const row = document.createElement("div");
		row.className = "item-row";

		let goalHtml = "";

		if (itemData.goal) {
			const progress = Math.min((itemData.count / itemData.goal) * 100, 100);

			goalHtml = `
				<div class="goal-row">
					<span class="goal-text">
						${itemData.count}/${itemData.goal} (${progress.toFixed(1)}%)
					</span>

					<div class="progress-bar">
						<div class="progress-fill" style="width:${progress}%"></div>
					</div>
				</div>
			`;
		}

		row.innerHTML = `
			<div class="item-main-row">
				<div class="item-text">
					<strong class="${itemData.colorClass || ""}">
						${escapeHtml(titleCase(item))}
					</strong>: ${itemData.count}
				</div>

				<button class="cog-btn" data-item="${escapeAttr(item)}">⚙</button>
			</div>

			${goalHtml}

			<div class="settings-panel ${itemData.settingsOpen ? "open" : ""}">
				<input type="number"
					   id="goal-${escapeAttr(item)}"
					   placeholder="Goal"
					   value="${itemData.goal || ""}">

				<button class="save-goal" data-item="${escapeAttr(item)}">Save</button>
				<button class="reset-item" data-item="${escapeAttr(item)}">Reset</button>
				<button class="delete-item" data-item="${escapeAttr(item)}">Delete</button>
			</div>
		`;

		if (highlightItem === item) {
			row.classList.add("highlight");
		}

		tracker.appendChild(row);
	}

	bindRowEvents();
}

function bindRowEvents() {
	document.querySelectorAll(".cog-btn").forEach((btn) => {
		btn.addEventListener("click", (e: Event) => {
			const target = e.currentTarget as HTMLElement;
			toggleSettings(target.dataset.item || "");
		});
	});

	document.querySelectorAll(".save-goal").forEach((btn) => {
		btn.addEventListener("click", (e: Event) => {
			const target = e.currentTarget as HTMLElement;
			setGoal(target.dataset.item || "");
		});
	});

	document.querySelectorAll(".reset-item").forEach((btn) => {
		btn.addEventListener("click", (e: Event) => {
			const target = e.currentTarget as HTMLElement;
			resetItem(target.dataset.item || "");
		});
	});

	document.querySelectorAll(".delete-item").forEach((btn) => {
		btn.addEventListener("click", (e: Event) => {
			const target = e.currentTarget as HTMLElement;
			deleteItem(target.dataset.item || "");
		});
	});
}

document.querySelectorAll(".skill-tab").forEach((tab) => {
	tab.addEventListener("click", (e: Event) => {
		const target = e.currentTarget as HTMLElement;

		activeSkillTab = (target.dataset.skill as SkillType) || "all";

		const data = getSaveData();
		data.activeTab = activeSkillTab;
		saveData(data);

		document.querySelectorAll(".skill-tab").forEach((btn) => {
			btn.classList.remove("active");
		});

		target.classList.add("active");

		updateClearButtonLabel();
		render();
	});
});

function toggleSettings(item: string) {
	const data = getSaveData();
	if (!data.items[item]) return;

	data.items[item].settingsOpen = !data.items[item].settingsOpen;
	saveData(data);
	render();
}

function setGoal(item: string) {
	const data = getSaveData();
	if (!data.items[item]) return;

	const input = document.getElementById(`goal-${item}`) as HTMLInputElement;
	if (!input) return;

	const value = input.value.trim();

	if (value === "") {
		data.items[item].goal = null;
	} else {
		const goal = parseInt(value, 10);
		if (isNaN(goal) || goal <= 0) {
			status.innerText = "Goal must be a positive number.";
			return;
		}
		data.items[item].goal = goal;
	}

	saveData(data);
	render();
}

function resetItem(item: string) {
	const data = getSaveData();
	if (!data.items[item]) return;

	data.items[item].count = 0;
	saveData(data);
	render();
}

function deleteItem(item: string) {
	const data = getSaveData();
	delete data.items[item];
	saveData(data);
	render();
}

function clearCurrentTab() {
	const data = getSaveData();

	if (activeSkillTab === "all") {
		data.items = {};
		data.history = [];

		saveData(data);
		render();

		status.innerText = "All items cleared.";
		return;
	}

	for (const item of Object.keys(data.items)) {
		if ((data.items[item].skill || "other") === activeSkillTab) {
			delete data.items[item];
		}
	}

	saveData(data);
	render();

	status.innerText = `${titleCase(activeSkillTab)} cleared.`;
}

function exportData() {
	const data = getSaveData();
	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: "application/json",
	});

	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "Gathering-Tracker-save.json";
	a.click();
	URL.revokeObjectURL(url);
}

function importData(file: File) {
	const reader = new FileReader();

	reader.onload = function () {
		try {
			const imported = JSON.parse(reader.result as string);
			const data: SaveData = {
				chat: imported.chat,
				activeTab: imported.activeTab || "all",
				items: imported.items || {},
				history: imported.history || [],
			};

			saveData(data);
			render();
			status.innerText = "Save imported.";
		} catch {
			status.innerText = "Import failed.";
		}
	};

	reader.readAsText(file);
}

function showSelectedChat(pos: any) {
	if (!pos || !pos.mainbox) return;

	alt1.overLayRect(
		appColor,
		pos.mainbox.rect.x,
		pos.mainbox.rect.y,
		pos.mainbox.rect.width,
		pos.mainbox.rect.height,
		2000,
		3
	);
}

function escapeHtml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function titleCase(text: string) {
	return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeAttr(value: string) {
	return escapeHtml(value);
}

appCog.addEventListener("click", function () {
	appSettingsPanel.classList.toggle("open");
});

clearButton.addEventListener("click", clearCurrentTab);

updateClearButtonLabel();
render();

exportButton.addEventListener("click", exportData);

importInput.addEventListener("change", function () {
	if (this.files && this.files[0]) {
		importData(this.files[0]);
		this.value = "";
	}
});

render();
