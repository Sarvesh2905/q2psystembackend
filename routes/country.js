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
      "SELECT COUNT(*) AS cnt FROM country WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM country WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// ── GET all (A-Z by Countryname) ──────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Countrycode, Countryname, Region, Currency,
              CurrencyName, Conversionrate, status
       FROM country ORDER BY Countryname ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate Countrycode ───────────────────────────────────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const { countrycode } = req.query;
  try {
    if (countrycode) {
      const [rows] = await pool.query(
        `SELECT Countrycode FROM country WHERE LOWER(Countrycode) = ?`,
        [countrycode.toLowerCase()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "Countrycode",
          message: "Country code already exists. Please enter a different one.",
        });
    }
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── ADD country ───────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let {
    Countrycode,
    Countryname,
    Region,
    Currency,
    CurrencyName,
    Conversionrate,
  } = req.body;

  if (!Countrycode || !Countryname || !Currency || !Conversionrate)
    return res
      .status(400)
      .json({
        message:
          "Country Code, Name, Currency Code and Conversion Rate are required.",
      });

  // Apply casing as per original
  Countrycode = Countrycode.trim().toUpperCase();
  Countryname = Countryname.trim().toUpperCase();
  Region = Region?.trim()
    ? Region.trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  Currency = Currency.trim().toUpperCase();
  CurrencyName = CurrencyName?.trim()
    ? CurrencyName.trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  const convRate = parseFloat(Conversionrate) || 0;

  try {
    // Check for existing Countryname at DB level too
    const [existing] = await pool.query(
      `SELECT Countryname FROM country WHERE UPPER(Countryname) = ?`,
      [Countryname],
    );
    if (existing.length > 0)
      return res
        .status(409)
        .json({
          message: "The Country already exists. Please enter a different one.",
        });

    const [maxRow] = await pool.query("SELECT MAX(Sno) as maxSno FROM country");
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      `INSERT INTO country (Sno, Countrycode, Countryname, Region, Currency, CurrencyName, Conversionrate, status)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        newSno,
        Countrycode,
        Countryname,
        Region,
        Currency,
        CurrencyName,
        convRate,
        "Active",
      ],
    );
    res.json({ success: true, message: "Country added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── EDIT country (Countryname + Currency locked, Region + Conversionrate editable) ──
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { Region, Conversionrate } = req.body;

  Region = Region?.trim() ? Region.trim().toUpperCase() : null;
  const convRate = parseFloat(Conversionrate) || 0;

  try {
    const [result] = await pool.query(
      `UPDATE country SET Region=?, Conversionrate=? WHERE Sno=?`,
      [Region, convRate, sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Country updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
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
    await pool.query("UPDATE country SET status=? WHERE Sno=?", [status, sno]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
