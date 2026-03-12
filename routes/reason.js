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

// ── GET all (A-Z by ReasonCode) ───────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, ReasonCode, Description FROM reason ORDER BY ReasonCode ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate ReasonCode ─────────────────────────────────────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.reason || "").toLowerCase().replace(/\s+/g, "");
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(ReasonCode),' ','')) as nm FROM reason`,
    );
    const exists = rows.some((r) => r.nm === val);
    if (exists)
      return res.json({
        exists: true,
        message: "The Reason already exists.",
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

  let { ReasonCode, Description } = req.body;

  if (!ReasonCode || !ReasonCode.trim())
    return res.status(400).json({ message: "Reason Code is required." });
  if (!Description || !Description.trim())
    return res.status(400).json({ message: "Description is required." });

  ReasonCode = ReasonCode.trim().toUpperCase(); // reason.upper() from original
  Description = Description.trim();

  try {
    // Duplicate check
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(ReasonCode),' ','')) as nm FROM reason`,
    );
    const normalised = ReasonCode.toLowerCase().replace(/\s+/g, "");
    if (rows.some((r) => r.nm === normalised))
      return res.status(409).json({ message: "The Reason already exists." });

    const [maxRow] = await pool.query("SELECT MAX(Sno) as maxSno FROM reason");
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      `INSERT INTO reason (Sno, ReasonCode, Description) VALUES (?, ?, ?)`,
      [newSno, ReasonCode, Description],
    );
    res.json({ success: true, message: "Reason added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── EDIT (ReasonCode locked — only Description editable) ──────────────────────
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { Description } = req.body;

  if (!Description || !Description.trim())
    return res.status(400).json({ message: "Description is required." });

  Description = Description.trim();

  try {
    await pool.query(`UPDATE reason SET Description=? WHERE Sno=?`, [
      Description,
      sno,
    ]);
    res.json({ success: true, message: "Reason updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
