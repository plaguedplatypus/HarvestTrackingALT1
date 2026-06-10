import * as a1lib from "alt1";
import ChatboxReader from "alt1/chatbox";
import * as OCR from "alt1/ocr";

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
	| "invention";

type InternalSkillType = SkillType | "other";

type TrackedItem = {
    count: number;
    goal: number | null;
    settingsOpen: boolean;
    skill?: InternalSkillType;
	source?: string;
    colorClass?: string;
    lastUpdated?: number;
};

type InventionFilter = "all" | "rare" | "uncommon" | "common";
let inventionFilter: InventionFilter = "all";

let activeSkillTab: SkillType = "all";

type SortMode = "recent" | "alpha" | "count";
let sortMode: SortMode = "recent";

let fishingUsePorters = true;

type SaveData = {
    chat?: string;
    activeTab?: InternalSkillType;
    fishingUsePorters?: boolean;
    sortMode?: SortMode;
    items: Record<string, TrackedItem>;
    history: string[];
};

const appName = "ResourceTracker";
const appColor = a1lib.mixColor(0, 255, 0);
const timestampRegex = /\[\d{2}:\d{2}:\d{2}\]/g;
const reader = new ChatboxReader();

reader.readargs = {colors:[
	// why does this game hate colors so much
	a1lib.mixColor(50, 200, 20), // Carpet dust green
	a1lib.mixColor(59, 181, 30), // hate this color
	a1lib.mixColor(232, 47, 47), // You missed that seren spirit btw...

	a1lib.mixColor(161, 53, 235), // what's this?
	a1lib.mixColor(51, 101, 252), // A random blue as entered the room
	a1lib.mixColor(67, 188, 188), // Cotton candy?
	
	a1lib.mixColor(255, 153, 0), // Bright orange
	a1lib.mixColor(255, 128, 0), // Medium orange
	a1lib.mixColor(255, 111, 0), // Darker orange
	a1lib.mixColor(255, 140, 56), // pale orange
	a1lib.mixColor(245, 124, 1), // orange
	a1lib.mixColor(238, 118, 0), // orange
	],
};

reader.forwardnudges.push({
	match: /./,
	name: "comma",
	fn: (ctx) => {
		let startx = ctx.rightx;
		let maybe_one = OCR.readChar(ctx.imgdata, ctx.font, [255, 255, 255], startx, ctx.baseliney, false, true);
		if (maybe_one?.chr == ",") {
			let maybe_x = OCR.readChar(ctx.imgdata, ctx.font, [255, 255, 255], startx, ctx.baseliney, false, true);
			ctx.addfrag({ color: [255, 255, 255], index: -1, text: ", ", xstart: startx, xend: startx + maybe_x.basechar.width + ctx.font.spacewidth });
			return true;
		}
	},
});

// Check for "1" in different colors.  Potentially adds a second "x" to string, this is adjusted in the processChat function
reader.forwardnudges.push({
	match: /Materials gained:|parts|components|Junk/,
	name: "uncommon_1",
	fn: (ctx) => {
		let startx = ctx.rightx;
		let maybe_one = OCR.readChar(ctx.imgdata, ctx.font, [255, 128, 0], startx + ctx.font.spacewidth, ctx.baseliney, false, true);
		if (maybe_one?.chr == "1") {
			let maybe_x = OCR.readChar(
				ctx.imgdata,
				ctx.font,
				[255, 128, 0],
				maybe_one.x + maybe_one.basechar.width + ctx.font.spacewidth,
				ctx.baseliney,
				false,
				true,
			);
			if (maybe_x?.chr == "x") {
				ctx.addfrag({ color: [255, 128, 0], index: -1, text: " 1 x", xstart: startx, xend: startx + maybe_one.basechar.width + ctx.font.spacewidth });
			} else {
				ctx.addfrag({ color: [255, 128, 0], index: -1, text: " 1", xstart: startx, xend: startx + maybe_one.basechar.width + ctx.font.spacewidth });
			}
			return true;
		}
	},
});

reader.forwardnudges.push({
	match: /Materials gained:|parts|components|Junk/,
	name: "rare_1",
	fn: (ctx) => {
		let startx = ctx.rightx;
		let maybe_one = OCR.readChar(ctx.imgdata, ctx.font, [255, 0, 0], startx + ctx.font.spacewidth, ctx.baseliney, false, true);
		if (maybe_one?.chr == "1") {
			let maybe_x = OCR.readChar(
				ctx.imgdata,
				ctx.font,
				[255, 0, 0],
				maybe_one.x + maybe_one.basechar.width + ctx.font.spacewidth,
				ctx.baseliney,
				false,
				true,
			);
			if (maybe_x?.chr == "x") {
				ctx.addfrag({ color: [255, 0, 0], index: -1, text: " 1", xstart: startx, xend: startx + maybe_one.basechar.width + ctx.font.spacewidth });
				return true;
			}
			ctx.addfrag({ color: [255, 0, 0], index: -1, text: " 1 x", xstart: startx, xend: startx + maybe_one.basechar.width + ctx.font.spacewidth });
			return true;
		}
	},
});

reader.forwardnudges.push({
	match: /Materials gained:|parts|components|Junk/,
	name: "ancient_1",
	fn: (ctx) => {
		let startx = ctx.rightx;
		let maybe_one = OCR.readChar(ctx.imgdata, ctx.font, [67, 188, 188], startx + ctx.font.spacewidth, ctx.baseliney, false, true);
		if (maybe_one?.chr == "1") {
			let maybe_x = OCR.readChar(
				ctx.imgdata,
				ctx.font,
				[67, 188, 188],
				maybe_one.x + maybe_one.basechar.width + ctx.font.spacewidth,
				ctx.baseliney,
				false,
				true,
			);
			if (maybe_x?.chr == "x") {
				ctx.addfrag({ color: [67, 188, 188], index: -1, text: " 1", xstart: startx, xend: startx + maybe_one.basechar.width + ctx.font.spacewidth });
				return true;
			}
			ctx.addfrag({ color: [67, 188, 188], index: -1, text: " 1 x", xstart: startx, xend: startx + maybe_one.basechar.width + ctx.font.spacewidth });
			return true;
		}
	},
});

const appCog = document.querySelector(".app-cog") as HTMLElement;
const appSettingsPanel = document.querySelector(".app-settings-panel") as HTMLElement;
const chatSelector = document.querySelector(".chat") as HTMLSelectElement;
const tracker = document.querySelector(".tracker") as HTMLElement;

// The status element is used to display messages to the user in the footer
const status = document.querySelector(".status") as HTMLElement;

const historyButton = document.querySelector(".history-button") as HTMLElement;
const exportButton = document.querySelector(".export") as HTMLElement;
const importInput = document.querySelector(".import") as HTMLInputElement;

const fishingMode = document.querySelector(".fishing-mode") as HTMLElement;
const fishingPortersInput = document.querySelector(".fishing-porters") as HTMLInputElement;

const clearButton = document.querySelector(".clear") as HTMLElement;
const sortButton = document.querySelector(".sort-button") as HTMLElement;
const inventionFilters = document.querySelector(".invention-filters") as HTMLElement;
const inventionFilterButton = document.querySelector(".invention-filter-cycle") as HTMLElement;
const savedData = getSaveData();

// Wait for alt1 to initialize and find the chatbox
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

if (window.alt1) {
	alt1.identifyAppUrl("./appconfig.json");
} else {
	const addappurl = `alt1://addapp/${new URL("./appconfig.json", document.location.href).href}`;
	status.innerHTML = `Alt1 not detected. <a href='${addappurl}'>Add this app to Alt1</a>`;
}

// Populate the chat selector dropdown with available chatboxes
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

// Select the saved chatbox or default to the first one
function selectSavedChat() {
	const data = getSaveData();
	const savedChat = data.chat || "0";

	reader.pos.mainbox = reader.pos.boxes[Number(savedChat)] || reader.pos.boxes[0];
	chatSelector.value = savedChat;

	data.chat = savedChat;
	saveData(data);
}

// Read the chatbox, process new lines, and update the tracker accordingly
function readChatbox() {
	const opts = reader.read() || [];

	const chatArr = processChat(opts);

	for (const line of chatArr) {
		const chatLine = line.trim();
		if (!chatLine) continue;

		if (isInHistory(chatLine)) continue;

		const debugStatus = processHarvestLine(chatLine);
		updateChatHistory(chatLine, debugStatus);
	}
}

// Process the raw chatbox output to extract clean chat lines, removing timestamps and handling line breaks appropriately.
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
		.replace(/(\d) x x/g, "$1 x")
		.trim()
		.split("\n")
		.map((line) => line.trim());
}

function getTimeStamp() {
	return new Date().toLocaleTimeString("en-US", {
		hour12: false,
	});
}

// Update the status message in the footer with a timestamp for better user feedback on when events occurred.
function setStatus(message: string) {
	status.innerText = `${message} @ ${getTimeStamp()}`;
}

// Activate the saved fishing porters setting or default to true if not set
const savedActiveTab = savedData.activeTab as string | undefined;
activeSkillTab =
	savedActiveTab === "other"
		? "all"
		: ((savedData.activeTab || "all") as SkillType);
fishingUsePorters = savedData.fishingUsePorters ?? true;
sortMode = savedData.sortMode || "recent";

// Set initial state of fishing porters checkbox based on saved data
if (fishingPortersInput) {
	fishingPortersInput.checked = fishingUsePorters;
}

// Set initial sort button label
document.querySelectorAll(".skill-tab").forEach((btn) => {
	btn.classList.remove("active");
});

// Debug function to show recent chat history in console
// This can be useful for troubleshooting parsing issues or understanding why certain lines are not being tracked correctly. 
// It will print the last 50 chat lines that were processed by the tracker.
function showChatHistory() {
	console.log("=== Recent Chat History ===");

	for (const line of recentLines) {
		console.log(line);
	}

	status.innerText =
		`History contains ${recentLines.length} lines. Check console.`;
}

// Show/hide fishing mode based on active tab
function updateFishingModeVisibility() {
	if (!fishingMode) return;

	if (activeSkillTab === "fishing") {
		fishingMode.classList.add("visible");
	} else {
		fishingMode.classList.remove("visible");
	}
}

// Hide invention filters when not on invention tab
function updateInventionFilterVisibility() {
	if (!inventionFilters) return;

	if (activeSkillTab === "invention") {
		inventionFilters.classList.add("visible");
	} else {
		inventionFilters.classList.remove("visible");
	}
}

// Invention filter button handlers
function updateInventionFilterButton() {
	if (!inventionFilterButton) return;

	inventionFilterButton.innerText =
		inventionFilter === "all"
			? "Filter Components: All"
			: inventionFilter === "rare"
				? "Filter Components: Rare"
				: inventionFilter === "uncommon"
					? "Filter Components: Uncommon"
					: "Filter Components: Common";
}

inventionFilterButton.addEventListener("click", () => {
	inventionFilter =
		inventionFilter === "all"
			? "rare"
			: inventionFilter === "rare"
				? "uncommon"
				: inventionFilter === "uncommon"
					? "common"
					: "all";

	updateInventionFilterButton();
	render();
});

// Activate the saved skill tab or default to "all"
const savedTabButton = document.querySelector(
	`.skill-tab[data-skill="${activeSkillTab}"]`
);

// If the saved active tab is "other", we will default to "all" and not activate any specific tab button, since "other" is not a selectable tab in the UI.
if (savedTabButton) {
	savedTabButton.classList.add("active");
}

updateFishingModeVisibility();
updateInventionFilterButton();
updateInventionFilterVisibility();
updateSortButtonLabel();
render();

 // List of rare components. This is used to apply special styling to these items in the invention tab.
const rareComponents = new Set([
    "brassican components",
    "knightly components",
    "dragonfire components",
    "fungal components",
    "explosive components",
    "corporeal components",
    "armadyl components",
    "bandos components",
    "saradomin components",
    "seren components",
    "zamorak components",
    "zaros components",
    "resilient components",
    "silent components",
    "noxious components",
    "rumbling components",
    "pestiferous components",
    "third-age components",
    "culinary components",
    "shifting components",
    "harnessed components",
    "oceanic components",
    "ascended components",
    "undead components",
    "avernic components",
    "shadow components",
    "ilujankan components",
    "cywir components",
    "faceted components",
    "clockwork components",
    "fortunate components",
    "manufactured components",
    "ecliptic components"
]);

// List of rare Seren spirit items that should be highlighted in the tracker.
const rareSerenItems = new Set([
    "hazelmere's signet ring",
    "blurberry special",
    "cheese+tom batta"
]);

// Process a single chat line to check for harvesting events and update the tracker accordingly.
function processHarvestLine(chatLine: string): string {
	const cleanLine = chatLine.replace(timestampRegex, "").trim();
	
	// Check for Seren spirit's
	const serenMatch = cleanLine.match(
		/The Seren spirit gifts you:\s*(\d+)\s*x\s*(.+?)\./i
	);

	if (serenMatch) {
		const amount = parseInt(serenMatch[1], 10);
		const item = normalizeItemName(serenMatch[2]) + " ﴾♦﴿";

		if (!item || isNaN(amount)) return;

		const colorClass = rareSerenItems.has(item)
    		? "seren-item-red"
    		: "seren-item";

		incrementItem(item, amount, "seren", colorClass, "seren-spirit");
		setStatus(`Seren Spirit: ${amount} x ${item}`);
		return `[COUNTED: ${item} +${amount}]`;
	}

	const birdNestMatch = cleanLine.match(
		/You find (?:a|an)?\s+(.+?)[!.]\s+You pick it up and place it in your wood box\./i
	);

	// Check for bird's nests
	if (birdNestMatch) {
		const item = normalizeItemName(birdNestMatch[1]);

		if (!item) return "[IGNORED]";

		incrementItem(item, 1, "woodcutting");
		setStatus(`Tracked: ${item}`);

		return `[COUNTED: ${titleCase(item)} +1]`;
	}

	// Check for invention materials
	const materialsMatch = cleanLine.match(
		/Materials gained:\s*(.+)$/i
	);

	// If the line contains "Materials gained:"
	// we will attempt to parse it for invention materials. 
	if (materialsMatch) {
		const materialText = materialsMatch[1];

	// If the material text ends with a comma, it likely means the line was cut off
		if (materialText.endsWith(",")) {
			console.warn("CUT OFF MATERIALS:", materialText);
		}

	// We will attempt to parse whatever material information we have.
	let finalMaterialText = materialText;
		if (/,\s*(components|parts|junk)$/i.test(finalMaterialText)) {
			console.warn("LOST ITEM:", finalMaterialText);
			finalMaterialText = finalMaterialText.replace(/,\s*(components|parts|junk)$/i, ",");
		}
	// If the text is cut off, we can try to remove the last incomplete material entry to avoid parsing errors.
	// This way we can still track the complete materials listed before the cutoff.
		const materialRegex = /(\d+)\s*x\s*([^,\.]+?)(?:,|\.|$)/gi;
		let materialMatch: RegExpExecArray | null;
		let trackedAnyMaterial = false;
		const countedMaterials: string[] = [];

		while ((materialMatch = materialRegex.exec(finalMaterialText)) !== null) {
			const amount = parseInt(materialMatch[1], 10);
			const item = normalizeItemName(materialMatch[2]);

			if (!item || isNaN(amount)) continue;

			const isRareComponent = rareComponents.has(item);
			const isUncommonComponent = item.includes("components");
			const isInventionMaterial =
				isUncommonComponent ||
				item.includes("parts") ||
				item === "junk";

			if (!isInventionMaterial) continue;

			const colorClass = isRareComponent
				? "rare-component"
				: isUncommonComponent
					? "uncommon-component"
					: undefined;

			const source = isRareComponent
				? "rare-components"
				: isUncommonComponent
					? "uncommon-components"
					: "invention";

			incrementItem(item, amount, "invention", colorClass, source);
			
			countedMaterials.push(`${titleCase(item)} +${amount}`);

			setStatus(`Invention: ${amount} x ${item}`);

			trackedAnyMaterial = true;
		}	

		if (countedMaterials.length > 0) {
			const warning = finalMaterialText !== materialText ? " [LOST ITEM]" : "";
			return `[COUNTED: ${countedMaterials.join(", ")}]${warning}`;
		}
	}

	// Check for item transports
	const transportMatch = cleanLine.match(
		/You transport to your\s+(.+?):\s*(\d+)\s*x\s*(.+?)\.?$/i
	);

	if (transportMatch) {
		const destination = transportMatch[1].toLowerCase();
		const amount = parseInt(transportMatch[2], 10);
		const item = normalizeItemName(transportMatch[3]);

		if (!item || isNaN(amount)) return;

		let skill: InternalSkillType = "other";

		if (destination.includes("metal bank")) {
			skill = "mining";
		} else if (destination.includes("material storage")) {
			skill = "archaeology";
		} else if (destination.includes("bank")) {
			skill = getSkillForItem(item);
		}

		if (skill === "fishing" && !fishingUsePorters) {
			return;
		}

		incrementItem(item, amount, skill);
		setStatus(`Tracked: ${amount} x ${item}`);
		return `[COUNTED: ${item} +${amount}]`;
	}

	// Some transport lines use "sent it to your" instead of "You transport to your"
	const perkSendMatch = cleanLine.match(
		/sent it to your\s+(.+?):\s*(\d+)\s*x\s*([\s\S]+?)\.?$/i
	);

	if (perkSendMatch) {
		const destination = perkSendMatch[1].toLowerCase();
		const amount = parseInt(perkSendMatch[2], 10);
		const item = normalizeItemName(perkSendMatch[3]);

		if (!item || isNaN(amount)) return;

		let skill: InternalSkillType = "other";

		if (destination.includes("metal bank")) {
			skill = "mining";
		} else if (destination.includes("material storage")) {
			skill = "archaeology";
		} else if (destination.includes("bank")) {
			skill = getSkillForItem(item);
		}

		incrementItem(item, amount, skill);
		setStatus(`Tracked: ${amount} x ${item}`);
		return `[COUNTED: ${item} +${amount}]`;
	}

	// Check for mining, woodcutting, fishing, and archaeology
	const skillPatterns: Array<{
		pattern: RegExp;
		skill: SkillType;
	}> = [
		{ pattern: /You manage to mine some\s+(.+?)[!.]/i, skill: "mining" },
		{ pattern: /You mine (?:(?:some|an?)\s+)?(.+?)[!.]/i, skill: "mining" },

		{ pattern: /You get some\s+(.+?)[!.]/i, skill: "woodcutting" },
		{ pattern: /You cut (?:(?:some|an?)\s+)?(.+?)[!.]/i, skill: "woodcutting" },
		{ pattern: /You successfully cut (?:(?:some|an?)\s+)?(.+?)[!.]/i, skill: "woodcutting" },
		{ pattern: /You chop (?:(?:some|an?)\s+)?(.+?)[!.]/i, skill: "woodcutting" },

		{ pattern: /You catch (?:a|an|some)\s+(.+?)[!.]/i, skill: "fishing" },

		{ pattern: /You find (?:a|an|some)\s+(.+?)[!.]/i, skill: "archaeology" },
	];

	for (const entry of skillPatterns) {
		const match = cleanLine.match(entry.pattern);
		if (!match) continue;

		if (entry.skill === "fishing" && fishingUsePorters) {
			continue;
		}

		const item = normalizeItemName(match[1]);
		if (!item) return;

		incrementItem(item, 1, entry.skill);
		setStatus(`Tracked: ${item}`);
		return "[IGNORED]";
	}
}

function getSkillForItem(item: string): InternalSkillType {
	if (item.includes("bamboo") || item.includes("eternal magic tree branch")) return "woodcutting";
	if (item.includes("(damaged)")) return "archaeology";
	if (item.includes("ore")) return "mining";
	if (item.includes("logs")) return "woodcutting";
	if (item.includes("raw ") || item.includes("lobster") || item.includes("tuna") || item.includes("shark") || item.includes("sailfish")) return "fishing";

	return "other";
}

// Normalize item names by converting to lowercase
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
			sortMode: "recent",
			items: {},
			history: [],
		};
	}

	try {
		const data = JSON.parse(raw);
		return {
			chat: data.chat,
			activeTab: data.activeTab || "all",
			fishingUsePorters: data.fishingUsePorters ?? true,
			sortMode: data.sortMode || "recent",
			items: data.items || {},
			history: data.history || [],
		};
	} catch {
		return {
			sortMode: "recent",
			items: {},
			history: [],
		};
	}
}

// Save the current state of the tracker to localStorage
function saveData(data: SaveData) {
	localStorage.setItem(appName, JSON.stringify(data));
}

// Ensure that an item exists in the save data before trying to update it
function ensureItem(data: SaveData, item: string) {
	if (!data.items[item]) {
		data.items[item] = {
			count: 0,
			goal: null,
			settingsOpen: false,
		};
	}
}

// Increment the count of a tracked item and update its metadata
// then re-render the tracker to reflect the changes.
function incrementItem(
	item: string,
	amount: number = 1,
	skill: InternalSkillType = "other",
	colorClass?: string,
	source?: string
) {
	const data = getSaveData();
	ensureItem(data, item);
	data.items[item].count += amount;
	data.items[item].skill = skill;
	data.items[item].lastUpdated = Date.now();

	if (colorClass) {
		data.items[item].colorClass = colorClass;
	}

	if (source) {
		data.items[item].source = source;
	}

	saveData(data);
	render(item);
}

// Keep a history of recent chat lines to prevent processing duplicates and allow for debugging.
let recentLines: string[] = [];

function isInHistory(chatLine: string) {
	return recentLines.some((line) => line.includes(chatLine));
}

// Add a new chat line to the history, keeping only the most recent 50 lines to prevent memory bloat.
function updateChatHistory(chatLine: string, debugStatus = "[IGNORED]") {
	const debugLine = chatLine.replace(
		timestampRegex,
		(match) => `${match} ${debugStatus}`
	);

	recentLines.push(debugLine);

	if (recentLines.length > 50) {
		recentLines = recentLines.slice(-50);
	}
}

// Render the tracker UI based on the current save data
function render(highlightItem?: string) {
	const data = getSaveData();

	const items = Object.keys(data.items)
		.filter((item) => {
			if (activeSkillTab === "all") return true;
			return (data.items[item].skill || "other") === activeSkillTab;
		});

	sortItems(items, data);

	tracker.innerHTML = "";

	if (items.length === 0) {
		tracker.innerHTML = `<div class="empty">No tracked items yet.</div>`;
		return;
	}

	if (activeSkillTab === "invention") {
		const rareItems = items.filter(
			(item) => data.items[item].source === "rare-components"
		);

		const uncommonItems = items.filter(
			(item) => data.items[item].source === "uncommon-components"
		);

		const commonItems = items.filter(
			(item) => data.items[item].source === "invention" || !data.items[item].source
		);

		if (inventionFilter === "all" || inventionFilter === "rare") {
			renderItemGroup("Rare Components", rareItems, data, highlightItem);
		}

		if (inventionFilter === "all" || inventionFilter === "uncommon") {
			renderItemGroup("Uncommon Components", uncommonItems, data, highlightItem);
		}

		if (inventionFilter === "all" || inventionFilter === "common") {
			renderItemGroup("Common Components", commonItems, data, highlightItem);
		}

		bindRowEvents();
		return;
	}

	for (const item of items) {
		renderItemRow(item, data.items[item], highlightItem);
	}

	bindRowEvents();
}

// Sort items based on the selected sort mode: by recent updates, alphabetically, or by count.
function sortItems(items: string[], data: SaveData) {
	if (sortMode === "recent") {
		items.sort((a, b) =>
			(data.items[b].lastUpdated || 0) -
			(data.items[a].lastUpdated || 0)
		);
		return;
	}

	if (sortMode === "count") {
		items.sort((a, b) =>
			data.items[b].count - data.items[a].count
		);
		return;
	}

	items.sort();
}

// Update the tooltip to reflect the current sort mode.
function updateSortButtonLabel() {
	if (!sortButton) return;

	sortButton.title =
		sortMode === "recent"
			? "Sort: Recent"
			: sortMode === "alpha"
				? "Sort: A-Z"
				: "Sort: Count";
}

if (sortButton) {
	sortButton.addEventListener("click", function () {
		sortMode =
			sortMode === "recent"
				? "alpha"
				: sortMode === "alpha"
					? "count"
					: "recent";

		const data = getSaveData();
		data.sortMode = sortMode;
		saveData(data);

		updateSortButtonLabel();
		render();
	});
}

// Render a group of items under a common header, such as "Rare Components" or "Uncommon Components" in the invention tab.
function renderItemGroup(
	label: string,
	items: string[],
	data: SaveData,
	highlightItem?: string
) {
	if (items.length === 0) return;

	const header = document.createElement("div");
	header.className = "group-header";
	header.innerText = label;
	tracker.appendChild(header);

	for (const item of items) {
		renderItemRow(item, data.items[item], highlightItem);
	}
}

// Render a single item row in the tracker, including its name, count, goal progress, and settings panel.
function renderItemRow(
	item: string,
	itemData: TrackedItem,
	highlightItem?: string
) {
	const row = document.createElement("div");
	row.className = "item-row";

	let goalHtml = "";

	if (itemData.goal) {
		const goalReached = itemData.count >= itemData.goal;
		const overage = itemData.count - itemData.goal;
		const overageText = 
			overage > 0
				? ` (+${overage.toLocaleString()})`
				: "";

		if (goalReached) {
			goalHtml = `
				<div class="goal-complete">★ Goal Reached!${overageText}</div>
	`;

		} else {
		const progress = Math.min((itemData.count / itemData.goal) * 100, 100);
		const current = itemData.count.toLocaleString();
		const goal = itemData.goal.toLocaleString();

		goalHtml = `
    		<div class="goal-row">
        		<span class="goal-text">
           			 ${current} / ${goal} (${progress.toFixed(1)}%)
        		</span>

				<div class="progress-bar">
					<div class="progress-fill" style="width:${progress}%"></div>
				</div>
			</div>
		`;
		}
	}

	row.innerHTML = `
		<div class="item-main-row">
			<div class="item-text">
				<strong class="${itemData.colorClass || ""}">
					${escapeHtml(titleCase(item))}
				</strong>
			</div>

			<div class="item-count">
    			${itemData.count.toLocaleString()}
			</div>

			<button class="cog-btn" data-item="${escapeAttr(item)}">⚙</button>
		</div>

		${goalHtml}

		<div class="settings-panel ${itemData.settingsOpen ? "open" : ""}">
			<input type="number"
				   id="goal-${escapeAttr(item)}"
				   placeholder="Goal"
				   value="${itemData.goal || ""}">

			<button class="clear-goal" data-item="${escapeAttr(item)}" title="Clear Goal">✖</button>
			<button class="save-goal" data-item="${escapeAttr(item)}" title="Save Goal">💾</button>
			<span class="button-separator">•</span>
			<button class="reset-item" data-item="${escapeAttr(item)}" title="Reset Count">↺</button>
			<button class="delete-item" data-item="${escapeAttr(item)}" title="Delete Item">🗑</button>
		</div>
	`;

	if (highlightItem === item) {
		row.classList.add("highlight");
	}

	tracker.appendChild(row);
}

// Bind event listeners to the buttons in each item row
function bindRowEvents() {
	document.querySelectorAll(".cog-btn").forEach((btn) => {
		btn.addEventListener("click", (e: Event) => {
			const target = e.currentTarget as HTMLElement;
			toggleSettings(target.dataset.item || "");
		});
	});

	document.querySelectorAll(".clear-goal").forEach((btn) => {
		btn.addEventListener("click", (e: Event) => {
			const target = e.currentTarget as HTMLElement;
			clearGoal(target.dataset.item || "");
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

// Bind event listeners to the skill tab buttons to switch between different skill views in the tracker.
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

		updateFishingModeVisibility();
		updateInventionFilterVisibility();
		render();
	});
});

// Toggle the settings panel for a specific item when the cog button is clicked.
function toggleSettings(item: string) {
	const data = getSaveData();
	if (!data.items[item]) return;

	data.items[item].settingsOpen = !data.items[item].settingsOpen;
	saveData(data);
	render();
}

// Clear the goal for a specific item when the clear goal button is clicked.
function clearGoal(item: string) {
	const data = getSaveData();
	if (!data.items[item]) return;

	data.items[item].goal = null;

	saveData(data);
	render();
}

// Set a new goal for a specific item when the save goal button is clicked
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

// Reset the count for a specific item back to zero when the reset button is clicked.
function resetItem(item: string) {
	const data = getSaveData();
	if (!data.items[item]) return;

	data.items[item].count = 0;
	saveData(data);
	render();
}

// Delete a specific item from the tracker when the delete button is clicked.
function deleteItem(item: string) {
	const data = getSaveData();
	delete data.items[item];
	saveData(data);
	render();
}

// Clear all items from the current skill tab, or all items if "all" is selected, when the clear button is clicked.
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
	a.download = "Resource-Tracker-save.json";
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
				fishingUsePorters: imported.fishingUsePorters ?? true,
				sortMode: imported.sortMode || "recent",
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

if (fishingPortersInput) {
	fishingPortersInput.addEventListener("change", function () {
		fishingUsePorters = this.checked;

		const data = getSaveData();
		data.fishingUsePorters = fishingUsePorters;
		saveData(data);
	});
}

// Bind the history button to show recent chat history in the console for debugging purposes.
if (historyButton) {
	historyButton.addEventListener("click", showChatHistory);
}

exportButton.addEventListener("click", exportData);

importInput.addEventListener("change", function () {
	if (this.files && this.files[0]) {
		importData(this.files[0]);
		this.value = "";
	}
});
