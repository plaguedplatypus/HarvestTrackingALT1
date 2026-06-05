import * as a1lib from "alt1";
import ChatboxReader from "alt1/chatbox";

import "./index.html";
import "./appconfig.json";
import "./icon.png";
import "./css/style.css";

type TrackedItem = {
	count: number;
	goal: number | null;
	settingsOpen: boolean;
};

type SaveData = {
	chat?: string;
	items: Record<string, TrackedItem>;
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
const testButton = document.querySelector(".test") as HTMLElement;

reader.readargs = {
	colors: [
		a1lib.mixColor(255, 255, 255), // most normal chat text
		a1lib.mixColor(255, 255, 0),   // some game/info messages
		a1lib.mixColor(0, 255, 255),   // alternate notification text
		a1lib.mixColor(127, 169, 255), // common RS3 chat blue-ish text
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
		}, 700);
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
	const chatArr = processChat(opts) || [];

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
		.replace(timestampRegex, "")
		.trim()
		.split("\n")
		.map((line) => line.trim());
}

function processHarvestLine(chatLine: string) {
	const cleanLine = chatLine.replace(timestampRegex, "").trim();

	/*
		Exact quantity metal-bank messages.
		Examples:
		You transport to your metal bank: 2 x Zephyrium ore.
		Your Boon of Crondis has doubled the following item and sent it to your metal bank: 1 x Zephyrium ore.
	*/

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

function normalizeItemName(name: string) {
	return name
		.toLowerCase()
		.replace(/\.$/, "")
		.replace(/^some\s+/, "")
		.replace(/^an?\s+/, "")
		.trim();
}

function incrementItem(item: string, amount: number = 1) {
	const data = getSaveData();
	ensureItem(data, item);
	data.items[item].count += amount;
	saveData(data);
	render(item);
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

function render(highlightItem?: string) {
	const data = getSaveData();
	const items = Object.keys(data.items).sort();
	tracker.innerHTML = "";

	if (items.length === 0) {
		tracker.innerHTML = `<div class="empty">No tracked items yet. Start mining or woodcutting with chat visible.</div>`;
		return;
	}

	for (const item of items) {
		const row = buildItemRow(item, data.items[item], item === highlightItem);
		tracker.appendChild(row);
	}
}

function buildItemRow(item: string, itemData: TrackedItem, highlight: boolean) {
	const row = document.createElement("div");
	row.className = `item-row${highlight ? " new" : ""}`;

	let goalHtml = "";
	if (itemData.goal) {
		const progress = Math.min((itemData.count / itemData.goal) * 100, 100);
		goalHtml = `
			<span class="goal-text">Goal: ${itemData.count}/${itemData.goal} (${progress.toFixed(1)}%)</span>
			<div class="progress-bar" title="${progress.toFixed(1)}%">
				<div class="progress-fill" style="width:${progress}%"></div>
			</div>
		`;
	}

	row.innerHTML = `
		<div class="item-line">
			<span class="item-name">${escapeHtml(item)}</span>: <span class="item-count">${itemData.count}</span>
		</div>
		${goalHtml}
		<button class="cog-btn" data-item="${escapeHtml(item)}" title="Edit">⚙</button>
		<div class="settings-panel ${itemData.settingsOpen ? "open" : ""}">
			<label>Goal <input type="number" class="goal-input" data-item="${escapeHtml(item)}" value="${itemData.goal || ""}" placeholder="optional" /></label>
			<button class="save-goal nisbutton" data-item="${escapeHtml(item)}">Save</button>
			<button class="reset-item nisbutton" data-item="${escapeHtml(item)}">Reset</button>
			<button class="delete-item nisbutton" data-item="${escapeHtml(item)}">Delete</button>
		</div>
	`;

	return row;
}

tracker.addEventListener("click", (event: Event) => {
	const target = event.target as HTMLElement;
	const item = target.dataset.item;
	if (!item) return;

	if (target.classList.contains("cog-btn")) toggleSettings(item);
	if (target.classList.contains("save-goal")) saveGoal(item);
	if (target.classList.contains("reset-item")) resetItem(item);
	if (target.classList.contains("delete-item")) deleteItem(item);
});

function toggleSettings(item: string) {
	const data = getSaveData();
	ensureItem(data, item);
	data.items[item].settingsOpen = !data.items[item].settingsOpen;
	saveData(data);
	render();
}

function saveGoal(item: string) {
	const input = document.querySelector(`.goal-input[data-item="${cssEscape(item)}"]`) as HTMLInputElement;
	if (!input) return;

	const data = getSaveData();
	ensureItem(data, item);
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

function getSaveData(): SaveData {
	const existing = localStorage.getItem(appName);
	if (!existing) return { items: {} };

	try {
		const parsed = JSON.parse(existing);
		if (!parsed.items) parsed.items = {};
		return parsed;
	} catch {
		return { items: {} };
	}
}

function saveData(data: SaveData) {
	localStorage.setItem(appName, JSON.stringify(data));
}

function updateChatHistory(chatLine: string) {
	const key = `${appName}chatHistory`;
	if (!sessionStorage.getItem(key)) {
		sessionStorage.setItem(key, `${chatLine}\n`);
		return;
	}

	const history = sessionStorage.getItem(key).split("\n");
	while (history.length > 100) history.splice(0, 1);
	history.push(chatLine.trim());
	sessionStorage.setItem(key, history.join("\n"));
}

function isInHistory(chatLine: string) {
	const key = `${appName}chatHistory`;
	if (!sessionStorage.getItem(key)) return false;
	return sessionStorage.getItem(key).split("\n").some((historyLine) => historyLine.trim() === chatLine);
}

function showSelectedChat(chat: any) {
	try {
		alt1.overLayRect(appColor, chat.mainbox.rect.x, chat.mainbox.rect.y, chat.mainbox.rect.width, chat.mainbox.rect.height, 2000, 5);
	} catch {}
}

function escapeHtml(text: string) {
	return text.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
}

function cssEscape(text: string) {
	return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

exportButton.addEventListener("click", function () {
	const data = getSaveData();
	let str = "Item,Count,Goal\n";
	for (const item of Object.keys(data.items).sort()) {
		str += `${item},${data.items[item].count},${data.items[item].goal || ""}\n`;
	}
	const blob = new Blob([str], { type: "text/csv;charset=utf-8;" });
	const link = document.createElement("a");
	const url = URL.createObjectURL(blob);
	link.setAttribute("href", url);
	link.setAttribute("download", "harvest-tracker-export.csv");
	link.style.visibility = "hidden";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
});

importInput.addEventListener("change", function () {
	const file = importInput.files?.[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = () => {
		try {
			const imported = JSON.parse(String(reader.result));
			if (!imported.items) throw new Error("Bad import");
			saveData(imported);
			render();
			status.innerText = "Import complete.";
		} catch {
			status.innerText = "Import failed.";
		}
	};
	reader.readAsText(file);
});

clearButton.addEventListener("click", function () {
	localStorage.removeItem(appName);
	sessionStorage.removeItem(`${appName}chatHistory`);
	location.reload();
});

testButton.addEventListener("click", function () {
	processHarvestLine("You manage to mine some copper ore.");
});

render();
