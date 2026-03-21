const express = require("express");
const enquiryRoutes = require("./routes/enquiry");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));
app.use("/api/deptusers", require("./routes/deptusers"));
app.use("/api/salescontact", require("./routes/salescontact"));
app.use("/api/customer", require("./routes/customer"));
app.use("/api/buyer", require("./routes/buyer"));
app.use("/api/country", require("./routes/country"));
app.use("/api/product", require("./routes/product"));
app.use("/api/price", require("./routes/price"));
app.use("/api/ltsaprice", require("./routes/ltsaprice")); // ← THIS LINE FIXED
app.use("/api/gereference", require("./routes/gereference"));
app.use("/api/discount", require("./routes/discount"));
app.use("/api/spcl-discount", require("./routes/spclDiscount"));
app.use("/api/end-industry", require("./routes/endIndustry"));
app.use("/api/country-type", require("./routes/countryType"));
app.use("/api/status-master", require("./routes/statusMaster"));
app.use("/api/reason", require("./routes/reason"));
app.use("/api/timeline-target", require("./routes/timelineTarget"));
app.use("/api/cost-price", require("./routes/costPrice"));
app.use("/api/privileged", require("./routes/privileged"));
app.use("/api/enquiry", enquiryRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () =>
  console.log(`✅ Backend running on http://localhost:${PORT}`),
);
