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

// counts
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

// all countries
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Country_code, Country_name, Region, Currency,
              Currency_Name, Conversion_rate, status
       FROM country ORDER BY Country_name ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate country code check
router.get("/check", authMiddleware, async (req, res) => {
  const { countrycode } = req.query;
  try {
    if (countrycode) {
      const [rows] = await pool.query(
        `SELECT Country_code FROM country WHERE LOWER(Country_code) = ?`,
        [countrycode.toLowerCase()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "Country_code",
          message: "Country code already exists. Please enter a different one.",
        });
    }
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// add country
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let {
    Country_code,
    Country_name,
    Region,
    Currency,
    Currency_Name,
    Conversion_rate,
  } = req.body;

  if (
    !Country_code ||
    !Country_name ||
    !Currency ||
    Conversion_rate === undefined ||
    Conversion_rate === null ||
    Conversion_rate === ""
  ) {
    return res.status(400).json({
      message:
        "Country Code, Name, Currency Code and Conversion Rate are required.",
    });
  }

  Country_code = Country_code.trim().toUpperCase();
  Country_name = Country_name.trim().toUpperCase();
  Region = Region?.trim()
    ? Region.trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  Currency = Currency.trim().toUpperCase();
  Currency_Name = Currency_Name?.trim()
    ? Currency_Name.trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  const convRate = parseFloat(Conversion_rate) || 0;

  try {
    const [existing] = await pool.query(
      `SELECT Country_name FROM country WHERE UPPER(Country_name) = ?`,
      [Country_name],
    );
    if (existing.length > 0)
      return res.status(409).json({
        message: "The Country already exists. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO country
         (Country_code, Country_name, Region, Currency, Currency_Name, Conversion_rate, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Active')`,
      [Country_code, Country_name, Region, Currency, Currency_Name, convRate],
    );
    res.json({ success: true, message: "Country added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// edit country (Region and Conversion_rate only)
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { Region, Conversion_rate } = req.body;

  Region = Region?.trim()
    ? Region.trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  const convRate = parseFloat(Conversion_rate) || 0;

  try {
    const [result] = await pool.query(
      `UPDATE country SET Region=?, Conversion_rate=? WHERE Sno=?`,
      [Region, convRate, sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Country updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// toggle status
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
