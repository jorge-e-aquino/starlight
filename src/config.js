// Which courses from the schema get drawn on the map.
// Drop an id from this list to take a course off the map.
// Available ids: mgt2250, econ2105, mgt3101, mgt4803.
export const ENABLED_COURSES = ['mgt2250', 'econ2105', 'mgt3101', 'mgt4803'];

// Time scale.
export const PX_PER_DAY = 26;
export const GUTTER = 216; // width of the sticky label column
export const EDGE_PAD_DAYS = 4; // breathing room on each end of the semester

// Node sizing per item type. Radii in px.
export const NODE_SIZE = {
  regular: 7,
  recurring: 8,
  exam: 15,
  final: 19,
  standing: 0 // standing items are not nodes; they render as a status band
};

// Vertical rhythm.
export const LANE_HEIGHT = 52;
export const SUBROW_HEIGHT = 34; // extra height per collision sub-row inside a lane
