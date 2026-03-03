const seatKey = (row, col) => {
  const normalizedRow = String(row ?? "").trim();
  const normalizedCol = Number(col);
  return `${normalizedRow}:${normalizedCol}`;
};

module.exports = { seatKey };
