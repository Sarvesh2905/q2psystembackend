const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");
require("dotenv").config();

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
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ─── DROPDOWNS ───────────────────────────────────────────────────────────────

router.get("/getcustomers", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT customer_name, Location, customer_country, customer_type, Category AS custcategory
       FROM customer WHERE status='Active' ORDER BY customer_name ASC`,
    );
    res.json(
      rows.map((r) => ({
        customername: r.customer_name,
        location: r.Location,
        country: r.customer_country,
        custtype: r.customer_type,
        custcategory: r.custcategory,
        currency: "",
      })),
    );
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getcustomerinfo", authMiddleware, async (req, res) => {
  const { customername } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT c.customer_country, c.customer_type, c.Location, c.Category,
              co.Currency
       FROM customer c
       LEFT JOIN country co ON UPPER(TRIM(co.Country_name)) = UPPER(TRIM(c.customer_country))
       WHERE c.customer_name=? AND c.status='Active' LIMIT 1`,
      [customername],
    );
    if (!rows.length)
      return res.json({
        country: "",
        custtype: "",
        location: "",
        currency: "",
        custcategory: "",
      });
    const r = rows[0];
    res.json({
      country: r.customer_country,
      custtype: r.customer_type,
      location: r.Location,
      currency: r.Currency || "",
      custcategory: r.Category || "",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getbuyers", authMiddleware, async (req, res) => {
  const { customer } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT Buyer_name FROM buyer WHERE Customer=? AND Buyer_name IS NOT NULL AND status='Active'`,
      [customer],
    );
    res.json(rows.map((r) => r.Buyer_name));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getappengineers", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT dept_user_id FROM dept_users WHERE status='Active' ORDER BY dept_user_id ASC`,
    );
    res.json(rows.map((r) => r.dept_user_id));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getsalesmanagers", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sales_contact_name FROM sales_contact WHERE status='Active' ORDER BY sales_contact_name ASC`,
    );
    res.json(rows.map((r) => r.sales_contact_name));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getrfqt", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quote_data WHERE Type='Opportunitytype' AND Status='Active' ORDER BY Data ASC`,
    );
    res.json(rows.map((r) => r.Data));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getqt", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quote_data WHERE Type='Rfqcategory' AND Status='Active' ORDER BY Data ASC`,
    );
    res.json(rows.map((r) => r.Data));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getqs", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quote_data WHERE Type='Quotestage' AND Sno=8 ORDER BY Sno ASC`,
    );
    res.json(rows.map((r) => capitalizeWords(r.Data)));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getstatus", authMiddleware, async (req, res) => {
  const { quotestage } = req.query;
  try {
    let rows;
    const qs = (quotestage || "").toUpperCase();
    if (qs === "ENQUIRY") {
      [rows] = await pool.query(
        `SELECT Data FROM quote_data WHERE Type='Opportunitystage' AND Status='Active' AND Sno=30 ORDER BY Sno ASC`,
      );
    } else if (["TECHNICAL OFFER", "PRICED OFFER"].includes(qs)) {
      [rows] = await pool.query(
        `SELECT Data FROM quote_data WHERE Type='Opportunitystage' AND Status='Active' AND Sno IN (22,23,24,25,26) ORDER BY Sno ASC`,
      );
    } else {
      [rows] = await pool.query(
        `SELECT Data FROM quote_data WHERE Type='Opportunitystage' AND Status='Active' ORDER BY Sno ASC`,
      );
    }
    res.json(rows.map((r) => capitalizeWords(r.Data)));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getendcountries", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Country_name FROM country WHERE status='Active' ORDER BY Country_name ASC`,
    );
    res.json(rows.map((r) => r.Country_name));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getindustries", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Industry FROM end_industry ORDER BY Industry ASC`,
    );
    res.json(rows.map((r) => r.Industry));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getenduse", authMiddleware, async (req, res) => {
  const { endind } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT Description FROM end_industry WHERE LOWER(Industry)=?`,
      [endind?.toLowerCase()],
    );
    res.json({ enduse: rows[0]?.Description || "" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getff", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quote_data WHERE Type='Facing_factory' AND Status='Active' ORDER BY Data ASC`,
    );
    res.json(rows.map((r) => r.Data).filter(Boolean));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getproducts", authMiddleware, async (req, res) => {
  const { facingfactory } = req.query;
  try {
    let rows;
    if (facingfactory) {
      [rows] = await pool.query(
        `SELECT Products, Image, Prd_group FROM product 
         WHERE status='Active' AND UPPER(TRIM(Facing_Factory))=UPPER(TRIM(?)) ORDER BY Products ASC`,
        [facingfactory],
      );
    } else {
      [rows] = await pool.query(
        `SELECT Products, Image, Prd_group FROM product WHERE status='Active' ORDER BY Products ASC`,
      );
    }
    res.json(
      rows
        .filter((r) => r.Products)
        .map((r) => ({
          name: r.Products,
          image: r.Image,
          prdgroup: r.Prd_group,
        })),
    );
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getreasons", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Reason_Code FROM reason ORDER BY Reason_Code ASC`,
    );
    res.json(rows.map((r) => r.Reason_Code));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/addfacingfactory", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (!["Admin", "Manager"].includes(role))
    return res.status(403).json({ message: "Access denied." });
  const { value } = req.body;
  if (!value?.trim())
    return res.status(400).json({ message: "Value is required." });
  const val = value.trim().toUpperCase();
  try {
    const [existing] = await pool.query(
      `SELECT Sno FROM quote_data WHERE Type='Facing_factory' AND UPPER(TRIM(Data))=?`,
      [val],
    );
    if (existing.length)
      return res
        .status(409)
        .json({ message: "Facing Factory already exists." });
    await pool.query(
      `INSERT INTO quote_data (Data, Type, Status) VALUES (?, 'Facing_factory', 'Active')`,
      [val],
    );
    res.json({ success: true, message: "Facing Factory added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/addopportunitytype", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (!["Admin", "Manager"].includes(role))
    return res.status(403).json({ message: "Access denied." });
  const { value } = req.body;
  if (!value?.trim())
    return res.status(400).json({ message: "Value is required." });
  const val = value.trim().toUpperCase();
  try {
    const [existing] = await pool.query(
      `SELECT Sno FROM quote_data WHERE Type='Opportunitytype' AND UPPER(TRIM(Data))=?`,
      [val],
    );
    if (existing.length)
      return res
        .status(409)
        .json({ message: "Opportunity Type already exists." });
    await pool.query(
      `INSERT INTO quote_data (Data, Type, Status) VALUES (?, 'Opportunitytype', 'Active')`,
      [val],
    );
    res.json({
      success: true,
      message: "Opportunity Type added successfully!",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ─── QUOTE NUMBER GENERATION ──────────────────────────────────────────────────
async function generateQuoteNumber(facingFactory, deptuser, date, conn) {
  const isLegacy = facingFactory?.toUpperCase() === "SCHROEDAHL";
  const prefix = isLegacy ? "L" : "R";
  const d = date ? new Date(date) : new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const datePart = `${yy}${mm}${dd}`;
  let aePrefix = "XX";
  if (deptuser) {
    const parts = deptuser.split("-");
    if (parts.length >= 2)
      aePrefix = parts[parts.length - 1].substring(0, 2).toUpperCase();
    else aePrefix = deptuser.substring(0, 2).toUpperCase();
  }
  const [rows] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(Quote_number, 9, 4) AS UNSIGNED)) AS maxsno 
     FROM quote_register WHERE SUBSTRING(Quote_number,1,1)=?`,
    [prefix],
  );
  const maxSno = Number(rows[0]?.maxsno) || 0;
  const nextSno = String(maxSno + 1).padStart(4, "0");
  return `${prefix}${datePart}-${nextSno}-${aePrefix}`;
}

// ─── GET ALL ENQUIRIES ────────────────────────────────────────────────────────
// Returns DB column names mapped back to frontend camelCase keys for compatibility
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno,
              Quote_number        AS Quotenumber,
              Rev,
              RFQ_REG_Date        AS RFQREGDate,
              Sales_contact       AS Salescontact,
              Dept_user           AS Deptuser,
              Customer_name       AS Customername,
              Customer_type       AS Customertype,
              Customer_Country    AS CustomerCountry,
              Buyer_name          AS Buyername,
              Group_name          AS Groupname,
              Currency,
              RFQ_Type            AS RFQType,
              Project_name        AS Projectname,
              End_user_name       AS Endusername,
              End_Country         AS EndCountry,
              End_Industry        AS EndIndustry,
              RFQ_reference       AS RFQreference,
              RFQ_Date            AS RFQDate,
              RFQ_Category        AS RFQCategory,
              Quote_stage         AS Quotestage,
              Quote_submitted_date AS Quotesubmitteddate,
              Facing_factory      AS Facingfactory,
              Product,
              Total_line_items    AS Totallineitems,
              Win_prob            AS Winprob,
              Opportunity_stage   AS Opportunitystage,
              Expected_order_date AS Expectedorderdate,
              Eff_Enq_Date        AS EffEnqDate,
              Customer_due_Date   AS CustomerdueDate,
              Proposed_due_Date   AS ProposeddueDate,
              Priority,
              Comments,
              Quoted_price        AS Quotedprice,
              Quote_value_USD     AS QuotevalueUSD,
              CFTI_quoted_GM      AS CFTIquotedGM,
              Reason,
              Revised_Date        AS RevisedDate,
              product_change      AS productchange
       FROM quote_register ORDER BY Sno DESC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ─── GET SINGLE ENQUIRY ───────────────────────────────────────────────────────
router.get("/:quotenumber", authMiddleware, async (req, res) => {
  const { quotenumber } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT Sno,
              Quote_number        AS Quotenumber,
              Rev,
              RFQ_REG_Date        AS RFQREGDate,
              Sales_contact       AS Salescontact,
              Dept_user           AS Deptuser,
              Customer_name       AS Customername,
              Customer_type       AS Customertype,
              Customer_Country    AS CustomerCountry,
              Buyer_name          AS Buyername,
              Group_name          AS Groupname,
              Currency,
              RFQ_Type            AS RFQType,
              Project_name        AS Projectname,
              End_user_name       AS Endusername,
              End_Country         AS EndCountry,
              End_Industry        AS EndIndustry,
              RFQ_reference       AS RFQreference,
              RFQ_Date            AS RFQDate,
              RFQ_Category        AS RFQCategory,
              Quote_stage         AS Quotestage,
              Quote_submitted_date AS Quotesubmitteddate,
              Facing_factory      AS Facingfactory,
              Product,
              Total_line_items    AS Totallineitems,
              Win_prob            AS Winprob,
              Opportunity_stage   AS Opportunitystage,
              Expected_order_date AS Expectedorderdate,
              Eff_Enq_Date        AS EffEnqDate,
              Customer_due_Date   AS CustomerdueDate,
              Proposed_due_Date   AS ProposeddueDate,
              Priority,
              Comments,
              Quoted_price        AS Quotedprice,
              Quote_value_USD     AS QuotevalueUSD,
              CFTI_quoted_GM      AS CFTIquotedGM,
              Reason,
              Revised_Date        AS RevisedDate,
              product_change      AS productchange
       FROM quote_register WHERE Quote_number=? LIMIT 1`,
      [quotenumber],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Enquiry not found." });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ─── ADD ENQUIRY ──────────────────────────────────────────────────────────────
// Frontend sends camelCase keys; we map them to DB column names in SQL
router.post("/submit", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (!["Admin", "Manager"].includes(role))
    return res.status(403).json({ message: "Access denied." });

  const {
    RFQREGDate,
    Salescontact,
    Deptuser,
    Customername,
    Customertype,
    CustomerCountry,
    Buyername,
    Groupname,
    Currency,
    RFQType,
    Projectname,
    Endusername,
    EndCountry,
    EndIndustry,
    RFQreference,
    RFQDate,
    RFQCategory,
    Quotestage,
    Facingfactory,
    Product,
    Totallineitems,
    Winprob,
    Opportunitystage,
    Expectedorderdate,
    EffEnqDate,
    CustomerdueDate,
    ProposeddueDate,
    Priority,
    Comments,
  } = req.body;

  if (!Customername || !RFQDate || !Deptuser || !Salescontact || !Facingfactory)
    return res.status(400).json({ message: "Required fields missing." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const quoteNumber = await generateQuoteNumber(
      Facingfactory,
      Deptuser,
      RFQREGDate,
      conn,
    );

    await conn.query(
      `INSERT INTO quote_register 
        (Quote_number, Rev, RFQ_REG_Date, Sales_contact, Dept_user, Customer_name, Customer_type,
         Customer_Country, Buyer_name, Group_name, Currency, RFQ_Type, Project_name, End_user_name,
         End_Country, End_Industry, RFQ_reference, RFQ_Date, RFQ_Category, Quote_stage,
         Quote_submitted_date, Facing_factory, Product, Total_line_items, Win_prob, Opportunity_stage,
         Expected_order_date, Eff_Enq_Date, Customer_due_Date, Proposed_due_Date, Priority, Comments)
       VALUES (?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        quoteNumber,
        parseDate(RFQREGDate),
        Salescontact || null,
        Deptuser || null,
        Customername || null,
        Customertype || null,
        CustomerCountry || null,
        Buyername || null,
        Groupname || null,
        Currency || null,
        RFQType ? RFQType.toUpperCase() : null,
        Projectname || null,
        Endusername || null,
        EndCountry || null,
        EndIndustry || null,
        RFQreference || null,
        parseDate(RFQDate),
        RFQCategory || null,
        Quotestage || null,
        null,
        Facingfactory ? Facingfactory.toUpperCase() : null,
        Array.isArray(Product) ? Product.join(", ") : Product || null,
        Totallineitems || null,
        Winprob || null,
        Opportunitystage || null,
        parseDate(Expectedorderdate),
        parseDate(EffEnqDate),
        parseDate(CustomerdueDate),
        parseDate(ProposeddueDate),
        Priority || "Low",
        Comments || null,
      ],
    );

    const products = Array.isArray(Product)
      ? Product
      : (Product || "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
    for (const prod of products) {
      await conn.query(
        `INSERT INTO quote_timeline (Quote_number, Dept_user, RFQ_Date, Product) VALUES (?,?,?,?)`,
        [quoteNumber, Deptuser, parseDate(RFQDate), prod],
      );
    }

    await conn.commit();
    res.json({
      success: true,
      message: "Enquiry registered successfully!",
      quoteNumber,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: "Server error", detail: err.message });
  } finally {
    conn.release();
  }
});

// ─── UPDATE ENQUIRY ───────────────────────────────────────────────────────────
router.put("/:quotenumber", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (!["Admin", "Manager"].includes(role))
    return res.status(403).json({ message: "Access denied." });
  const { quotenumber } = req.params;
  const {
    RFQREGDate,
    Salescontact,
    Deptuser,
    Customername,
    Customertype,
    CustomerCountry,
    Buyername,
    Groupname,
    Currency,
    RFQType,
    Projectname,
    Endusername,
    EndCountry,
    EndIndustry,
    RFQreference,
    RFQDate,
    RFQCategory,
    Quotestage,
    Quotesubmitteddate,
    Facingfactory,
    Product,
    Totallineitems,
    Winprob,
    Opportunitystage,
    Expectedorderdate,
    EffEnqDate,
    CustomerdueDate,
    ProposeddueDate,
    Priority,
    Comments,
    Reason,
    RevisedDate,
    revision,
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query(
      `SELECT * FROM quote_register WHERE Quote_number=?`,
      [quotenumber],
    );
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Enquiry not found." });
    }

    let rev = parseInt(revision) || 0;
    const r = existing[0];

    await conn.query(
      `INSERT INTO quote_register_history 
        (Quote_number,Rev,RFQ_REG_Date,Sales_contact,Dept_user,Customer_name,Customer_type,Customer_Country,
         Buyer_name,Group_name,Currency,RFQ_Type,Project_name,End_user_name,End_Country,End_Industry,
         RFQ_reference,RFQ_Date,RFQ_Category,Eff_Enq_Date,Customer_due_Date,Proposed_due_Date,Quote_stage,
         Quote_submitted_date,Facing_factory,Product,Total_line_items,Quoted_price,Quote_value_USD,Win_prob,
         CFTI_quoted_GM,Opportunity_stage,Comments,Expected_order_date,Revised_Date,Reason,Priority,product_change)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        r.Quote_number,
        r.Rev,
        r.RFQ_REG_Date,
        r.Sales_contact,
        r.Dept_user,
        r.Customer_name,
        r.Customer_type,
        r.Customer_Country,
        r.Buyer_name,
        r.Group_name,
        r.Currency,
        r.RFQ_Type,
        r.Project_name,
        r.End_user_name,
        r.End_Country,
        r.End_Industry,
        r.RFQ_reference,
        r.RFQ_Date,
        r.RFQ_Category,
        r.Eff_Enq_Date,
        r.Customer_due_Date,
        r.Proposed_due_Date,
        r.Quote_stage,
        r.Quote_submitted_date,
        r.Facing_factory,
        r.Product,
        r.Total_line_items,
        r.Quoted_price || 0,
        r.Quote_value_USD || 0,
        r.Win_prob,
        r.CFTI_quoted_GM || 0,
        r.Opportunity_stage,
        r.Comments,
        r.Expected_order_date,
        r.Revised_Date,
        r.Reason,
        r.Priority,
        r.product_change,
      ],
    );

    await conn.query(
      `UPDATE quote_register SET
        RFQ_REG_Date=?,Sales_contact=?,Dept_user=?,Customer_name=?,Customer_type=?,Customer_Country=?,
        Buyer_name=?,Group_name=?,Currency=?,RFQ_Type=?,Project_name=?,End_user_name=?,End_Country=?,
        End_Industry=?,RFQ_reference=?,RFQ_Date=?,RFQ_Category=?,Quote_stage=?,Quote_submitted_date=?,
        Facing_factory=?,Product=?,Total_line_items=?,Win_prob=?,Opportunity_stage=?,Expected_order_date=?,
        Eff_Enq_Date=?,Customer_due_Date=?,Proposed_due_Date=?,Priority=?,Comments=?,Reason=?,Revised_Date=?,Rev=?
       WHERE Quote_number=?`,
      [
        parseDate(RFQREGDate),
        Salescontact || null,
        Deptuser || null,
        Customername || null,
        Customertype || null,
        CustomerCountry || null,
        Buyername || null,
        Groupname || null,
        Currency || null,
        RFQType ? RFQType.toUpperCase() : null,
        Projectname || null,
        Endusername || null,
        EndCountry || null,
        EndIndustry || null,
        RFQreference || null,
        parseDate(RFQDate),
        RFQCategory || null,
        Quotestage || null,
        parseDate(Quotesubmitteddate),
        Facingfactory ? Facingfactory.toUpperCase() : null,
        Array.isArray(Product) ? Product.join(", ") : Product || null,
        Totallineitems || null,
        Winprob || null,
        Opportunitystage || null,
        parseDate(Expectedorderdate),
        parseDate(EffEnqDate),
        parseDate(CustomerdueDate),
        parseDate(ProposeddueDate),
        Priority || "Low",
        Comments || null,
        Reason || null,
        parseDate(RevisedDate),
        rev,
        quotenumber,
      ],
    );

    await conn.commit();
    res.json({ success: true, message: "Enquiry updated successfully!" });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: "Server error", detail: err.message });
  } finally {
    conn.release();
  }
});

// ─── GENERATE QUOTE ───────────────────────────────────────────────────────────
router.post("/generate-quote", authMiddleware, async (req, res) => {
  const { quotenumber } = req.body;
  if (!quotenumber)
    return res.status(400).json({ message: "Quote number is required." });
  try {
    const [rows] = await pool.query(
      `SELECT * FROM quote_register WHERE Quote_number=? LIMIT 1`,
      [quotenumber],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Enquiry not found." });
    const r = rows[0];
    const [existing] = await pool.query(
      `SELECT Sno FROM quote_timeline WHERE Quote_number=? AND Enquiry='Y' LIMIT 1`,
      [quotenumber],
    );
    if (existing.length)
      return res.status(409).json({ message: "Quote already generated." });
    await pool.query(
      `UPDATE quote_timeline SET Enquiry='Y', Last_updated_date=CURDATE() WHERE Quote_number=?`,
      [quotenumber],
    );
    const [updated] = await pool.query(
      `SELECT Sno FROM quote_timeline WHERE Quote_number=?`,
      [quotenumber],
    );
    if (!updated.length) {
      const products = (r.Product || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      for (const prod of products) {
        await pool.query(
          `INSERT INTO quote_timeline (Quote_number, Dept_user, RFQ_Date, Enquiry, Product) VALUES (?,?,?,'Y',?)`,
          [r.Quote_number, r.Dept_user, r.RFQ_Date, prod],
        );
      }
    }
    res.json({ success: true, quoteNumber: quotenumber });
  } catch (err) {
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

module.exports = router;
