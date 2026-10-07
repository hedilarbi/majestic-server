const { seatKey } = require("./seatKey");

// Seats are stored by grid position (row + col), and aisles ("couloir") take
// grid columns too. The number shown to people (tickets, seat map) only counts
// chairs: e.g. chair, chair, aisle, chair -> 1, 2, -, 3.
const buildSeatNumberMap = (layout) => {
  const chairsByRow = new Map();

  (Array.isArray(layout) ? layout : []).forEach((cell) => {
    if (!cell || cell.cellType !== "chaise") {
      return;
    }
    const row = String(cell.row ?? "").trim();
    const col = Number(cell.col);
    if (!row || !Number.isFinite(col)) {
      return;
    }
    if (!chairsByRow.has(row)) {
      chairsByRow.set(row, []);
    }
    chairsByRow.get(row).push(col);
  });

  const map = new Map();
  chairsByRow.forEach((cols, row) => {
    cols
      .sort((a, b) => a - b)
      .forEach((col, index) => {
        map.set(seatKey(row, col), index + 1);
      });
  });

  return map;
};

const getSeatNumber = (seatNumberMap, seat) =>
  seatNumberMap.get(seatKey(seat?.row, seat?.col)) ?? null;

// Display label such as "E10". Falls back to the grid column for seats saved
// before seat numbers existed.
const formatSeatLabel = (seat) => {
  if (!seat) {
    return "";
  }
  const number = seat.number ?? seat.col ?? "";
  return `${seat.row || ""}${number}`;
};

module.exports = {
  buildSeatNumberMap,
  getSeatNumber,
  formatSeatLabel,
};
