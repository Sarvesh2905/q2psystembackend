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
      "SELECT COUNT(*) AS cnt FROM spcl_discount WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM spcl_discount WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// all special-discount customers
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Name, status FROM spcl_discount ORDER BY Name ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// customer list for dropdown
router.get("/customers", authMiddleware, async (req, res) => {
  try {
    const [customers] = await pool.query(
      `SELECT customer_name AS customername, Location
       FROM customer WHERE status='Active' ORDER BY customer_name ASC`,
    );
    res.json(
      customers.map((c) => ({
        value: c.customername,
        label: c.Location
          ? `${c.customername} - ${c.Location}`
          : c.customername,
      })),
    );
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate name check
router.get("/check", authMiddleware, async (req, res) => {
  const custname = (req.query.custname || "").toLowerCase().replace(/\s/g, "");
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(Name), ' ', '')) AS nm FROM spcl_discount`,
    );
    const exists = rows.some((r) => r.nm === custname);
    if (exists)
      return res.json({
        exists: true,
        message:
          "This Customer already exists in Special Discount. Please select a different one.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ADD special-discount customer
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { Name } = req.body;
  if (!Name || !Name.trim())
    return res.status(400).json({ message: "Name (Customer) is required." });

  try {
    const [rows] = await pool.query(
      `SELECT LOWER(REPLACE(TRIM(Name), ' ', '')) AS nm FROM spcl_discount`,
    );
    const normalised = Name.toLowerCase().replace(/\s/g, "");
    if (rows.some((r) => r.nm === normalised))
      return res.status(409).json({
        message:
          "Special discount with this name already exists. Please enter a different name.",
      });

    await pool.query(
      `INSERT INTO spcl_discount (Name, status) VALUES (?, 'Active')`,
      [Name.trim()],
    );
    res.json({
      success: true,
      message: "Special Discount added successfully!",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
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
    if (status === "Inactive") {
      try {
        // Check for open quotes: Opportunity_stage not Regret/Cancelled/Won
        const [openQuotes] = await pool.query(
          `SELECT Quote_number FROM quote_register
           WHERE Customer_name IN (SELECT Name FROM spcl_discount WHERE Sno=?)
             AND (Opportunity_stage IS NULL
               OR UPPER(TRIM(Opportunity_stage)) NOT IN ('REGRET','CANCELLED','WON'))`,
          [sno],
        );
        if (openQuotes.length > 0) {
          const quotenumbers = openQuotes.map((q) => q.Quote_number).join(", ");
          return res.json({
            openquote: true,
            message: `There are Open Quotes with this Customer: ${quotenumbers}`,
          });
        }
      } catch {
        // proceed with toggle if subquery fails
      }
    }

    await pool.query(`UPDATE spcl_discount SET status=? WHERE Sno=?`, [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
