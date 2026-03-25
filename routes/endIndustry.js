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

// GET all end industries
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Industry, Description FROM end_industry ORDER BY Industry ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// counts
router.get("/counts", authMiddleware, async (req, res) => {
  try {
    const [[total]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM end_industry`,
    );
    res.json({ total: total.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate check
router.get("/check", authMiddleware, async (req, res) => {
  const ind = (req.query.ind || "").toLowerCase().replace(/\s/g, "");
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(Industry), ' ', '')) AS nm FROM end_industry`,
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

// ADD end industry
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Industry, Description } = req.body;
  if (!Industry || !Industry.trim())
    return res.status(400).json({ message: "Industry is required." });

  Industry = Industry.trim().toUpperCase();

  try {
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(Industry), ' ', '')) AS nm FROM end_industry`,
    );
    const normalised = Industry.toLowerCase().replace(/\s/g, "");
    if (rows.some((r) => r.nm === normalised))
      return res.status(409).json({
        message:
          "The End Industry already exists. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO end_industry (Industry, Description) VALUES (?, ?)`,
      [Industry, Description?.trim() || null],
    );
    res.json({ success: true, message: "End Industry added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// EDIT (Description only, Industry locked)
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { Description } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE end_industry SET Description=? WHERE Sno=?`,
      [Description?.trim() || null, sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "End Industry updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
