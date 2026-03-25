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
      "SELECT COUNT(*) AS cnt FROM customer WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM customer WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, customer_name AS customername, customer_type AS customertype,
              customer_country AS customercountry, Address, City, State,
              Region, Sub_Region AS SubRegion, Location, Category,
              Short_name AS Shortname, Ltsa_code AS Ltsacode, Segment, status
       FROM customer ORDER BY customer_name ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/custtypes", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quote_data
       WHERE Type = 'Customertype' AND Status = 'Active'
       ORDER BY Data ASC`,
    );
    res.json(rows.map((r) => r.Data));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/countries", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Country_name FROM country
       WHERE status = 'Active' ORDER BY Country_name ASC`,
    );
    res.json(rows.map((r) => r.Country_name));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/categories", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT Category FROM customer
       WHERE Category IS NOT NULL AND Category != ''
       ORDER BY Category ASC`,
    );
    res.json(rows.map((r) => r.Category));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/check", authMiddleware, async (req, res) => {
  const name = (req.query.name || "").trim().toLowerCase();
  if (!name) return res.json({ exists: false });
  try {
    const [rows] = await pool.query(
      `SELECT customer_name FROM customer WHERE LOWER(TRIM(customer_name)) = ?`,
      [name],
    );
    if (rows.length > 0)
      return res.json({
        exists: true,
        message: "This Customer already exists. Please enter a different one.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const {
    customername,
    customertype,
    customercountry,
    Address,
    City,
    State,
    Region,
    SubRegion,
    Location,
    Category,
    Shortname,
    Ltsacode,
    Segment,
  } = req.body;

  if (!customername || !customername.trim())
    return res.status(400).json({ message: "Customer Name is required." });
  if (!customertype)
    return res.status(400).json({ message: "Customer Type is required." });
  if (!customercountry)
    return res.status(400).json({ message: "Country is required." });

  try {
    const [existing] = await pool.query(
      `SELECT customer_name FROM customer WHERE LOWER(TRIM(customer_name)) = ?`,
      [customername.trim().toLowerCase()],
    );
    if (existing.length > 0)
      return res.status(409).json({
        message: "This Customer already exists. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO customer
        (customer_name, customer_type, customer_country, Address, City, State,
         Region, Sub_Region, Location, Category, Short_name, Ltsa_code, Segment, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        customername.trim(),
        customertype,
        customercountry,
        Address || null,
        City || null,
        State || null,
        Region || null,
        SubRegion || null,
        Location || null,
        Category || null,
        Shortname || null,
        Ltsacode || null,
        Segment || "Industrial",
        "Active",
      ],
    );
    res.json({ success: true, message: "Customer added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const {
    Address,
    City,
    State,
    Region,
    SubRegion,
    Location,
    Category,
    Shortname,
    Ltsacode,
    Segment,
  } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE customer
       SET Address=?, City=?, State=?, Region=?, Sub_Region=?,
           Location=?, Category=?, Short_name=?, Ltsa_code=?, Segment=?
       WHERE Sno=?`,
      [
        Address || null,
        City || null,
        State || null,
        Region || null,
        SubRegion || null,
        Location || null,
        Category || null,
        Shortname || null,
        Ltsacode || null,
        Segment || "Industrial",
        sno,
      ],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Customer updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;
  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status." });

  try {
    await pool.query(`UPDATE customer SET status=? WHERE Sno=?`, [status, sno]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
