# OwnerDashboard.js Tournament Fixes - Implementation Steps

## Completed

- [x] Create TODO.md with implementation steps
- [x] Step 1: Add availableCourts state + update gym selection logic ✅

## Remaining Steps

1. **Add Court Selection UI** section in tournament modal JSX (after gym selector)
2. **Remove Entry Fee** - delete state, JSX, validation, tournamentData prop
3. **Update Tournament Time** - change placeholder, add HH:MM-HH:MM regex validation + start<end check
4. **Remove Max Teams** - delete state, JSX, tournamentData prop
5. **Cleanup** openTournamentModal/resetTournamentForm calls for removed states
6. **Test** modal flow: gym select → courts display/select → time validate → save
7. **attempt_completion** once verified

**Current: Step 4 - Tournament Time & Max Teams**
