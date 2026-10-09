/**
 * Gameplay constants shared by the client engine and the server-side match
 * validation. Changing any of these changes what the leaderboard accepts.
 */

/** Match length in game seconds (career / quick match). */
export const MATCH_SECONDS = 90;
/** PvP Rivalry match length. */
export const PVP_SECONDS = 120;

/** Clock time a goal celebration takes before the kickoff (the clock keeps running). */
export const CELEBRATION_MS = 3000;
/**
 * Fastest possible goal cycle: celebration + kickoff + running from the centre
 * spot into the box at top speed. Bounds how many goals a match can hold.
 */
export const MIN_MS_PER_GOAL = 4000;

/** GOAT points. */
export const GOAL_POINTS = 100;
export const ASSIST_POINTS = 60;
export const BRACE_BONUS = 50;
export const HAT_TRICK_BONUS = 150;
export const TROPHY_POINTS = 200;
export const BALLON_DOR_POINTS = 300;

/** Career points needed to unlock the title "THE GOAT". */
export const GOAT_TITLE_POINTS = 6000;
