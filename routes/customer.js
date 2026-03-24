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

// all customers
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno,
              customer_name    AS customername,
              customer_type    AS customertype,
              customer_country AS customercountry,
              Address,
              City, State, Region,
              Sub_Region       AS SubRegion,
              Location,
              Category,
              Short_name       AS Shortname,
              Ltsa_code        AS Ltsacode,
              Segment, status
       FROM customer ORDER BY customer_name ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// customer types from quote_data
router.get("/custtypes", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quote_data WHERE Type = 'Customertype' AND Status = 'Active' ORDER BY Data ASC`,
    );
    res.json(rows.map((r) => r.Data));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// countries
router.get("/countries", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Country_name FROM country WHERE status = 'Active' ORDER BY Country_name ASC`,
    );
    res.json(rows.map((r) => r.Country_name));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// categories
router.get("/categories", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT Category FROM customer WHERE status = 'Active' AND Category != '' ORDER BY Category ASC`,
    );
    res.json(rows.map((r) => r.Category));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate checks
router.get("/check", authMiddleware, async (req, res) => {
  const { name, location, city, country } = req.query;
  try {
    if (name && !location) {
      const [rows] = await pool.query(
        `SELECT customer_name FROM customer
         WHERE LOWER(REPLACE(TRIM(customer_name),' ','')) = ?`,
        [name.toLowerCase().replace(/\s/g, "")],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "name",
          message:
            "Customer name already exists. You may add a different Location for the same customer.",
        });
    }
    if (name && location) {
      const [rows] = await pool.query(
        `SELECT Location FROM customer
         WHERE LOWER(customer_name) = ? AND LOWER(REPLACE(TRIM(Location),' ','')) = ?`,
        [name.toLowerCase(), location.toLowerCase().replace(/\s/g, "")],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "location",
          message: "This Location already exists for the customer.",
        });
    }
    if (city && country && city.toLowerCase() === country.toLowerCase())
      return res.json({
        exists: true,
        field: "city",
        message: "City and Country must not be the same.",
      });

    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// add customer
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let {
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

  if (!customername || !customertype || !customercountry)
    return res
      .status(400)
      .json({ message: "Name, Type and Country are required." });

  customername = customername.trim();
  customertype = (customertype || "").toUpperCase();
  customercountry = (customercountry || "").toUpperCase();
  City = City?.trim() || "";
  State = State?.trim() || "";
  Region = Region?.trim() || "";
  SubRegion = SubRegion?.trim() || "";
  Location = Location?.trim() || "";
  Category = Category?.trim() || "";
  Shortname = Shortname?.trim() || "";
  Ltsacode = Ltsacode?.trim() || null;
  Segment = Segment?.trim() || "Industrial";

  try {
    await pool.query(
      `INSERT INTO customer
        (customer_name, customer_type, customer_country, Address, City, State,
         Region, Sub_Region, Location, Category, Short_name, Ltsa_code, Segment, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        customername,
        customertype,
        customercountry,
        Address || null,
        City,
        State,
        Region,
        SubRegion,
        Location,
        Category,
        Shortname,
        Ltsacode,
        Segment,
        "Active",
      ],
    );
    res.json({ success: true, message: "Customer added successfully!" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({
        message: "Customer with this name and location already exists.",
      });
    res.status(500).json({ message: "Server error" });
  }
});

// edit customer
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let {
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
      `UPDATE customer SET Address=?, City=?, State=?, Region=?, Sub_Region=?,
       Location=?, Category=?, Short_name=?, Ltsa_code=?, Segment=? WHERE Sno=?`,
      [
        Address || null,
        City || "",
        State || "",
        Region || "",
        SubRegion || "",
        Location || "",
        Category || "",
        Shortname || "",
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
    await pool.query("UPDATE customer SET status=? WHERE Sno=?", [status, sno]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
