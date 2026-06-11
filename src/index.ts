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

type ItemUpdate = {
	item: string;
	amount: number;
	skill: InternalSkillType;
	colorClass?: string;
	source?: string;
};

type InventionFilter = "all" | "rare" | "uncommon" | "common";
let inventionFilter: InventionFilter = "all";

let activeSkillTab: SkillType = "all";

type SortMode = "recent" | "alpha" | "count";
let sortMode: SortMode = "recent";

let fishingUsePorters = true;
let historyWindow: Window | null = null;
let historyPre: HTMLPreElement | null = null;

type SaveData = {
    chat?: string;
    activeTab?: InternalSkillType;
    fishingUsePorters?: boolean;
    sortMode?: SortMode;
	debugUnknownLines?: boolean;
    items: Record<string, TrackedItem>;
};

const appName = "ResourceTracker";
const appColor = a1lib.mixColor(67, 188, 188);
const maxRecentHistory = 50;
const timestampRegex = /\[\d{2}:\d{2}:\d{2}\]/g;
const timestampLineRegex = /\[\d{2}:\d{2}:\d{2}\]/;
const reader = new ChatboxReader();

reader.readargs.colors.push(
	// anti aliasing sucks
	a1lib.mixColor(50, 190, 20), // Carpet dust green
	a1lib.mixColor(59, 181, 30), // hate this color
	a1lib.mixColor(230, 45, 45), // Red (You missed...)
	a1lib.mixColor(255, 125, 0), a1lib.mixColor(225, 115, 0), // uncommon components

	a1lib.mixColor(255, 0, 255), a1lib.mixColor(161, 53, 235), // what's this? Purple
	a1lib.mixColor(51, 101, 252), // A random blue as entered the room
	a1lib.mixColor(67, 188, 188), // Cotton candy?
	
	// orange juice
	a1lib.mixColor(255, 153, 0), 
	a1lib.mixColor(245, 170, 1), //dark
	a1lib.mixColor(193, 97, 1), //performing an action
);

function addTextBridgeNudge(name: string, match: RegExp) {
	reader.forwardnudges.push({
		name,
		match,
		fn: (ctx) => {
			const startx = ctx.rightx;

			for (const color of ctx.colors) {
				for (const offset of [
					0,
					ctx.font.spacewidth,
					ctx.font.spacewidth * 2,
					ctx.font.spacewidth * 3,
					1, 2, 3, 4, 5, 6,
				]) {
					const one = OCR.readChar(
						ctx.imgdata,
						ctx.font,
						color,
						startx + offset,
						ctx.baseliney,
						false,
						true
					);

					if (one?.chr !== "1") continue;

					const data = OCR.readLine(
						ctx.imgdata,
						ctx.font,
						color,
						one.x,
						ctx.baseliney,
						true,
						false
					);

					if (/^1\s*x\s+/i.test(data.text)) {
						data.fragments.forEach((frag) => ctx.addfrag(frag));
						return true;
					}

					const x = OCR.readChar(
						ctx.imgdata,
						ctx.font,
						color,
						one.x + one.basechar.width + ctx.font.spacewidth,
						ctx.baseliney,
						false,
						true
					);

					ctx.addfrag({
						color,
						index: -1,
						text: x?.chr === "x" ? "1 x" : "1",
						xstart: startx,
						xend: one.x + one.basechar.width,
					});

					return true;
				}
			}
		},
	});
}

function addCommaNudge() {
	reader.forwardnudges.push({
		name: "material-comma",
		match: /Materials gained:[\s\S]*(parts|components)$/i,
		fn: (ctx) => {
			for (const offset of [0, 1, 2, 3, 4, 5, ctx.font.spacewidth]) {
				for (const color of ctx.colors) {
					const comma = OCR.readChar(
						ctx.imgdata,
						ctx.font,
						color,
						ctx.rightx + offset,
						ctx.baseliney,
						false,
						true
					);

					if (comma?.chr !== ",") continue;

					ctx.addfrag({
						color,
						index: -1,
						text: ", ",
						xstart: ctx.rightx,
						xend: comma.x + comma.basechar.width + ctx.font.spacewidth,
					});

					return true;
				}
			}
		},
	});
}

function addMaterialContinuationNudge() {
	reader.forwardnudges.push({
		name: "material-color-continuation",
		match: /Materials gained:[\s\S]*(?:,|\bparts|\bcomponents)\s*$/i,
		fn: (ctx) => {
			const addContinuation = (x: number, fragments: OCR.TextFragment[]) => {
				if (!ctx.text.endsWith(" ")) {
					ctx.addfrag({
						color: [255, 255, 255],
						index: -1,
						text: " ",
						xstart: ctx.rightx,
						xend: x,
					});
				}

				fragments.forEach((frag) => ctx.addfrag(frag));
				return true;
			};

				const candidateStarts = [
					ctx.rightx - ctx.font.spacewidth * 4,
					ctx.rightx - ctx.font.spacewidth * 3,
					ctx.rightx - ctx.font.spacewidth * 2,
					ctx.rightx - ctx.font.spacewidth,
					ctx.rightx,
					ctx.rightx + ctx.font.spacewidth,
					ctx.rightx + ctx.font.spacewidth * 2,
					ctx.rightx + ctx.font.spacewidth * 3,
					ctx.rightx + ctx.font.spacewidth * 4,
				];

			for (const x of candidateStarts) {
				const data = OCR.readLine(
					ctx.imgdata,
					ctx.font,
					ctx.colors,
					x,
					ctx.baseliney,
					true,
					false
				);

				if (!/^\s*\d+\s*x\s+/i.test(data.text)) {
					continue;
				}

				return addContinuation(x, data.fragments);
			}

			const scanStart = ctx.rightx - ctx.font.spacewidth * 4;
			const scanEnd = ctx.rightx + ctx.font.spacewidth * 12;

			for (let x = scanStart; x <= scanEnd; x++) {
				for (const color of ctx.colors) {
					const digit = OCR.readChar(
						ctx.imgdata,
						ctx.font,
						color,
						x,
						ctx.baseliney,
						false,
						true
					);

					if (!digit || !/^\d$/.test(digit.chr)) {
						continue;
					}

					const data = OCR.readLine(
						ctx.imgdata,
						ctx.font,
						color,
						digit.x,
						ctx.baseliney,
						true,
						false
					);

					if (/^\d+\s*x\s+/i.test(data.text)) {
						return addContinuation(digit.x, data.fragments);
					}
				}
			}
		},
	});
}

addCommaNudge();
addMaterialContinuationNudge();
addTextBridgeNudge("component-bridge", /Materials gained|parts|components|Junk/i);

const appCog = document.querySelector(".app-cog") as HTMLElement;
const appSettingsPanel = document.querySelector(".app-settings-panel") as HTMLElement;
const chatSelector = document.querySelector(".chat") as HTMLSelectElement;
const tracker = document.querySelector(".tracker") as HTMLElement;
const status = document.querySelector(".status") as HTMLElement;

const historyButton = document.querySelector(".history-button") as HTMLElement;
const debugUnknownInput = document.querySelector(".debug-unknown-lines") as HTMLInputElement;
const exportButton = document.querySelector(".export") as HTMLElement;
const importInput = document.querySelector(".import") as HTMLInputElement;

const fishingMode = document.querySelector(".fishing-mode") as HTMLElement;
const fishingPortersInput = document.querySelector(".fishing-porters") as HTMLInputElement;

const clearButton = document.querySelector(".clear") as HTMLElement;
const sortButton = document.querySelector(".sort-button") as HTMLElement;
const inventionFilters = document.querySelector(".invention-filters") as HTMLElement;
const inventionFilterButton = document.querySelector(".invention-filter-cycle") as HTMLElement;
const savedData = getSaveData();

let debugUnknownLines = savedData.debugUnknownLines ?? false;

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

	for (const chatLine of chatArr) {
		const historyKey = chatLine.trim();
		if (!historyKey) continue;

		if (isInHistory(historyKey)) continue;

		const debugStatus = processHarvestLine(chatLine);
		if (debugStatus === null) {
			if (debugUnknownLines) {
				updateChatHistory(historyKey, "[IGNORED]");
			}
			continue;
		}
		updateChatHistory(historyKey, debugStatus);
	}
}

// Process the raw chatbox output to extract clean chat lines, removing timestamps and handling line breaks appropriately.
function processChat(opts: Array<{ text: string }>) {
	let chatStr = "";

	for (let index = 0; index < opts.length; index++) {
		const text = opts[index].text;
		const hasTimestamp = timestampLineRegex.test(text);

		if (!hasTimestamp && index === 0) {
			continue;
		}

		if (hasTimestamp) {
			if (index > 0) chatStr += "\n";
			chatStr += text + " ";
			continue;
		}

		chatStr += text;
	}

	if (chatStr.trim() === "") return [];

	return chatStr
		.replace(/(\d) x x/g, "$1 x")
		.split("\n");
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

if (debugUnknownInput) {
	debugUnknownInput.checked = debugUnknownLines;

	debugUnknownInput.addEventListener("change", function () {
		debugUnknownLines = this.checked;

		const data = getSaveData();
		data.debugUnknownLines = debugUnknownLines;
		saveData(data);
	});
}

// Set initial state of fishing porters checkbox based on saved data
if (fishingPortersInput) {
	fishingPortersInput.checked = fishingUsePorters;
}

// Set initial sort button label
document.querySelectorAll(".skill-tab").forEach((btn) => {
	btn.classList.remove("active");
});

function updateHistoryWindow() {
	if (!historyWindow || historyWindow.closed) return;

	const doc = historyWindow.document;

	if (!doc.body) {
		setTimeout(updateHistoryWindow, 50);
		return;
	}

	if (!doc.body.dataset.initialized) {
		doc.title = "Resource Tracker History";

		doc.body.style.margin = "0";
		doc.body.style.background = "#1e1e1e";
		doc.body.style.color = "#ddd";
		doc.body.style.fontFamily = "Consolas, monospace";

		historyPre = doc.createElement("pre");
		historyPre.style.margin = "0";
		historyPre.style.padding = "3px";
		historyPre.style.whiteSpace = "pre-wrap";
		historyPre.style.overflowY = "auto";
		historyPre.style.height = "100vh";
		historyPre.style.boxSizing = "border-box";
		historyPre.style.fontSize = "10px";

		doc.body.replaceChildren(historyPre);
		doc.body.dataset.initialized = "true";
	}

	if (!historyPre) return;

	historyPre.textContent = [...recentLines].reverse().join("\n");
}

// Debug function to show recent chat history
function showChatHistory() {
	if (!historyWindow || historyWindow.closed) {
		historyWindow = window.open(
			"",
			"historyWindow",
			"width=350,height=450"
		);

		historyPre = null;
	}

	setTimeout(updateHistoryWindow, 50);
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
    "armadyl components",
	"ascended components",
	"avernic components",
	"bandos components",
	"brassican components",
	"clockwork components",
	"corporeal components",
	"culinary components",
	"cywir components",
	"dragonfire components",
	"ecliptic components",
	"explosive components",
	"faceted components",
	"fortunate components",
	"fungal components",
	"harnessed components",
	"ilujankan components",
	"hnightly components",
	"manufactured components",
	"noxious components",
	"oceanic components",
	"pestiferous components",
	"resilient components",
	"rumbling components",
	"saradomin components",
	"seren components",
	"shadow components",
	"shifting components",
	"silent components",
	"third-age components",
	"undead components",
	"zamorak components",
	"zaros components",
	"classic components",
	"historic components",
	"timeworn components",
	"vintage components"
]);

const uncommonComponents = new Set([
	"dextrous components",
	"direct components",
	"enhancing components",
	"ethereal components",
	"evasive components",
	"healthy components",
	"heavy components",
	"imbued components",
	"light components",
	"living components",
	"offcut components",
	"pious components",
	"powerful components",
	"precious components",
	"precise components",
	"protective components",
	"refined components",
	"sharp components",
	"strong components",
	"stunning components",
	"subtle components",
	"swift components",
	"variable components"
]);

// List of rare Seren spirit items that should be highlighted in the tracker.
const rareSerenItems = new Set([
    "hazelmere's signet ring",
    "blurberry special",
    "cheese+tom batta"
]);

const skillPatterns: Array<{
	pattern: RegExp;
	skill: SkillType;
}> = [
	{ pattern: /You manage to mine some\s+(.+?)\./i, skill: "mining" },
	{ pattern: /You mine (?:(?:some|an?)\s+)?(.+?)\./i, skill: "mining" },
	{ pattern: /You get some\s+(.+?)[!.]/i, skill: "woodcutting" },
	{ pattern: /You cut (?:(?:some|an?)\s+)?(.+?)\./i, skill: "woodcutting" },
	{ pattern: /You successfully cut (?:(?:some|an?)\s+)?(.+?)\./i, skill: "woodcutting" },
	{ pattern: /You chop (?:(?:some|an?)\s+)?(.+?)\./i, skill: "woodcutting" },
	{ pattern: /You catch (?:a|an|some)\s+(.+?)\./i, skill: "fishing" },
	{ pattern: /You find (?:a|an|some)\s+(.+?)\./i, skill: "archaeology" },
];

function repairComponentName(text: string, componentSet: Set<string>): string | null {
	const normalized = text
		.toLowerCase()
		.replace(/-/g, "e")
		.replace(/\./g, "p")
		.replace(/[^a-z]/g, "");

	for (const component of Array.from(componentSet)) {
		const componentNormalized = component
			.toLowerCase()
			.replace(/[^a-z]/g, "");

		const componentBase = componentNormalized.replace(/components$/, "");

		if (
			normalized.length >= 4 &&
			componentBase.startsWith(normalized)
		) {
			return component;
		}
	}

	return null;
}

// Process a single chat line to check for harvesting events and update the tracker accordingly.
function processHarvestLine(chatLine: string): string | null {
	const cleanLine = chatLine.replace(timestampRegex, "").trim();

	// cleanup what is actually processed
		const ignoredPrefixes = [
			"News:", "❆News:", "❆N-", "❆",
			"Grand Exchange:"
		];

		const ignoredSuffixes = [
			"money pouch."
		];

		if (
			ignoredPrefixes.some(prefix => cleanLine.startsWith(prefix)) ||
			ignoredSuffixes.some(suffix => cleanLine.toLowerCase().endsWith(suffix))
		) {
			return null;
		}
	
		// Check for Seren spirit's
		const serenMatch = cleanLine.match(
			/The Seren spirit gifts you:\s*(\d+)\s*x\s*(.+?)\./i
		);

		if (serenMatch) {
			const amount = parseInt(serenMatch[1], 10);
			const normalizedItem = normalizeItemName(serenMatch[2]);

			if (!normalizedItem || isNaN(amount)) return "[IGNORED]";

			const item = "﴾♦﴿ " + normalizedItem;

			const colorClass = rareSerenItems.has(normalizedItem)
				? "seren-item-red"
				: "seren-item";

			incrementItem(item, amount, "seren", colorClass, "seren-spirit");
			setStatus(`Seren Spirit: ${amount} x ${item}`);

			return `[COUNTED: ${item} +${amount}]`;
		}

	// Check for invention materials
	const materialsMatch = cleanLine.match(
		/Materials gained:\s*(.+)$/i
	);

	// If the line contains "Materials gained:"
	// we will attempt to parse it for invention materials. 
	if (materialsMatch) {
		const materialText = materialsMatch[1];

	// We will attempt to parse whatever material information we have.
	let finalMaterialText = materialText;

		// Clean badly chopped "components" endings
		finalMaterialText = finalMaterialText.replace(
			/\b([A-Za-z-]+)\s+co[\.\-a-z\s]*$/gi,
			"$1"
		);

			// Component name repair block
			finalMaterialText = finalMaterialText.replace(
				/(\d+\s*x\s+)([A-Za-z- ]+?)(?=,|\.|$)/gi,
				(match, prefix, brokenName) => {
					const repaired =
						repairComponentName(brokenName, rareComponents) ||
						repairComponentName(brokenName, uncommonComponents);

					return repaired
						? `${prefix}${repaired}`
						: match;
				}
			);

		// Then remove orphan comma tails
		if (/,\s*(components|parts|junk)$/i.test(finalMaterialText)) {
			console.warn("CUT OFF ITEM:", finalMaterialText);
			finalMaterialText = finalMaterialText.replace(/,\s*(components|parts|junk)$/i, ",");
		}
	// If the text is cut off, we can try to remove the last incomplete material entry to avoid parsing errors.
	// This way we can still track the complete materials listed before the cutoff.
		const materialRegex = /(\d+)\s*x\s*([^,\.]+?)(?:,|\.|$)/gi;
		let materialMatch: RegExpExecArray | null;
		const countedMaterials: string[] = [];
		const materialUpdates: ItemUpdate[] = [];

		while ((materialMatch = materialRegex.exec(finalMaterialText)) !== null) {
			const amount = parseInt(materialMatch[1], 10);
			const item = normalizeItemName(materialMatch[2]);

			if (!item || isNaN(amount)) continue;
			if (item === "junk") continue; // No need to track junk, it causes problems

			const isRareComponent = rareComponents.has(item);
			const isUncommonComponent = item.includes("components");
			const isInventionMaterial =
				isUncommonComponent ||
				item.includes("parts");

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

			materialUpdates.push({
				item,
				amount,
				skill: "invention",
				colorClass,
				source,
			});
			
			countedMaterials.push(`${titleCase(item)} +${amount}`);

			setStatus(`Invention: ${amount} x ${item}`);
		}	

		if (countedMaterials.length > 0) {
			incrementItems(materialUpdates, materialUpdates[materialUpdates.length - 1].item);

			const warning = finalMaterialText !== materialText ? " [PARTIAL READ]" : "";
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

		if (!item || isNaN(amount)) return "[IGNORED]";

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

		if (!item || isNaN(amount)) return "[IGNORED]";

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
	for (const entry of skillPatterns) {
		const match = cleanLine.match(entry.pattern);
		if (!match) continue;

		if (entry.skill === "fishing" && fishingUsePorters) {
			continue;
		}

		const item = normalizeItemName(match[1]);
		if (!item) return "[IGNORED]";

		incrementItem(item, 1, entry.skill);
		setStatus(`Tracked: ${item}`);
		return `[COUNTED: ${item} +1]`;
	}
	
	return null;
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
		};
	}

	try {
		const data = JSON.parse(raw);
		return {
			chat: data.chat,
			activeTab: data.activeTab || "all",
			fishingUsePorters: data.fishingUsePorters ?? true,
			sortMode: data.sortMode || "recent",
			debugUnknownLines: data.debugUnknownLines ?? false,
			items: data.items || {},
		};
	} catch {
		return {
			sortMode: "recent",
			debugUnknownLines: false,
			items: {},
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

function applyItemUpdate(data: SaveData, update: ItemUpdate, timestamp: number) {
	ensureItem(data, update.item);

	data.items[update.item].count += update.amount;
	data.items[update.item].skill = update.skill;
	data.items[update.item].lastUpdated = timestamp;

	if (update.colorClass) {
		data.items[update.item].colorClass = update.colorClass;
	}

	if (update.source) {
		data.items[update.item].source = update.source;
	}
}

function incrementItems(updates: ItemUpdate[], highlightItem?: string) {
	if (updates.length === 0) return;

	const data = getSaveData();
	const timestamp = Date.now();

	for (const update of updates) {
		applyItemUpdate(data, update, timestamp);
	}

	saveData(data);
	render(highlightItem || updates[updates.length - 1].item, data);
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
	incrementItems([{
		item,
		amount,
		skill,
		colorClass,
		source,
	}], item);
}

// Keep a history of recent chat lines to prevent processing duplicates and allow for debugging.
let recentLines: string[] = [];
let recentLineKeys: string[] = [];
const recentLineSet = new Set<string>();

function clearRecentHistory() {
	recentLines = [];
	recentLineKeys = [];
	recentLineSet.clear();
}

function isInHistory(chatLine: string) {
	return recentLineSet.has(chatLine);
}

// Add a new chat line to the history
function updateChatHistory(chatLine: string, debugStatus = "[IGNORED]") {
	const debugLine = `${chatLine} ${debugStatus}`;

	recentLines.push(debugLine);
	recentLineKeys.push(chatLine);
	recentLineSet.add(chatLine);

	if (recentLines.length > maxRecentHistory) {
		recentLines.shift();
		const oldKey = recentLineKeys.shift();

		if (oldKey) {
			recentLineSet.delete(oldKey);
		}
	}
	
	updateHistoryWindow();
}

// Render the tracker UI based on the current save data
function render(highlightItem?: string, data = getSaveData()) {
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
		return;
	}

	for (const item of items) {
		renderItemRow(item, data.items[item], highlightItem);
	}
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
	tracker.addEventListener("click", (e: Event) => {
		const target = (e.target as HTMLElement).closest("button[data-item]") as HTMLElement | null;
		if (!target) return;

		const item = target.dataset.item || "";

		if (target.classList.contains("cog-btn")) {
			toggleSettings(item);
		} else if (target.classList.contains("clear-goal")) {
			clearGoal(item);
		} else if (target.classList.contains("save-goal")) {
			setGoal(item);
		} else if (target.classList.contains("reset-item")) {
			resetItem(item);
		} else if (target.classList.contains("delete-item")) {
			deleteItem(item);
		}
	});
}

bindRowEvents();

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
		clearRecentHistory();

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
				debugUnknownLines: imported.debugUnknownLines ?? false,
				items: imported.items || {},
			};

			saveData(data);

			debugUnknownLines = data.debugUnknownLines ?? false;

			if (debugUnknownInput) {
				debugUnknownInput.checked = debugUnknownLines;
			}

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

//============================
// Hey you, listen to this...
//============================

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

historyButton.addEventListener("click", showChatHistory);

exportButton.addEventListener("click", exportData);

importInput.addEventListener("change", function () {
	if (this.files && this.files[0]) {
		importData(this.files[0]);
		this.value = "";
	}
});
