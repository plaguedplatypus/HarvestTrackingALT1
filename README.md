# Plague's Resource Tracker

An Alt1 Toolkit app that started as a simple mining tracker has gradually grown into a full-featured gathering companion for multiple skills. Designed to automatically track gathered resources, special rewards, and progress toward long-term goals. Utilizes chat box timestamps for duplicate protection and accurate tracking. Certain skills may require the use of Porters/GOTE to track.

## Features

### Goal Tracking

- Set goals for any tracked item
- Progress bars
- Percentage completion
- Persistent save data

### Gathering Resource Tracking

Tracked resources are automatically categorized into tabs:

- All
- Mining
- Woodcutting
- Fishing
- Archaeology
- Seren Spirits
- Other

### Seren Spirit / Divine Blessing Tracking

Dedicated tracking for:

- Seren Spirit rewards
- Divine Blessing rewards

Rewards are displayed separately and color-coded for easy identification.

### Quality of Life

- Recent items automatically sort to the top
- Per-item goal management
- Per-item reset and delete
- Clear current tab
- Import / Export save data
- Remembers selected tab
- Scrollable item list
- Timestamped status updates
- Compact Alt1-friendly UI

### Fishing Modes

Due to how fishing with Porters or GOTE sends duplicate messages to the chat box a toggle allows switching between methods to prevent duplicate tracking.

Supports both:

- Tracking banked fish through Porter/GotE transport messages
- Tracking fish directly from catch messages

## Installation

1. Open the app URL in Alt1. 
    alt1://addapp/https://plaguedplatypus.github.io/PlaguesResourceTracking/appconfig.json
2. Allow:
   - View Screen
   - Get Game State
   - Show Overlay
3. Select the desired chatbox if prompted.
4. Start gathering.

## Known Issues

- Resources may occasionally appear in the **Other** tab until categorized.
- Some gathering methods may not yet have dedicated support.
- Additional Seren Spirit and Blessing of the Gods rewards may need to be added over time.

## Credit

Based on the Alt1 app structure of SerenTracker by ZeroGwafa, reworked as a general item tracker.
