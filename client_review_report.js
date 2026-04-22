/**
 * Client Review Report — Looker Custom Visualization
 *
 * Renders the Client Review Detail derived table as a grouped report table
 * matching the Python reconciliation report layout:
 *   - Appointment Summary rows as highlighted group headers
 *   - Billing Code, Pharmacy Fill, B&B Inventory, Pharmacy Prepared as detail rows
 *   - COGS Total as subtotal footer per appointment
 *   - Grand Total as the final row
 *
 * Required Looker fields (from client_review_detail view):
 *   Dimensions: appointment_id, dos_date, patient_id, item_id, drug_item_name,
 *               ndc, lot_number, expiration_date, source, closing_period,
 *               location_name, row_type_label, row_type, sub_sort, group_name
 *   Measures:   clinical_revenue, pharmacy_revenue, cogs_price,
 *               gross_margin, margin_pct, ins_paid_net, pt_paid_net,
 *               total_collected, actual_margin
 *
 * Installation: Admin > Platform > Visualizations > Add Visualization
 *   ID:    client_review_report
 *   Label: Client Review Report
 *   URL:   <hosted URL of this file>
 */

looker.plugins.visualizations.add({

  // ─── Configuration options ──────────────────────────────────────────
  options: {
    header_bg: {
      type: "string",
      label: "Summary Row Background",
      display: "color",
      default: "#E8F0FE",
      section: "Style",
      order: 1
    },
    cogs_total_bg: {
      type: "string",
      label: "COGS Total Row Background",
      display: "color",
      default: "#FFF8E1",
      section: "Style",
      order: 2
    },
    grand_total_bg: {
      type: "string",
      label: "Grand Total Row Background",
      display: "color",
      default: "#E8F5E9",
      section: "Style",
      order: 3
    },
    font_size: {
      type: "number",
      label: "Font Size (px)",
      default: 12,
      display: "range",
      min: 9,
      max: 16,
      step: 1,
      section: "Style",
      order: 4
    },
    row_separator: {
      type: "boolean",
      label: "Show appointment separator lines",
      default: true,
      section: "Style",
      order: 5
    },
    compact_mode: {
      type: "boolean",
      label: "Compact mode (hide detail columns on summary rows)",
      default: true,
      section: "Layout",
      order: 1
    },
    hide_zero_cogs: {
      type: "boolean",
      label: "Hide $0.00 COGS values",
      default: true,
      section: "Layout",
      order: 2
    },
    freeze_header: {
      type: "boolean",
      label: "Freeze column headers",
      default: true,
      section: "Layout",
      order: 3
    }
  },

  // ─── Create: set up container ──────────────────────────────────────
  create: function (element, config) {
    element.innerHTML = "";
    var style = document.createElement("style");
    style.id = "cr-report-style";
    element.appendChild(style);

    var container = document.createElement("div");
    container.id = "cr-report-container";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.overflow = "auto";
    container.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    element.appendChild(container);
  },

  // ─── Update: render the report ─────────────────────────────────────
  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();

    // ── Resolve field keys dynamically ─────────────────────────────
    var dims = queryResponse.fields.dimension_like || [];
    var meas = queryResponse.fields.measure_like || [];
    var allFields = dims.concat(meas);

    function findField(shortNames) {
      // First pass: exact suffix match (field name ends with the short name)
      for (var i = 0; i < allFields.length; i++) {
        var fName = allFields[i].name.toLowerCase();
        for (var j = 0; j < shortNames.length; j++) {
          var sn = shortNames[j];
          if (fName === sn || fName.substr(fName.length - sn.length - 1) === "." + sn) {
            return allFields[i].name;
          }
        }
      }
      // Fallback: contains match (but skip fields with "total_" prefix)
      for (var i = 0; i < allFields.length; i++) {
        var fName = allFields[i].name.toLowerCase();
        var baseName = fName.split(".").pop() || fName;
        if (baseName.indexOf("total_") === 0) continue;
        for (var j = 0; j < shortNames.length; j++) {
          if (fName.indexOf(shortNames[j]) !== -1) return allFields[i].name;
        }
      }
      return null;
    }

    var F = {
      apptId:     findField(["appointment_id", "appt_id"]),
      dos:        findField(["dos_date", "date_of_service", "dos"]),
      patientId:  findField(["patient_id"]),
      itemId:     findField(["item_id"]),
      drugName:   findField(["drug_item_name", "drug_name"]),
      ndc:        findField(["ndc"]),
      lot:        findField(["lot_number", "lot"]),
      expiration: findField(["expiration_date", "expiration"]),
      source:     findField(["source"]),
      closingPd:  findField(["closing_period"]),
      location:   findField(["location_name", "location"]),
      rowType:    findField(["row_type_label"]),
      rowTypeNum: findField(["row_type"]),
      groupName:  findField(["group_name"]),
      clinRev:    findField(["clinical_revenue"]),
      pharmRev:   findField(["pharmacy_revenue"]),
      cogs:       findField(["cogs_price", "cogs"]),
      gm:         findField(["gross_margin"]),
      mPct:       findField(["margin_pct"]),
      insPaid:    findField(["ins_paid_net"]),
      ptPaid:     findField(["pt_paid_net"]),
      totalColl:  findField(["total_collected"]),
      actMargin:  findField(["actual_margin"]),
      lineNotes:  findField(["line_notes"]),
      subSort:    findField(["sub_sort"]),
      distType:   findField(["distribution_type"]),
      benefitType:findField(["benefit_type"]),
      payer:      findField(["payer"])
    };

    // ── Explore validation ──────────────────────────────────────────
    if (!F.rowTypeNum && !F.rowType) {
      this.addError({
        title: "Incompatible Explore",
        message: "This visualization is designed for the Client Review Detail explore. Required field 'row_type' not found."
      });
      done();
      return;
    }

    // ── Style ───────────────────────────────────────────────────────
    var fontSize = config.font_size || 12;
    var headerBg = config.header_bg || "#E8F0FE";
    var cogsTotalBg = config.cogs_total_bg || "#FFF8E1";
    var grandTotalBg = config.grand_total_bg || "#E8F5E9";
    var freezeHeader = config.freeze_header !== false;

    var styleEl = element.querySelector("#cr-report-style");
    styleEl.textContent =
      "#cr-report-container table { border-collapse: collapse; width: 100%; font-size: " + fontSize + "px; }\n" +
      "#cr-report-container th { position: " + (freezeHeader ? "sticky" : "static") + "; top: 0; z-index: 2; " +
        "background: #f8f9fa; border-bottom: 2px solid #dee2e6; padding: 6px 8px; text-align: left; " +
        "font-weight: 600; white-space: nowrap; }\n" +
      "#cr-report-container th.num { text-align: right; }\n" +
      "#cr-report-container td { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }\n" +
      "#cr-report-container td.num { text-align: right; font-variant-numeric: tabular-nums; }\n" +
      "#cr-report-container tr.row-summary { background: " + headerBg + "; font-weight: 600; }\n" +
      "#cr-report-container tr.row-summary td { border-bottom: 1px solid #c8d6e5; }\n" +
      "#cr-report-container tr.row-cogs-total { background: " + cogsTotalBg + "; font-weight: 600; }\n" +
      "#cr-report-container tr.row-cogs-total td { border-bottom: 1px solid #e0d6a8; }\n" +
      "#cr-report-container tr.row-grand-total { background: " + grandTotalBg + "; font-weight: 700; }\n" +
      "#cr-report-container tr.row-grand-total td { border-top: 2px solid #4caf50; border-bottom: 2px solid #4caf50; }\n" +
      "#cr-report-container tr.row-billing td { color: #555; }\n" +
      "#cr-report-container tr.row-fill td { color: #1565c0; }\n" +
      "#cr-report-container tr.row-bb td { color: #333; }\n" +
      "#cr-report-container tr.row-pharm td { color: #6a1b9a; }\n" +
      "#cr-report-container tr.appt-first td { border-top: " + (config.row_separator !== false ? "2px solid #bbb" : "none") + "; }\n" +
      "#cr-report-container tr:hover { background: rgba(0,0,0,0.03); }\n" +
      "#cr-report-container tr.row-summary:hover { background: " + headerBg + "; filter: brightness(0.97); }\n" +
      "#cr-report-container .muted { color: #999; }\n";

    // ── Helpers ──────────────────────────────────────────────────────
    function cellVal(row, key) {
      if (!key || !row[key]) return null;
      return row[key].value;
    }

    function cellRendered(row, key) {
      if (!key || !row[key]) return "";
      var v = row[key].rendered || row[key].value;
      return v == null ? "" : String(v);
    }

    function fmtUSD(v, isCogs) {
      if (v == null || v === "" || isNaN(v)) return "";
      var n = Number(v);
      if (config.hide_zero_cogs && isCogs && Math.abs(n) < 0.005) return "";
      var neg = n < 0;
      var abs = Math.abs(n);
      var formatted = "$" + abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return neg ? "(" + formatted + ")" : formatted;
    }

    function fmtPct(v) {
      if (v == null || v === "" || isNaN(v)) return "";
      var n = Number(v);
      if (Math.abs(n) < 0.005) return "";
      return n.toFixed(1) + "%";
    }

    function escHtml(s) {
      if (s == null) return "";
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    // ── Column definitions ──────────────────────────────────────────
    var columns = [
      { key: F.groupName,  label: "Group",              cls: "" },
      { key: F.location,   label: "Location",           cls: "" },
      { key: F.apptId,     label: "Appt ID",          cls: "" },
      { key: F.dos,        label: "Date of Service",   cls: "" },
      { key: F.patientId,  label: "Patient ID",        cls: "" },
      { key: F.itemId,     label: "Item ID",           cls: "" },
      { key: F.drugName,   label: "Drug / Item Name",  cls: "" },
      { key: F.ndc,        label: "NDC",               cls: "" },
      { key: F.lot,        label: "Lot",               cls: "" },
      { key: F.expiration, label: "Expiration",         cls: "" },
      { key: F.distType,   label: "Distribution Type",  cls: "" },
      { key: F.benefitType,label: "Benefit Type",       cls: "" },
      { key: F.payer,      label: "Payer",              cls: "" },
      { key: F.source,     label: "Source",             cls: "" },
      { key: F.clinRev,    label: "Clinical Revenue",   cls: "num", fmt: "usd" },
      { key: F.pharmRev,   label: "Pharmacy Revenue",   cls: "num", fmt: "usd" },
      { key: F.closingPd,  label: "Closing Period",     cls: "" },
      { key: F.cogs,       label: "COGS / Price",       cls: "num", fmt: "usd" },
      { key: F.gm,         label: "Gross Margin",       cls: "num", fmt: "usd" },
      { key: F.mPct,       label: "Margin %",           cls: "num", fmt: "pct" },
      { key: F.insPaid,    label: "Ins Paid",     cls: "num", fmt: "usd" },
      { key: F.ptPaid,     label: "Pt Paid",      cls: "num", fmt: "usd" },
      { key: F.totalColl,  label: "Total Collected",    cls: "num", fmt: "usd" },
      { key: F.actMargin,  label: "Actual Margin",      cls: "num", fmt: "usd" },
      { key: F.lineNotes,  label: "Line Notes",          cls: "" }
    ];

    // Filter to only columns that exist in the query
    columns = columns.filter(function (c) { return c.key != null; });

    // ── Sort guard: enforce correct row hierarchy ─────────────────
    //    Prevents users from breaking the report by changing sort in Explore
    data.sort(function (a, b) {
      var aType = cellVal(a, F.rowTypeNum) != null ? Number(cellVal(a, F.rowTypeNum)) : 99;
      var bType = cellVal(b, F.rowTypeNum) != null ? Number(cellVal(b, F.rowTypeNum)) : 99;
      // Grand Total (type 0) always last
      if (aType === 0 && bType !== 0) return 1;
      if (bType === 0 && aType !== 0) return -1;
      if (aType === 0 && bType === 0) return 0;
      // Group by group name first, then appointment ID
      var aGrp = String(cellVal(a, F.groupName) || '');
      var bGrp = String(cellVal(b, F.groupName) || '');
      if (aGrp !== bGrp) return aGrp < bGrp ? -1 : 1;
      var aAppt = Number(cellVal(a, F.apptId)) || 0;
      var bAppt = Number(cellVal(b, F.apptId)) || 0;
      if (aAppt !== bAppt) return aAppt - bAppt;
      // Within appointment: sort by row_type (Summary=1, Billing=2, Fill=3, …)
      if (aType !== bType) return aType - bType;
      // Within same type: sort by sub_sort
      var aSub = Number(cellVal(a, F.subSort)) || 0;
      var bSub = Number(cellVal(b, F.subSort)) || 0;
      return aSub - bSub;
    });

    // ── Determine row type for each data row ────────────────────────
    function getRowType(row) {
      var label = cellVal(row, F.rowType);
      if (!label) {
        var num = cellVal(row, F.rowTypeNum);
        if (num != null) {
          var map = { 0: "Grand Total", 1: "Appointment Summary", 2: "Billing Code",
                      3: "Pharmacy Fill", 4: "B&B Inventory", 5: "Pharmacy Prepared",
                      6: "COGS Total" };
          return map[num] || "Unknown";
        }
        return "Unknown";
      }
      return label;
    }

    function rowClass(rowType) {
      switch (rowType) {
        case "Appointment Summary": return "row-summary";
        case "Billing Code":       return "row-billing";
        case "Pharmacy Fill":      return "row-fill";
        case "B&B Inventory":      return "row-bb";
        case "Pharmacy Prepared":  return "row-pharm";
        case "COGS Total":         return "row-cogs-total";
        case "Grand Total":        return "row-grand-total";
        default:                   return "";
      }
    }

    // ── Build HTML ──────────────────────────────────────────────────
    var html = [];
    html.push("<table>");

    // Header row
    html.push("<thead><tr>");
    for (var c = 0; c < columns.length; c++) {
      html.push('<th class="' + columns[c].cls + '">' + escHtml(columns[c].label) + "</th>");
    }
    html.push("</tr></thead>");

    html.push("<tbody>");

    var prevAppt = null;

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rt = getRowType(row);
      var apptId = cellVal(row, F.apptId);
      var isFirstOfAppt = apptId !== prevAppt && rt !== "Grand Total";
      prevAppt = apptId;

      var classes = rowClass(rt);
      if (isFirstOfAppt) classes += " appt-first";

      html.push('<tr class="' + classes + '">');

      for (var c = 0; c < columns.length; c++) {
        var col = columns[c];
        var val;

        // For summary rows in compact mode, only show key columns
        if (config.compact_mode && rt === "Appointment Summary") {
          var summaryKeys = [F.apptId, F.dos, F.patientId, F.drugName, F.clinRev, F.pharmRev, F.location, F.gm, F.mPct, F.insPaid, F.ptPaid, F.totalColl, F.actMargin, F.groupName, F.distType, F.benefitType];
          if (summaryKeys.indexOf(col.key) === -1 &&
              col.key !== F.source && col.key !== F.closingPd) {
            html.push('<td class="' + col.cls + '"></td>');
            continue;
          }
        }

        // For COGS Total rows, only show source (label) and COGS
        if (rt === "COGS Total") {
          var cogsKeys = [F.source, F.cogs];
          if (cogsKeys.indexOf(col.key) === -1) {
            html.push('<td class="' + col.cls + '"></td>');
            continue;
          }
        }

        // For Grand Total, only show financials
        if (rt === "Grand Total") {
          var gtKeys = [F.drugName, F.clinRev, F.pharmRev, F.cogs, F.gm, F.mPct, F.insPaid, F.ptPaid, F.totalColl, F.actMargin];
          if (gtKeys.indexOf(col.key) === -1) {
            html.push('<td class="' + col.cls + '"></td>');
            continue;
          }
        }

        // Format value
        var useHtml = false;
        if (col.fmt === "usd") {
          val = fmtUSD(cellVal(row, col.key), col.key === F.cogs);
        } else if (col.fmt === "pct") {
          val = fmtPct(cellVal(row, col.key));
        } else {
          if (row[col.key]) {
            val = LookerCharts.Utils.htmlForCell(row[col.key]);
            useHtml = true;
          } else {
            val = "";
          }
        }

        // Color actual margin: green positive, red negative
        var tdStyle = "";
        if (col.key === F.actMargin && val != null && val !== "") {
          var raw = cellVal(row, col.key);
          if (raw != null && Number(raw) < 0) {
            tdStyle = ' style="color:#C00000;font-weight:bold;"';
          } else if (raw != null && Number(raw) > 0) {
            tdStyle = ' style="color:#2E7D32;font-weight:bold;"';
          }
        }

        html.push('<td class="' + col.cls + '"' + tdStyle + '>' + (useHtml ? val : escHtml(val)) + "</td>");
      }

      html.push("</tr>");
    }

    html.push("</tbody></table>");

    // ── Render ───────────────────────────────────────────────────────
    var container = element.querySelector("#cr-report-container");
    container.innerHTML = html.join("");

    // Notify Looker of full height for PDF rendering
    var table = container.querySelector("table");
    if (table && details && details.print) {
      this.trigger("printSize", { heightExpanded: table.offsetHeight + 40 });
    }

    done();
  }
});
