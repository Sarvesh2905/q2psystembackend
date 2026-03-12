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

// ── GET all (A-Z) ─────────────────────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Data AS CountryType, Status AS status
       FROM quotedata WHERE Type = 'Customertype' ORDER BY Data ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate ───────────────────────────────────────────────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.val || "").toLowerCase().replace(/\s+/g, "");
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(Data),' ','')) as nm
       FROM quotedata WHERE Type = 'Customertype'`,
    );
    const exists = rows.some((r) => r.nm === val);
    if (exists)
      return res.json({
        exists: true,
        message:
          "The Country Type already exists. Please enter a different one.",
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

  let { CountryType } = req.body;
  if (!CountryType || !CountryType.trim())
    return res.status(400).json({ message: "Country Type is required." });

  CountryType = CountryType.trim().toUpperCase();

  try {
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(Data),' ','')) as nm
       FROM quotedata WHERE Type = 'Customertype'`,
    );
    const normalised = CountryType.toLowerCase().replace(/\s+/g, "");
    if (rows.some((r) => r.nm === normalised))
      return res.status(409).json({
        message:
          "The Country Type already exists. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO quotedata (Data, Type, Status) VALUES (?, 'Customertype', 'Active')`,
      [CountryType],
    );
    res.json({ success: true, message: "Country Type added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── TOGGLE status ─────────────────────────────────────────────────────────────
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
      `UPDATE quotedata SET Status=? WHERE Sno=? AND Type='Customertype'`,
      [status, sno],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
