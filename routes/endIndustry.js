const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

// ── GET all (A-Z by Industry) ─────────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Industry, Description FROM endindustry ORDER BY Industry ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate Industry (fires on input blur) ────────────────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const ind = (req.query.ind || "").toLowerCase().replace(/\s+/g, "");
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(Industry),' ','')) as nm FROM endindustry`,
    );
    const exists = rows.some((r) => r.nm === ind);
    if (exists)
      return res.json({
        exists: true,
        message:
          "The End Industry already exists. Please enter a different one.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── ADD ───────────────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Industry, Description } = req.body;
  if (!Industry || !Industry.trim())
    return res.status(400).json({ message: "Industry is required." });

  // Same as original: ind.upper()
  Industry = Industry.trim().toUpperCase();

  try {
    // Duplicate check
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(Industry),' ','')) as nm FROM endindustry`,
    );
    const normalised = Industry.toLowerCase().replace(/\s+/g, "");
    if (rows.some((r) => r.nm === normalised))
      return res.status(409).json({
        message:
          "The End Industry already exists. Please enter a different one.",
      });

    const [maxRow] = await pool.query(
      "SELECT MAX(Sno) as maxSno FROM endindustry",
    );
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      `INSERT INTO endindustry (Sno, Industry, Description) VALUES (?, ?, ?)`,
      [newSno, Industry, Description?.trim() || null],
    );
    res.json({ success: true, message: "End Industry added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── EDIT (Industry locked — only Description editable) ────────────────────────
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { Description } = req.body;

  try {
    await pool.query(`UPDATE endindustry SET Description=? WHERE Sno=?`, [
      Description?.trim() || null,
      sno,
    ]);
    res.json({ success: true, message: "End Industry updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
