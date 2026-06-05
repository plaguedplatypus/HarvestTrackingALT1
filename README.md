# HarvestTracker Alt1 App

A compact Alt1 Toolkit app forked from ComponentCounter's chatbox-reader structure and repurposed to track harvested items from RuneScape chat.

## What it tracks

The prototype watches visible RuneScape chat and increments items from messages like:

- `You get some maple logs.`
- `You manage to mine some copper ore.`
- `You mine some copper ore.`
- `You cut some logs.`
- `You catch a raw lobster.`

## UI

Rows stay compact:

```text
copper ore: 28  Goal: 28/41 (68.3%) [bar] ⚙
```

If no goal is set, it only shows:

```text
copper ore: 28 ⚙
```

Click the cog to set/remove a goal, reset that item, or delete that item.

## Notes

This is still a prototype. If OCR misses chat lines, try:

- keeping the RuneScape chatbox fully visible
- selecting the correct chatbox from Settings
- using normal interface scaling while testing
- disabling chat transparency if OCR is inconsistent

## Original base

Built from the structure of ZeroGwafa's ComponentCounter Alt1 app and modified into a generalized harvest tracker.
