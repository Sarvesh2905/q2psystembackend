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
      "SELECT COUNT(*) AS cnt FROM buyer WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM buyer WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// all buyers
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Customer, Buyer_name AS Buyername, Designation, email1, email2,
              contact, Location, Segment, status, Comments
       FROM buyer ORDER BY Customer ASC, Buyer_name ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// active customers for dropdown
router.get("/customers", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT customer_name AS customername, Location, customer_country AS customercountry
       FROM customer WHERE status = 'Active' ORDER BY customer_name ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate checks
router.get("/check", authMiddleware, async (req, res) => {
  const { customer, buyer, email1, email2, contact1, contact2, contact3 } =
    req.query;
  try {
    if (customer && buyer) {
      const [rows] = await pool.query(
        `SELECT Buyer_name FROM buyer
         WHERE LOWER(Customer) = ? AND LOWER(Buyer_name) = ?`,
        [customer.toLowerCase(), buyer.toLowerCase()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "buyer",
          message: "This Buyer already exists for the selected Customer.",
        });
    }

    if (email1) {
      const [r1] = await pool.query(
        `SELECT email1 FROM buyer WHERE LOWER(email1) = ?`,
        [email1.toLowerCase()],
      );
      if (r1.length > 0)
        return res.json({
          exists: true,
          field: "email1",
          message: "Email 1 already exists.",
        });

      const [r2] = await pool.query(
        `SELECT email2 FROM buyer WHERE LOWER(email2) = ?`,
        [email1.toLowerCase()],
      );
      if (r2.length > 0)
        return res.json({
          exists: true,
          field: "email1",
          message: "Email already exists in Email 2.",
        });
    }

    if (email2) {
      const [r1] = await pool.query(
        `SELECT email2 FROM buyer WHERE LOWER(email2) = ?`,
        [email2.toLowerCase()],
      );
      if (r1.length > 0)
        return res.json({
          exists: true,
          field: "email2",
          message: "Email 2 already exists.",
        });

      const [r2] = await pool.query(
        `SELECT email1 FROM buyer WHERE LOWER(email1) = ?`,
        [email2.toLowerCase()],
      );
      if (r2.length > 0)
        return res.json({
          exists: true,
          field: "email2",
          message: "Email already exists in Email 1.",
        });
    }

    if (contact1 || contact2 || contact3) {
      const [allContacts] = await pool.query(
        `SELECT contact FROM buyer WHERE contact IS NOT NULL`,
      );
      const allNums = [];
      allContacts.forEach((row) => {
        if (row.contact)
          row.contact
            .split(",")
            .forEach((c) => allNums.push(c.trim().toLowerCase()));
      });
      if (contact1 && allNums.includes(contact1.toLowerCase()))
        return res.json({
          exists: true,
          field: "contact1",
          message: "Mobile number already exists.",
        });
      if (contact2 && allNums.includes(contact2.toLowerCase()))
        return res.json({
          exists: true,
          field: "contact2",
          message: "Landline already exists.",
        });
      if (contact3 && allNums.includes(contact3.toLowerCase()))
        return res.json({
          exists: true,
          field: "contact3",
          message: "Fax already exists.",
        });
    }

    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// add buyer
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let {
    Customer,
    Buyername,
    Designation,
    email1,
    email2,
    contact1,
    contact2,
    contact3,
    Location,
    Segment,
    Comments,
  } = req.body;

  if (!Customer || !Buyername)
    return res
      .status(400)
      .json({ message: "Customer and Buyer Name are required." });

  const contact =
    [contact1, contact2, contact3].filter((c) => c && c.trim()).join(",") ||
    null;

  try {
    await pool.query(
      `INSERT INTO buyer
        (Customer, Buyer_name, Designation, email1, email2,
         contact, Location, Segment, status, Comments)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        Customer,
        Buyername,
        Designation || null,
        email1 || null,
        email2 || null,
        contact,
        Location || "",
        Segment || null,
        "Active",
        Comments || "",
      ],
    );
    res.json({ success: true, message: "Buyer added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// edit buyer
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { Designation, email1, email2, contact1, contact2, contact3, Comments } =
    req.body;

  const contact =
    [contact1, contact2, contact3].filter((c) => c && c.trim()).join(",") ||
    null;

  try {
    const [result] = await pool.query(
      `UPDATE buyer SET Designation=?, email1=?, email2=?, contact=?, Comments=?
       WHERE Sno=?`,
      [
        Designation || null,
        email1 || null,
        email2 || null,
        contact,
        Comments || "",
        sno,
      ],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Buyer updated successfully!" });
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
    await pool.query("UPDATE buyer SET status=? WHERE Sno=?", [status, sno]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
