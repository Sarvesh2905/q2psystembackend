// routes/enquiry.js
const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const jwt     = require("jsonwebtoken");
require("dotenv").config();

/* ════════════════════════════════════════
   AUTH MIDDLEWARE
════════════════════════════════════════ */
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

/* ════════════════════════════════════════
   HELPERS
════════════════════════════════════════ */
function parseDate(dateStr) {
  if (!dateStr || !String(dateStr).trim()) return null;
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function capitalizeWords(s) {
  if (!s) return s;
  return s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/* ════════════════════════════════════════
   DROPDOWN ROUTES
════════════════════════════════════════ */

// GET active customers
router.get("/getcustomers", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT customername, Location, customercountry, customertype
       FROM customer WHERE status='Active' ORDER BY customername ASC`
    );
    res.json(rows.map((r) => ({
      customername: r.customername    || "",
      location:     r.Location        || "",
      country:      r.customercountry || "",
      custtype:     r.customertype    || "",
      currency:     "",
    })));
  } catch (err) {
    console.error("getcustomers:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET customer info by name
router.get("/getcustomerinfo", authMiddleware, async (req, res) => {
  const { customername } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT customercountry, customertype, Location
       FROM customer WHERE customername=? AND status='Active' LIMIT 1`,
      [customername]
    );
    if (!rows.length)
      return res.json({ country: "", custtype: "", location: "", currency: "" });
    const r = rows[0];
    res.json({
      country:  r.customercountry || "",
      custtype: r.customertype    || "",
      location: r.Location        || "",
      currency: "",
    });
  } catch (err) {
    console.error("getcustomerinfo:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET buyers by customer
router.get("/getbuyers", authMiddleware, async (req, res) => {
  const { customer } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT Buyername FROM buyer
       WHERE Customer=? AND Buyername IS NOT NULL AND status='Active'`,
      [customer]
    );
    res.json(rows.map((r) => r.Buyername || ""));
  } catch (err) {
    console.error("getbuyers:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET app engineers
router.get("/getappengineers", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT deptuserid FROM deptusers WHERE status='Active' ORDER BY deptuserid ASC`
    );
    res.json(rows.map((r) => r.deptuserid || ""));
  } catch (err) {
    console.error("getappengineers:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET sales managers
router.get("/getsalesmanagers", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT salescontactname FROM salescontact
       WHERE status='Active' ORDER BY salescontactname ASC`
    );
    res.json(rows.map((r) => r.salescontactname || ""));
  } catch (err) {
    console.error("getsalesmanagers:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET opportunity types
router.get("/getrfqt", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Opportunitytype' ORDER BY Data ASC`
    );
    res.json(rows.map((r) => r.Data || ""));
  } catch (err) {
    console.error("getrfqt:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET RFQ categories
router.get("/getqt", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Rfqcategory' ORDER BY Data ASC`
    );
    res.json(rows.map((r) => r.Data || ""));
  } catch (err) {
    console.error("getqt:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET quote stages
router.get("/getqs", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Quotestage' AND Sno < 8 ORDER BY Sno ASC`
    );
    res.json(rows.map((r) => capitalizeWords(r.Data || "")));
  } catch (err) {
    console.error("getqs:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET opportunity stages
router.get("/getstatus", authMiddleware, async (req, res) => {
  const { quotestage } = req.query;
  try {
    let rows;
    const qs = (quotestage || "").toUpperCase();
    if (qs === "ENQUIRY") {
      [rows] = await pool.query(
        `SELECT Data FROM quotedata
         WHERE Type='Opportunitystage' AND status='Active' AND Sno < 30
         ORDER BY Sno ASC`
      );
    } else if (qs === "TECHNICAL OFFER" || qs === "PRICED OFFER") {
      [rows] = await pool.query(
        `SELECT Data FROM quotedata
         WHERE Type='Opportunitystage' AND status='Active' AND Sno IN (22,23,24,25,26)
         ORDER BY Sno ASC`
      );
    } else {
      [rows] = await pool.query(
        `SELECT Data FROM quotedata
         WHERE Type='Opportunitystage' AND status='Active'
         ORDER BY Sno ASC`
      );
    }
    res.json(rows.map((r) => capitalizeWords(r.Data || "")));
  } catch (err) {
    console.error("getstatus:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET end countries
router.get("/getendcountries", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Countryname FROM country WHERE status='Active' ORDER BY Countryname ASC`
    );
    res.json(rows.map((r) => r.Countryname || ""));
  } catch (err) {
    console.error("getendcountries:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET end industries
router.get("/getindustries", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Industry FROM endindustry ORDER BY Industry ASC`
    );
    res.json(rows.map((r) => r.Industry || ""));
  } catch (err) {
    console.error("getindustries:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET end use by industry
router.get("/getenduse", authMiddleware, async (req, res) => {
  const { endind } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT Description FROM endindustry WHERE LOWER(Industry)=?`,
      [(endind || "").toLowerCase()]
    );
    res.json({ enduse: rows[0]?.Description || "" });
  } catch (err) {
    console.error("getenduse:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET facing factories — direct from product table (FIXED)
router.get("/getff", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT FacingFactory FROM product
       WHERE status='Active' AND FacingFactory IS NOT NULL AND FacingFactory != ''
       ORDER BY FacingFactory ASC`
    );
    res.json(rows.map((r) => r.FacingFactory || "").filter(Boolean));
  } catch (err) {
    console.error("getff:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET products — with UPPER TRIM fix + return image too
router.get("/getproducts", authMiddleware, async (req, res) => {
  const { facingfactory } = req.query;
  try {
    let rows;
    if (facingfactory) {
      [rows] = await pool.query(
        `SELECT Products, Image, Prdgroup FROM product
         WHERE status='Active'
         AND UPPER(TRIM(FacingFactory)) = UPPER(TRIM(?))
         ORDER BY Products ASC`,
        [facingfactory]
      );
    } else {
      [rows] = await pool.query(
        `SELECT Products, Image, Prdgroup FROM product
         WHERE status='Active'
         ORDER BY Products ASC`
      );
    }
    res.json(
      rows
        .filter((r) => r.Products)
        .map((r) => ({
          name:     r.Products  || "",
          image:    r.Image     || "",
          prdgroup: r.Prdgroup  || "",
        }))
    );
  } catch (err) {
    console.error("getproducts:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET reason codes
router.get("/getreasons", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ReasonCode FROM reason ORDER BY ReasonCode ASC`
    );
    res.json(rows.map((r) => r.ReasonCode || ""));
  } catch (err) {
    console.error("getreasons:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ════════════════════════════════════════
   QUOTE NUMBER GENERATION
════════════════════════════════════════ */
router.get("/fetchsno", authMiddleware, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const [rows] = await pool.query(
      `SELECT COUNT(Quotenumber) as cnt,
              ROUND(MAX(CAST(SUBSTRING(Quotenumber,9,4) AS UNSIGNED)),0) as sno
       FROM quoteregister
       WHERE SUBSTRING(RFQREGDate,1,4)=?`,
      [String(currentYear)]
    );
    const cnt  = Number(rows[0].cnt  || 0);
    const sno  = Number(rows[0].sno  || 0);
    const next = (!cnt || sno === 0) ? 1 : sno + 1;
    const quoteNumber = `R${currentYear}${String(next).padStart(4, "0")}`;
    res.json({ sno: next, quoteNumber });
  } catch (err) {
    console.error("fetchsno:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ════════════════════════════════════════
   GET ALL ENQUIRIES
════════════════════════════════════════ */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Quotenumber, Rev, RFQREGDate, Salescontact, Deptuser,
              Customername, Customertype, CustomerCountry, Buyername, Groupname,
              Currency, RFQType, Projectname, Endusername, EndCountry,
              EndIndustry, RFQreference, RFQDate, RFQCategory, Quotestage,
              Quotesubmitteddate, Facingfactory, Product, Totallineitems,
              Winprob, Opportunitystage, Expectedorderdate, EffEnqDate,
              CustomerdueDate, ProposeddueDate, Priority, Comments,
              Quotedprice, QuotevalueUSD, CFTIQuotedGM, Reason, RevisedDate,
              productchange
       FROM quoteregister
       ORDER BY Sno DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET / error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ════════════════════════════════════════
   GET SINGLE ENQUIRY
════════════════════════════════════════ */
router.get("/:quotenumber", authMiddleware, async (req, res) => {
  const { quotenumber } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM quoteregister WHERE Quotenumber=? LIMIT 1`,
      [quotenumber]
    );
    if (!rows.length)
      return res.status(404).json({ message: "Enquiry not found." });
    res.json(rows[0]);
  } catch (err) {
    console.error("GET /:quotenumber:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ════════════════════════════════════════
   ADD ENQUIRY
════════════════════════════════════════ */
router.post("/submit", authMiddleware, async (req, res) => {
  const { role } = req.user;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const {
    Quotenumber, RFQREGDate, Salescontact, Deptuser,
    Customername, Customertype, CustomerCountry,
    Buyername, Groupname, Currency,
    RFQType, Projectname,
    Endusername, EndCountry, EndIndustry,
    RFQreference, RFQDate, RFQCategory,
    Quotestage, Quotesubmitteddate,
    Facingfactory, Product, Totallineitems,
    Winprob, Opportunitystage,
    Expectedorderdate, EffEnqDate,
    CustomerdueDate, ProposeddueDate,
    Priority, Comments,
  } = req.body;

  if (!Quotenumber || !Customername || !RFQDate || !Deptuser || !Salescontact)
    return res.status(400).json({ message: "Required fields missing." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO quoteregister
        (Quotenumber, Rev, RFQREGDate, Salescontact, Deptuser,
         Customername, Customertype, CustomerCountry,
         Buyername, Groupname, Currency,
         RFQType, Projectname,
         Endusername, EndCountry, EndIndustry,
         RFQreference, RFQDate, RFQCategory,
         Quotestage, Quotesubmitteddate,
         Facingfactory, Product, Totallineitems,
         Winprob, Opportunitystage,
         Expectedorderdate, EffEnqDate,
         CustomerdueDate, ProposeddueDate,
         Priority, Comments)
       VALUES (?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        Quotenumber,
        parseDate(RFQREGDate),
        Salescontact     || null,
        Deptuser         || null,
        Customername     || null,
        Customertype     || null,
        CustomerCountry  || null,
        Buyername        || null,
        Groupname        || null,
        Currency         || null,
        RFQType          ? RFQType.toUpperCase() : null,
        Projectname      || null,
        Endusername      || null,
        EndCountry       || null,
        EndIndustry      || null,
        RFQreference     || null,
        parseDate(RFQDate),
        RFQCategory      || null,
        Quotestage       || null,
        parseDate(Quotesubmitteddate),
        Facingfactory    ? Facingfactory.toUpperCase() : null,
        Array.isArray(Product) ? Product.join(", ") : Product || null,
        Totallineitems   || null,
        Winprob          || null,
        Opportunitystage || null,
        parseDate(Expectedorderdate),
        parseDate(EffEnqDate),
        parseDate(CustomerdueDate),
        parseDate(ProposeddueDate),
        Priority         || "Low",
        Comments         || null,
      ]
    );

    if (RFQType) {
      const rfqUpper = RFQType.toUpperCase();
      const [ex] = await conn.query(
        `SELECT Sno FROM quotedata WHERE Data=? AND Type='Opportunitytype'`, [rfqUpper]
      );
      if (!ex.length)
        await conn.query(
          `INSERT INTO quotedata (Data, Type, status) VALUES (?, 'Opportunitytype', 'Active')`,
          [rfqUpper]
        );
    }

    if (Facingfactory) {
      const ffUpper = Facingfactory.toUpperCase();
      const [ex] = await conn.query(
        `SELECT Sno FROM quotedata WHERE Type='Facingfactory' AND Data=?`, [ffUpper]
      );
      if (!ex.length)
        await conn.query(
          `INSERT INTO quotedata (Data, Type, status) VALUES (?, 'Facingfactory', 'Active')`,
          [ffUpper]
        );
    }

    const products = Array.isArray(Product)
      ? Product
      : (Product || "").split(",").map((p) => p.trim()).filter(Boolean);

    for (const prod of products) {
      await conn.query(
        `INSERT INTO quotetimeline (Quotenumber, Deptuser, RFQDate, Product)
         VALUES (?, ?, ?, ?)`,
        [Quotenumber, Deptuser, parseDate(RFQDate), prod]
      );
    }

    await conn.commit();
    res.json({ success: true, message: "Enquiry registered successfully!" });
  } catch (err) {
    await conn.rollback();
    console.error("POST /submit:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  } finally {
    conn.release();
  }
});

/* ════════════════════════════════════════
   UPDATE ENQUIRY
════════════════════════════════════════ */
router.put("/:quotenumber", authMiddleware, async (req, res) => {
  const { role } = req.user;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { quotenumber } = req.params;
  const {
    RFQREGDate, Salescontact, Deptuser,
    Customername, Customertype, CustomerCountry,
    Buyername, Groupname, Currency,
    RFQType, Projectname,
    Endusername, EndCountry, EndIndustry,
    RFQreference, RFQDate, RFQCategory,
    Quotestage, Quotesubmitteddate,
    Facingfactory, Product, Totallineitems,
    Winprob, Opportunitystage,
    Expectedorderdate, EffEnqDate,
    CustomerdueDate, ProposeddueDate,
    Priority, Comments,
    Reason, RevisedDate, revision,
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      `SELECT Quotestage, Rev FROM quoteregister WHERE Quotenumber=?`,
      [quotenumber]
    );
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Enquiry not found." });
    }

    const existingStage = (existing[0].Quotestage || "").toUpperCase();
    let rev = parseInt(revision) || 0;

    if (
      (existingStage === "TECHNICAL OFFER" && ["PRICED OFFER", "ENQUIRY"].includes(Quotestage?.toUpperCase())) ||
      (existingStage === "PRICED OFFER"    && ["TECHNICAL OFFER", "ENQUIRY"].includes(Quotestage?.toUpperCase()))
    ) {
      rev += 1;
    }

    const [currentRecord] = await conn.query(
      `SELECT * FROM quoteregister WHERE Quotenumber=?`, [quotenumber]
    );
    if (currentRecord.length) {
      const r = currentRecord[0];
      await conn.query(
        `INSERT INTO quoteregisterhistory
          (Quotenumber, Rev, RFQREGDate, Salescontact, Deptuser,
           Customername, Customertype, CustomerCountry,
           Buyername, Groupname, Currency,
           RFQType, Projectname,
           Endusername, EndCountry, EndIndustry,
           RFQreference, RFQDate, RFQCategory,
           EffEnqDate, CustomerdueDate, ProposeddueDate,
           Quotestage, Quotesubmitteddate,
           Facingfactory, Product, Totallineitems,
           Quotedprice, QuotevalueUSD, Winprob, CFTIquotedGM,
           Opportunitystage, Comments, Expectedorderdate,
           RevisedDate, Reason, Priority, productchange)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          r.Quotenumber, r.Rev, r.RFQREGDate,
          r.Salescontact, r.Deptuser,
          r.Customername, r.Customertype, r.CustomerCountry,
          r.Buyername, r.Groupname, r.Currency,
          r.RFQType, r.Projectname,
          r.Endusername, r.EndCountry, r.EndIndustry,
          r.RFQreference, r.RFQDate, r.RFQCategory,
          r.EffEnqDate, r.CustomerdueDate, r.ProposeddueDate,
          r.Quotestage, r.Quotesubmitteddate,
          r.Facingfactory, r.Product, r.Totallineitems,
          r.Quotedprice   || 0,
          r.QuotevalueUSD || 0,
          r.Winprob,
          r.CFTIQuotedGM  || 0,
          r.Opportunitystage, r.Comments, r.Expectedorderdate,
          r.RevisedDate, r.Reason, r.Priority, r.productchange,
        ]
      );
    }

    await conn.query(
      `UPDATE quoteregister SET
         RFQREGDate=?, Salescontact=?, Deptuser=?,
         Customername=?, Customertype=?, CustomerCountry=?,
         Buyername=?, Groupname=?, Currency=?,
         RFQType=?, Projectname=?,
         Endusername=?, EndCountry=?, EndIndustry=?,
         RFQreference=?, RFQDate=?, RFQCategory=?,
         Quotestage=?, Quotesubmitteddate=?,
         Facingfactory=?, Product=?, Totallineitems=?,
         Winprob=?, Opportunitystage=?,
         Expectedorderdate=?, EffEnqDate=?,
         CustomerdueDate=?, ProposeddueDate=?,
         Priority=?, Comments=?, Reason=?, RevisedDate=?, Rev=?
       WHERE Quotenumber=?`,
      [
        parseDate(RFQREGDate),
        Salescontact     || null,
        Deptuser         || null,
        Customername     || null,
        Customertype     || null,
        CustomerCountry  || null,
        Buyername        || null,
        Groupname        || null,
        Currency         || null,
        RFQType          ? RFQType.toUpperCase() : null,
        Projectname      || null,
        Endusername      || null,
        EndCountry       || null,
        EndIndustry      || null,
        RFQreference     || null,
        parseDate(RFQDate),
        RFQCategory      || null,
        Quotestage       || null,
        parseDate(Quotesubmitteddate),
        Facingfactory    ? Facingfactory.toUpperCase() : null,
        Array.isArray(Product) ? Product.join(", ") : Product || null,
        Totallineitems   || null,
        Winprob          || null,
        Opportunitystage || null,
        parseDate(Expectedorderdate),
        parseDate(EffEnqDate),
        parseDate(CustomerdueDate),
        parseDate(ProposeddueDate),
        Priority         || "Low",
        Comments         || null,
        Reason           || null,
        parseDate(RevisedDate),
        rev,
        quotenumber,
      ]
    );

    await conn.commit();
    res.json({ success: true, message: "Enquiry updated successfully!" });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /:quotenumber:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  } finally {
    conn.release();
  }
});

/* ════════════════════════════════════════
   GENERATE QUOTE
════════════════════════════════════════ */
router.post("/generate-quote", authMiddleware, async (req, res) => {
  const { quotenumber } = req.body;
  if (!quotenumber)
    return res.status(400).json({ message: "Quote number is required." });

  try {
    const [rows] = await pool.query(
      `SELECT * FROM quoteregister WHERE Quotenumber=? LIMIT 1`, [quotenumber]
    );
    if (!rows.length)
      return res.status(404).json({ message: "Enquiry not found." });

    const r = rows[0];

    const [existing] = await pool.query(
      `SELECT Sno FROM quotetimeline WHERE Quotenumber=? AND Enquiry='Y' LIMIT 1`,
      [quotenumber]
    );
    if (existing.length)
      return res.status(409).json({ message: "Quote already generated for this enquiry." });

    await pool.query(
      `UPDATE quotetimeline SET Enquiry='Y', Lastupdateddate=CURDATE()
       WHERE Quotenumber=?`,
      [quotenumber]
    );

    const [updated] = await pool.query(
      `SELECT Sno FROM quotetimeline WHERE Quotenumber=?`, [quotenumber]
    );
    if (!updated.length) {
      const products = (r.Product || "").split(",").map((p) => p.trim()).filter(Boolean);
      for (const prod of products) {
        await pool.query(
          `INSERT INTO quotetimeline
             (Quotenumber, Deptuser, RFQDate, Enquiry, Product)
           VALUES (?, ?, ?, 'Y', ?)`,
          [r.Quotenumber, r.Deptuser, r.RFQDate, prod]
        );
      }
    }

    res.json({ success: true, quoteNumber: quotenumber });
  } catch (err) {
    console.error("POST /generate-quote:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

module.exports = router;
