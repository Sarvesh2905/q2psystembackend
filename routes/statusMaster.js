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
router.get("/counts", authMiddleware, async (req, res) => {
  try {
    const [[active]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM quotedata WHERE Type='Status' AND Status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM quotedata WHERE Type='Status' AND Status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET all Opportunity Stages (A-Z by Data) ──────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Data, Description, Status
       FROM quotedata WHERE Type = 'Opportunitystage' ORDER BY Data ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate Data ───────────────────────────────────────────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.status || "").toLowerCase().replace(/\s+/g, "");
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(Data),' ','')) as nm
       FROM quotedata WHERE Type = 'Opportunitystage'`,
    );
    const exists = rows.some((r) => r.nm === val);
    if (exists)
      return res.json({
        exists: true,
        message: "The Status already exists. Please enter a different one.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── ADD ────────────────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Data, Description } = req.body;
  if (!Data || !Data.trim())
    return res.status(400).json({ message: "Status is required." });

  Data = Data.trim().toUpperCase(); // status.upper() from original

  try {
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(Data),' ','')) as nm
       FROM quotedata WHERE Type = 'Opportunitystage'`,
    );
    const normalised = Data.toLowerCase().replace(/\s+/g, "");
    if (rows.some((r) => r.nm === normalised))
      return res.status(409).json({
        message: "The Status already exists. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO quotedata (Data, Type, Description, Status)
       VALUES (?, 'Opportunitystage', ?, 'Active')`,
      [Data, Description?.trim() || null],
    );
    res.json({ success: true, message: "Status added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── EDIT (only Description editable — Data is locked) ─────────────────────────
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { Description } = req.body;

  try {
    await pool.query(
      `UPDATE quotedata SET Description=? WHERE Sno=? AND Type='Opportunitystage'`,
      [Description?.trim() || null, sno],
    );
    res.json({ success: true, message: "Status updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── TOGGLE status ──────────────────────────────────────────────────────────────
router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;

  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status." });

  try {
    await pool.query(
      `UPDATE quotedata SET Status=? WHERE Sno=? AND Type='Opportunitystage'`,
      [status, sno],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
