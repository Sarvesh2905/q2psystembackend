import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import DashboardNavbar from "../../components/DashboardNavbar";
import { getAuth, isLoggedIn } from "../../utils/auth";

const API = "http://localhost:5001/api/customer";
const PAGESIZE = 50;

const emptyForm = {
  customername: "",
  customertype: "",
  customercountry: "",
  Address: "",
  City: "",
  State: "",
  Region: "",
  SubRegion: "",
  Location: "",
  Category: "",
  Shortname: "",
  Ltsacode: "",
  Segment: "Industrial",
};

export default function Customer() {
  const navigate = useNavigate();
  const { token, user } = getAuth();
  const role = user?.role;
  const canEdit = role === "Admin" || role === "Manager";

  const [allData, setAllData] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [page, setPage] = useState(1);
  const [searchVal, setSearchVal] = useState("");
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editSno, setEditSno] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [alert, setAlert] = useState({ msg: "", type: "" });
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    sno: null,
    currentStatus: "",
  });
  const [loading, setLoading] = useState(false);
  const [custTypes, setCustTypes] = useState([]);
  const [countries, setCountries] = useState([]);
  const [categories, setCategories] = useState([]);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!isLoggedIn()) navigate("/login", { replace: true });
  }, []);

  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [t, c, cat] = await Promise.all([
          axios.get(`${API}/custtypes`, { headers }),
          axios.get(`${API}/countries`, { headers }),
          axios.get(`${API}/categories`, { headers }),
        ]);
        setCustTypes(t.data);
        setCountries(c.data);
        setCategories(cat.data);
      } catch {}
    };
    fetchDropdowns();
  }, [token]);

  const showAlert = (msg, type) => {
    setAlert({ msg, type });
    setTimeout(() => setAlert({ msg: "", type: "" }), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const { data } = await axios.get(API, { headers });
      setAllData(data);
      setFiltered(data);
      setPage(1);
    } catch {
      showAlert("Failed to load data.", "danger");
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live Search across ALL columns
  const handleLiveSearch = (e) => {
    const val = e.target.value;
    setSearchVal(val);
    const q = val.trim().toLowerCase();
    setFiltered(
      !q
        ? allData
        : allData.filter((row) =>
            [
              row.customername,
              row.customertype,
              row.customercountry,
              row.Location,
              row.City,
              row.State,
              row.Region,
              row.SubRegion,
              row.Category,
              row.Shortname,
              row.Address,
              row.status,
            ]
              .map((v) => (v ?? "").toLowerCase())
              .some((v) => v.includes(q)),
          ),
    );
    setPage(1);
  };

  const handleClear = () => {
    setSearchVal("");
    setFiltered(allData);
    setPage(1);
  };

  const totalPages = Math.ceil(filtered.length / PAGESIZE);
  const paginated = filtered.slice((page - 1) * PAGESIZE, page * PAGESIZE);

  // ✅ FIXED: alert cleared on open
  const openAdd = () => {
    setForm(emptyForm);
    setFieldErrors({});
    setAlert({ msg: "", type: "" });
    setPanel("add");
  };

  const openEdit = (row) => {
    if (row.status === "Inactive") {
      showAlert(
        `${row.customername} is Inactive and cannot be edited.`,
        "warning",
      );
      return;
    }
    setForm({
      customername: row.customername,
      customertype: row.customertype,
      customercountry: row.customercountry,
      Address: row.Address ?? "",
      City: row.City ?? "",
      State: row.State ?? "",
      Region: row.Region ?? "",
      SubRegion: row.SubRegion ?? "",
      Location: row.Location ?? "",
      Category: row.Category ?? "",
      Shortname: row.Shortname ?? "",
      Ltsacode: row.Ltsacode ?? "",
      Segment: row.Segment ?? "Industrial",
    });
    setEditSno(row.Sno);
    setFieldErrors({});
    setAlert({ msg: "", type: "" });
    setPanel("edit");
  };

  const closePanel = () => {
    setPanel(null);
    setForm(emptyForm);
    setFieldErrors({});
  };

  const checkName = async () => {
    if (!form.customername.trim()) return;
    try {
      const { data } = await axios.get(
        `${API}/check?name=${encodeURIComponent(form.customername)}`,
        { headers },
      );
      if (data.exists)
        setFieldErrors((prev) => ({ ...prev, customername: data.message }));
      else
        setFieldErrors((prev) => {
          const e = { ...prev };
          delete e.customername;
          return e;
        });
    } catch {}
  };

  const clearErr = (field) =>
    setFieldErrors((prev) => {
      const e = { ...prev };
      delete e[field];
      return e;
    });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (Object.keys(fieldErrors).length > 0) return;
    setLoading(true);
    try {
      const { data } = await axios.post(API, form, { headers });
      showAlert(data.message, "success");
      closePanel();
      fetchData();
    } catch (err) {
      showAlert(
        err.response?.data?.message || "Error adding customer.",
        "danger",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
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
      } = form;
      const { data } = await axios.put(
        `${API}/${editSno}`,
        {
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
        },
        { headers },
      );
      showAlert(data.message, "success");
      closePanel();
      fetchData();
    } catch (err) {
      showAlert(
        err.response?.data?.message || "Error updating customer.",
        "danger",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    const { sno, currentStatus } = confirmModal;
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    // ✅ FIXED: reset confirmModal properly
    setConfirmModal({ show: false, sno: null, currentStatus: "" });
    try {
      await axios.patch(
        `${API}/toggle/${sno}`,
        { status: newStatus },
        { headers },
      );
      fetchData();
    } catch {
      showAlert("Failed to toggle status.", "danger");
    }
  };

  const lockedStyle = { backgroundColor: "#e9ecef" };

  const pageNumbers = Array.from(
    { length: totalPages },
    (_, i) => i + 1,
  ).filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2);

  return (
    <>
      <DashboardNavbar />
      <div className="container-fluid px-3 py-3">
        {/* Breadcrumb */}
        <div className="d-flex align-items-center gap-2 mb-3">
          <button
            className="btn btn-sm back-btn"
            onClick={() => navigate("/masters")}
          >
            <i className="bi bi-arrow-left-circle-fill me-1" />
            Back
          </button>
          <span className="text-muted" style={{ fontSize: "0.88rem" }}>
            Masters &rsaquo; <strong>Customer</strong>
          </span>
        </div>

        <h5 className="master-page-title mb-3">
          <i className="bi bi-building me-2" />
          Customer Master
        </h5>

        {/* Alert */}
        {alert.msg && (
          <div className={`alert alert-${alert.type} py-2`} role="alert">
            {alert.msg}
          </div>
        )}

        {/* Toolbar */}
        <div className="master-toolbar mb-3 d-flex flex-wrap align-items-center gap-2">
          <div>
            <label className="form-label mb-1" style={{ fontSize: "0.8rem" }}>
              Search All Columns
            </label>
            <input
              type="text"
              className="form-control form-control-sm"
              style={{ width: 280 }}
              placeholder="Search Name, Type, City, Country, Region..."
              value={searchVal}
              onChange={handleLiveSearch}
            />
          </div>
          {searchVal && (
            <button
              className="btn btn-sm btn-outline-secondary align-self-end"
              onClick={handleClear}
            >
              <i className="bi bi-x-circle me-1" />
              Clear
            </button>
          )}
          <div className="ms-auto d-flex align-items-center gap-2">
            <span className="text-muted" style={{ fontSize: "0.82rem" }}>
              Records <strong>{filtered.length}</strong>
            </span>
            {canEdit && (
              <button
                className="btn btn-sm btn-primary-custom"
                onClick={openAdd}
              >
                <i className="bi bi-plus-circle-fill me-1" />
                Add
              </button>
            )}
          </div>
        </div>

        {/* Table + Panel */}
        <div className="d-flex gap-3" style={{ minHeight: "60vh" }}>
          {/* Table */}
          <div
            className="master-table-wrapper"
            style={{
              flex: panel ? "0 0 55%" : "1",
              transition: "flex 0.3s",
              overflowX: "auto",
            }}
          >
            <table className="table table-bordered table-hover master-table mb-0">
              <thead>
                <tr>
                  <th style={{ width: "4%" }}>S.No</th>
                  <th style={{ width: "22%" }}>Customer Name</th>
                  <th style={{ width: "12%" }}>Location</th>
                  <th style={{ width: "10%" }}>City</th>
                  <th style={{ width: "10%" }}>Country</th>
                  <th style={{ width: "10%" }}>Type</th>
                  <th style={{ width: "10%" }}>Region</th>
                  <th style={{ width: "10%" }}>Category</th>
                  <th style={{ width: "12%" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center text-muted py-4">
                      No records found.
                    </td>
                  </tr>
                ) : (
                  paginated.map((row, idx) => (
                    <tr
                      key={row.Sno}
                      onDoubleClick={() => canEdit && openEdit(row)}
                      style={{ cursor: canEdit ? "pointer" : "default" }}
                      className={
                        panel === "edit" && editSno === row.Sno
                          ? "table-active"
                          : ""
                      }
                    >
                      <td>{(page - 1) * PAGESIZE + idx + 1}</td>
                      <td>{row.customername}</td>
                      <td>{row.Location}</td>
                      <td>{row.City}</td>
                      <td>{row.customercountry}</td>
                      <td>{row.customertype}</td>
                      <td>{row.Region}</td>
                      <td>{row.Category}</td>
                      <td className="text-center">
                        {canEdit ? (
                          <button
                            className={`btn btn-xs status-btn ${
                              row.status === "Active"
                                ? "status-active"
                                : "status-inactive"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmModal({
                                show: true,
                                sno: row.Sno,
                                currentStatus: row.status,
                              });
                            }}
                          >
                            {row.status}
                          </button>
                        ) : (
                          <span
                            className={`badge ${
                              row.status === "Active"
                                ? "bg-success"
                                : "bg-secondary"
                            }`}
                          >
                            {row.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="d-flex justify-content-between align-items-center mt-2 px-1">
                <small className="text-muted">
                  Page {page} of {totalPages}
                </small>
                <div className="d-flex gap-1">
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <i className="bi bi-chevron-left" />
                  </button>
                  {pageNumbers.map((p, i, arr) =>
                    i > 0 && arr[i - 1] !== p - 1 ? (
                      <>
                        <span key={`e${p}`} className="btn btn-sm disabled">
                          …
                        </span>
                        <button
                          key={p}
                          className={`btn btn-sm ${
                            page === p
                              ? "btn-primary-custom"
                              : "btn-outline-secondary"
                          }`}
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </button>
                      </>
                    ) : (
                      <button
                        key={p}
                        className={`btn btn-sm ${
                          page === p
                            ? "btn-primary-custom"
                            : "btn-outline-secondary"
                        }`}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <i className="bi bi-chevron-right" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Side Panel */}
          {panel && (
            <div
              className="master-side-panel"
              style={{ flex: "0 0 43%", maxHeight: "80vh", overflowY: "auto" }}
            >
              <div className="panel-header d-flex justify-content-between align-items-center mb-3">
                <h6
                  className="mb-0"
                  style={{ color: "#800000", fontWeight: 700 }}
                >
                  <i
                    className={`bi ${
                      panel === "add" ? "bi-plus-circle-fill" : "bi-pencil-fill"
                    } me-2`}
                  />
                  {panel === "add" ? "Create Customer" : "Modify Customer"}
                </h6>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={closePanel}
                >
                  <i className="bi bi-x-lg" />
                </button>
              </div>

              <form
                onSubmit={panel === "add" ? handleAdd : handleEdit}
                noValidate
              >
                {/* Customer Name — locked in edit */}
                <div className="mb-2">
                  <label className="form-label panel-label">
                    Customer Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control form-control-sm ${
                      fieldErrors.customername ? "is-invalid" : ""
                    }`}
                    value={form.customername}
                    onChange={(e) => {
                      setForm({ ...form, customername: e.target.value });
                      clearErr("customername");
                    }}
                    onBlur={() => panel === "add" && checkName()}
                    readOnly={panel === "edit"}
                    style={panel === "edit" ? lockedStyle : {}}
                    required={panel === "add"}
                    maxLength={50}
                    placeholder="Enter Customer Name"
                  />
                  {fieldErrors.customername && (
                    <div className="invalid-feedback">
                      {fieldErrors.customername}
                    </div>
                  )}
                </div>

                {/* Customer Type — locked in edit */}
                <div className="mb-2">
                  <label className="form-label panel-label">
                    Customer Type <span className="text-danger">*</span>
                  </label>
                  {panel === "add" ? (
                    <select
                      className="form-select form-select-sm"
                      value={form.customertype}
                      onChange={(e) =>
                        setForm({ ...form, customertype: e.target.value })
                      }
                      required
                    >
                      <option value="">-- Select Type --</option>
                      {custTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={form.customertype}
                      readOnly
                      style={lockedStyle}
                    />
                  )}
                </div>

                {/* Country — locked in edit */}
                <div className="mb-2">
                  <label className="form-label panel-label">
                    Country <span className="text-danger">*</span>
                  </label>
                  {panel === "add" ? (
                    <select
                      className="form-select form-select-sm"
                      value={form.customercountry}
                      onChange={(e) =>
                        setForm({ ...form, customercountry: e.target.value })
                      }
                      required
                    >
                      <option value="">-- Select Country --</option>
                      {countries.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={form.customercountry}
                      readOnly
                      style={lockedStyle}
                    />
                  )}
                </div>

                {/* Address */}
                <div className="mb-2">
                  <label className="form-label panel-label">Address</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={form.Address}
                    onChange={(e) =>
                      setForm({ ...form, Address: e.target.value })
                    }
                    maxLength={250}
                    placeholder="Enter Address"
                  />
                </div>

                {/* Location */}
                <div className="mb-2">
                  <label className="form-label panel-label">Location</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={form.Location}
                    onChange={(e) =>
                      setForm({ ...form, Location: e.target.value })
                    }
                    placeholder="e.g. Chennai"
                    maxLength={50}
                  />
                </div>

                {/* City + State */}
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label panel-label">City</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={form.City}
                      onChange={(e) =>
                        setForm({ ...form, City: e.target.value })
                      }
                      placeholder="City"
                      maxLength={50}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label panel-label">State</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={form.State}
                      onChange={(e) =>
                        setForm({ ...form, State: e.target.value })
                      }
                      placeholder="State"
                      maxLength={50}
                    />
                  </div>
                </div>

                {/* Region + SubRegion */}
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label panel-label">Region</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={form.Region}
                      onChange={(e) =>
                        setForm({ ...form, Region: e.target.value })
                      }
                      placeholder="Region"
                      maxLength={50}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label panel-label">Sub Region</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={form.SubRegion}
                      onChange={(e) =>
                        setForm({ ...form, SubRegion: e.target.value })
                      }
                      placeholder="Sub Region"
                      maxLength={50}
                    />
                  </div>
                </div>

                {/* Category */}
                <div className="mb-2">
                  <label className="form-label panel-label">Category</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={form.Category}
                    onChange={(e) =>
                      setForm({ ...form, Category: e.target.value })
                    }
                    placeholder="e.g. OEM"
                    maxLength={45}
                    list="category-suggestions"
                  />
                  <datalist id="category-suggestions">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                {/* Short Name */}
                <div className="mb-2">
                  <label className="form-label panel-label">Short Name</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={form.Shortname}
                    onChange={(e) =>
                      setForm({ ...form, Shortname: e.target.value })
                    }
                    placeholder="Short Name"
                    maxLength={90}
                  />
                </div>

                {/* Segment — always readonly */}
                <div className="mb-2">
                  <label className="form-label panel-label">Segment</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={form.Segment}
                    readOnly
                    style={lockedStyle}
                  />
                </div>

                <div className="d-flex gap-2 mt-3">
                  <button
                    type="submit"
                    className="btn btn-sm btn-primary-custom flex-fill"
                    disabled={loading || Object.keys(fieldErrors).length > 0}
                  >
                    {loading && (
                      <span className="spinner-border spinner-border-sm me-1" />
                    )}
                    <i
                      className={`bi ${
                        panel === "add" ? "bi-check-circle" : "bi-pencil-square"
                      } me-1`}
                    />
                    {panel === "add" ? "Save" : "Update"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary flex-fill"
                    onClick={closePanel}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* ✅ FIXED: Confirm Toggle Modal — "Customer" not "Country", name shown */}
      {confirmModal.show && (
        <div className="modal-backdrop-custom">
          <div className="confirm-modal">
            <h6 className="mb-3" style={{ color: "#800000" }}>
              <i className="bi bi-exclamation-triangle-fill me-2" />
              Confirmation
            </h6>
            <p className="mb-4" style={{ fontSize: "0.88rem" }}>
              Do you want to make the Customer{" "}
              <strong>
                {confirmModal.currentStatus === "Active"
                  ? "Inactive"
                  : "Active"}
              </strong>
              ?
            </p>
            <div className="d-flex gap-2 justify-content-end">
              <button className="btn btn-sm btn-success" onClick={handleToggle}>
                Yes
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() =>
                  setConfirmModal({ show: false, sno: null, currentStatus: "" })
                }
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
