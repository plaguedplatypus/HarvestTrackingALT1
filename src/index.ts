import * as a1lib from "alt1";
import ChatboxReader from "alt1/chatbox";

import "./index.html";
import "./appconfig.json";
import "./css/style.css";
import "./icon.png";

type TrackedItem = {
	count: number;
	goal: number | null;
	settingsOpen: boolean;
};

type SaveData = {
	chat?: string;
	items: Record<string, TrackedItem>;
	history: string[];
};

const appName = "HarvestTracker";
const appColor = a1lib.mixColor(0, 255, 0);
const timestampRegex = /\[\d{2}:\d{2}:\d{2}\]/g;
const reader = new ChatboxReader();

const chatSelector = document.querySelector(".chat") as HTMLSelectElement;
const tracker = document.querySelector(".tracker") as HTMLElement;
const status = document.querySelector(".status") as HTMLElement;
const clearButton = document.querySelector(".clear") as HTMLElement;
const exportButton = document.querySelector(".export") as HTMLElement;
const importInput = document.querySelector(".import") as HTMLInputElement;

reader.readargs = {
	colors: [
		a1lib.mixColor(255, 255, 255),
		a1lib.mixColor(255, 255, 0),
		a1lib.mixColor(0, 255, 255),
		a1lib.mixColor(127, 169, 255),
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

	const metalBankMatch = cleanLine.match(
		/You transport to your metal bank:\s*(\d+)\s*x\s*(.+?)\./i
	);

	if (metalBankMatch) {
		const amount = parseInt(metalBankMatch[1], 10);
		const item = normalizeItemName(metalBankMatch[2]);
		if (!item || isNaN(amount)) return;

		incrementItem(item, amount);
		status.innerText = `Tracked: ${amount} x ${item}`;
		return;
	}

	const boonMetalBankMatch = cleanLine.match(
		/sent it to your metal bank:\s*(\d+)\s*x\s*(.+?)\./i
	);

	if (boonMetalBankMatch) {
		const amount = parseInt(boonMetalBankMatch[1], 10);
		const item = normalizeItemName(boonMetalBankMatch[2]);
		if (!item || isNaN(amount)) return;

		incrementItem(item, amount);
		status.innerText = `Tracked: ${amount} x ${item}`;
		return;
	}

	const patterns = [
		/You get some (.+?)\./i,
		/You manage to mine some (.+?)\./i,
		/You mine (?:some |an? )?(.+?)\./i,
		/You cut (?:some |an? )?(.+?)\./i,
		/You successfully cut (?:some |an? )?(.+?)\./i,
		/You chop (?:some |an? )?(.+?)\./i,
		/You catch a[n]? (.+?)\./i,
		/You catch some (.+?)\./i,
	];

	for (const pattern of patterns) {
		const match = cleanLine.match(pattern);
		if (!match) continue;

		const item = normalizeItemName(match[1]);
		if (!item) return;

		incrementItem(item);
		status.innerText = `Tracked: ${item}`;
		return;
	}
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

function incrementItem(item: string, amount: number = 1) {
	const data = getSaveData();
	ensureItem(data, item);
	data.items[item].count += amount;
	saveData(data);
	render(item);
}

function isInHistory(_chatLine: string) {
	return false;
}

function updateChatHistory(chatLine: string) {
	const data = getSaveData();
	data.history.push(chatLine);

	if (data.history.length > 120) {
		data.history = data.history.slice(data.history.length - 120);
	}

	saveData(data);
}

function render(highlightItem?: string) {
	const data = getSaveData();
	const items = Object.keys(data.items).sort();

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
				<span class="goal-text">
					Goal: ${itemData.count}/${itemData.goal} (${progress.toFixed(1)}%)
				</span>

				<div class="progress-bar">
					<div class="progress-fill" style="width:${progress}%"></div>
				</div>
			`;
		}

		row.innerHTML = `
			<div class="item-text">
				<strong>${escapeHtml(item)}</strong>: ${itemData.count}
			</div>

			${goalHtml}

			<button class="cog-btn" data-item="${escapeAttr(item)}">⚙</button>

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

function clearAll() {
	const data = getSaveData();
	data.items = {};
	data.history = [];
	saveData(data);
	render();
	status.innerText = "Tracker cleared.";
}

function exportData() {
	const data = getSaveData();
	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: "application/json",
	});

	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "harvest-tracker-save.json";
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

function showSelectedChat(pos) {
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

function escapeAttr(value: string) {
	return escapeHtml(value);
}

clearButton.addEventListener("click", clearAll);
exportButton.addEventListener("click", exportData);

importInput.addEventListener("change", function () {
	if (this.files && this.files[0]) {
		importData(this.files[0]);
		this.value = "";
	}
});

render();
