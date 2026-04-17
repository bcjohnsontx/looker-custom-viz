/**
 * Standalone Fills Report — Looker Custom Visualization
 *
 * Renders the Standalone Fills derived table as a grouped report table
 * matching the Client Review report layout style:
 *   - Fill Summary rows as highlighted group headers
 *   - Revenue Detail rows showing closing period breakdowns
 *   - Component rows showing individual inventory items / COGS
 *   - COGS Total as subtotal footer per fill
 *
 * Required Looker fields (from standalone_fills view):
 *   Dimensions: fill_id, item_id, dos_date, patient_id, drug_item_name,
 *               ndc, lot_number, expiration, payer, shipping_to, location,
 *               medical_revenue, pharmacy_revenue, cogs_price, closing_period,
 *               gross_margin, margin_pct, ins_paid_net, pt_paid_net,
 *               total_collected, actual_margin, line_notes, row_type, sub_sort
 *
 * Installation: Admin > Platform > Visualizations > Add Visualization
 *   ID:    standalone_fills_report
 *   Label: Standalone Fills Report
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
    font_size: {
      type: "number",
      label: "Font Size (px)",
      default: 12,
      display: "range",
      min: 9,
      max: 16,
      step: 1,
      section: "Style",
      order: 3
    },
    row_separator: {
      type: "boolean",
      label: "Show fill separator lines",
      default: true,
      section: "Style",
      order: 4
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
    style.id = "sf-report-style";
    element.appendChild(style);

    var container = document.createElement("div");
    container.id = "sf-report-container";
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
      for (var i = 0; i < allFields.length; i++) {
        var fName = allFields[i].name.toLowerCase();
        for (var j = 0; j < shortNames.length; j++) {
          var sn = shortNames[j];
          if (fName === sn || fName.substr(fName.length - sn.length - 1) === "." + sn) {
            return allFields[i].name;
          }
        }
      }
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
      fillId:     findField(["fill_id"]),
      itemId:     findField(["item_id"]),
      invId:      findField(["inventory_id"]),
      dos:        findField(["dos_date"]),
      patientId:  findField(["patient_id"]),
      drugName:   findField(["drug_item_name"]),
      ndc:        findField(["ndc"]),
      lot:        findField(["lot_number"]),
      expiration: findField(["expiration"]),
      payer:      findField(["payer"]),
      shipTo:     findField(["shipping_to"]),
      location:   findField(["location"]),
      medRev:     findField(["medical_revenue"]),
      pharmRev:   findField(["pharmacy_revenue"]),
      cogs:       findField(["cogs_price"]),
      closingPd:  findField(["closing_period"]),
      gm:         findField(["gross_margin"]),
      mPct:       findField(["margin_pct"]),
      insPaid:    findField(["ins_paid_net", "total_ins_paid_net"]),
      ptPaid:     findField(["pt_paid_net", "total_pt_paid_net"]),
      totalColl:  findField(["total_collected", "total_collected_measure"]),
      actMargin:  findField(["actual_margin", "total_actual_margin"]),
      lineNotes:  findField(["line_notes"]),
      rowType:    findField(["row_type"]),
      subSort:    findField(["sub_sort"]),
      distType:   findField(["distribution_type"]),
      benefitType:findField(["benefit_type"]),
      fillStatus: findField(["fill_status"]),
      delivTkt:   findField(["delivery_ticket"]),
      shippedDt:  findField(["shipped_date"]),
      delivDt:    findField(["delivery_date"])
    };

    // ── Explore validation ──────────────────────────────────────────
    if (!F.rowType && !F.fillId) {
      this.addError({
        title: "Incompatible Explore",
        message: "This visualization is designed for the Standalone Pharmacy Fills explore. Required fields 'row_type' or 'fill_id' not found."
      });
      done();
      return;
    }

    // ── Style ───────────────────────────────────────────────────────
    var fontSize = config.font_size || 12;
    var headerBg = config.header_bg || "#E8F0FE";
    var cogsTotalBg = config.cogs_total_bg || "#FFF8E1";
    var freezeHeader = config.freeze_header !== false;

    var styleEl = element.querySelector("#sf-report-style");
    styleEl.textContent =
      "#sf-report-container table { border-collapse: collapse; width: 100%; font-size: " + fontSize + "px; }\n" +
      "#sf-report-container th { position: " + (freezeHeader ? "sticky" : "static") + "; top: 0; z-index: 2; " +
        "background: #f8f9fa; border-bottom: 2px solid #dee2e6; padding: 6px 8px; text-align: left; " +
        "font-weight: 600; white-space: nowrap; }\n" +
      "#sf-report-container th.num { text-align: right; }\n" +
      "#sf-report-container td { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }\n" +
      "#sf-report-container td.num { text-align: right; font-variant-numeric: tabular-nums; }\n" +
      "#sf-report-container tr.row-summary { background: " + headerBg + "; font-weight: 600; }\n" +
      "#sf-report-container tr.row-summary td { border-bottom: 1px solid #c8d6e5; }\n" +
      "#sf-report-container tr.row-cogs-total { background: " + cogsTotalBg + "; font-weight: 600; }\n" +
      "#sf-report-container tr.row-cogs-total td { border-bottom: 1px solid #e0d6a8; }\n" +
      "#sf-report-container tr.row-rev-detail td { color: #1565c0; }\n" +
      "#sf-report-container tr.row-component td { color: #6a1b9a; }\n" +
      "#sf-report-container tr.fill-first td { border-top: " + (config.row_separator !== false ? "2px solid #bbb" : "none") + "; }\n" +
      "#sf-report-container tr:hover { background: rgba(0,0,0,0.03); }\n" +
      "#sf-report-container tr.row-summary:hover { background: " + headerBg + "; filter: brightness(0.97); }\n" +
      "#sf-report-container .muted { color: #999; }\n";

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
      { key: F.location,   label: "Location",             cls: "" },
      { key: F.shipTo,     label: "Ship To",              cls: "" },
      { key: F.itemId,     label: "Pharmacy Identifier",  cls: "" },
      { key: F.delivTkt,   label: "Delivery Ticket",     cls: "", fmt: "id" },
      { key: F.dos,        label: "Billing DOS",         cls: "", fmt: "date" },
      { key: F.shippedDt,  label: "Shipped Date",        cls: "", fmt: "date" },
      { key: F.delivDt,    label: "Delivery Date",       cls: "", fmt: "date" },
      { key: F.patientId,  label: "Patient ID",          cls: "" },
      { key: F.invId,      label: "Inventory ID",         cls: "" },
      { key: F.drugName,   label: "Drug / Item Name",    cls: "" },
      { key: F.ndc,        label: "NDC",                 cls: "" },
      { key: F.lot,        label: "Lot",                 cls: "" },
      { key: F.expiration, label: "Expiration",           cls: "" },
      { key: F.distType,   label: "Distribution Type",  cls: "" },
      { key: F.benefitType,label: "Benefit Type",       cls: "" },
      { key: F.fillStatus, label: "Fill Status",         cls: "" },
      { key: F.payer,      label: "Payer",               cls: "" },
      { key: F.pharmRev,   label: "Pharmacy Revenue",     cls: "num", fmt: "usd" },
      { key: F.closingPd,  label: "Closing Period",       cls: "" },
      { key: F.cogs,       label: "COGS",                cls: "num", fmt: "usd" },
      { key: F.gm,         label: "Gross Margin",         cls: "num", fmt: "usd" },
      { key: F.mPct,       label: "Margin %",             cls: "num", fmt: "pct" },
      { key: F.insPaid,    label: "Ins Paid",       cls: "num", fmt: "usd" },
      { key: F.ptPaid,     label: "Pt Paid",        cls: "num", fmt: "usd" },
      { key: F.totalColl,  label: "Total Collected",      cls: "num", fmt: "usd" },
      { key: F.actMargin,  label: "Actual Margin",        cls: "num", fmt: "usd" },
      { key: F.lineNotes,  label: "Notes",                cls: "" }
    ];

    // Filter to only columns that exist in the query
    columns = columns.filter(function (c) { return c.key != null; });

    // ── Sort guard: enforce correct row hierarchy ─────────────────
    //    Prevents users from breaking the report by changing sort in Explore
    data.sort(function (a, b) {
      var aType = Number(cellVal(a, F.rowType)) || 0;
      var bType = Number(cellVal(b, F.rowType)) || 0;
      // Group by fill ID
      var aFill = Number(cellVal(a, F.fillId)) || 0;
      var bFill = Number(cellVal(b, F.fillId)) || 0;
      if (aFill !== bFill) return aFill - bFill;
      // Within fill: sort by row_type (Summary=1, Revenue=2, Component=3, COGS=4)
      if (aType !== bType) return aType - bType;
      // Within same type: sort by sub_sort
      var aSub = Number(cellVal(a, F.subSort)) || 0;
      var bSub = Number(cellVal(b, F.subSort)) || 0;
      return aSub - bSub;
    });

    // ── Determine row type for each data row ────────────────────────
    function getRowType(row) {
      // Try explicit row_type field first
      var num = cellVal(row, F.rowType);
      if (num != null) {
        var map = { 1: "Fill Summary", 2: "Revenue Detail", 3: "Component", 4: "COGS Total" };
        if (map[num]) return map[num];
      }
      // Heuristic fallback when row_type is hidden / not in query
      var drugName = cellVal(row, F.drugName);
      if (drugName && String(drugName).toLowerCase() === "total cogs") return "COGS Total";
      var notes = cellVal(row, F.lineNotes);
      if (notes) {
        var n = String(notes).toLowerCase();
        if (n.indexOf("component") !== -1) return "Component";
        if (n.indexOf("revenue") !== -1 || n.indexOf("closing") !== -1) return "Revenue Detail";
      }
      // If gross_margin exists, it's a summary row
      var gm = cellVal(row, F.gm);
      if (gm != null && gm !== "") return "Fill Summary";
      // If NDC or lot exists without gross margin, it's a component
      var ndc = cellVal(row, F.ndc);
      var lot = cellVal(row, F.lot);
      if ((ndc && ndc !== "") || (lot && lot !== "")) return "Component";
      // If closing period exists, it's revenue detail
      var cp = cellVal(row, F.closingPd);
      if (cp && cp !== "") return "Revenue Detail";
      return "Fill Summary";
    }

    function rowClass(rowType) {
      switch (rowType) {
        case "Fill Summary":   return "row-summary";
        case "Revenue Detail": return "row-rev-detail";
        case "Component":      return "row-component";
        case "COGS Total":     return "row-cogs-total";
        default:               return "";
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

    var prevFill = null;

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rt = getRowType(row);
      var fillId = cellVal(row, F.fillId);
      var isFirstOfFill = fillId !== prevFill;
      prevFill = fillId;

      var classes = rowClass(rt);
      if (isFirstOfFill) classes += " fill-first";

      html.push('<tr class="' + classes + '">');

      for (var c = 0; c < columns.length; c++) {
        var col = columns[c];
        var val;

        // For summary rows in compact mode, only show key columns
        if (config.compact_mode && rt === "Fill Summary") {
          var summaryKeys = [F.itemId, F.dos, F.patientId, F.drugName, F.payer,
                             F.pharmRev, F.cogs, F.gm, F.mPct,
                             F.insPaid, F.ptPaid, F.totalColl, F.actMargin,
                             F.shipTo, F.location, F.distType, F.benefitType, F.fillStatus,
                             F.delivTkt, F.shippedDt, F.delivDt];
          if (summaryKeys.indexOf(col.key) === -1) {
            html.push('<td class="' + col.cls + '"></td>');
            continue;
          }
        }

        // For Revenue Detail rows, show identifying + revenue columns
        if (rt === "Revenue Detail") {
          var revKeys = [F.itemId, F.drugName, F.payer, F.pharmRev, F.closingPd, F.benefitType, F.lineNotes];
          if (revKeys.indexOf(col.key) === -1) {
            html.push('<td class="' + col.cls + '"></td>');
            continue;
          }
        }

        // For Component rows, show drug/item, NDC, lot, expiration, COGS, notes
        if (rt === "Component") {
          var compKeys = [F.itemId, F.invId, F.drugName, F.ndc, F.lot, F.expiration, F.cogs, F.lineNotes];
          if (compKeys.indexOf(col.key) === -1) {
            html.push('<td class="' + col.cls + '"></td>');
            continue;
          }
        }

        // For COGS Total rows, only show label and COGS
        if (rt === "COGS Total") {
          var cogsKeys = [F.drugName, F.cogs];
          if (cogsKeys.indexOf(col.key) === -1) {
            html.push('<td class="' + col.cls + '"></td>');
            continue;
          }
        }

        // Format value
        var useHtml = false;
        if (col.fmt === "date") {
          var raw = cellVal(row, col.key);
          if (raw) {
            var d = new Date(raw);
            if (!isNaN(d.getTime())) {
              var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
              var dd = String(d.getUTCDate()).padStart(2, '0');
              var yyyy = d.getUTCFullYear();
              val = mm + '-' + dd + '-' + yyyy;
            } else { val = raw; }
          } else { val = ""; }
        } else if (col.fmt === "id") {
          var raw = cellVal(row, col.key);
          val = (raw != null && raw !== "") ? String(Math.round(Number(raw))) : "";
        } else if (col.fmt === "usd") {
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

        // Color gross margin and actual margin
        var tdStyle = "";
        if ((col.key === F.actMargin || col.key === F.gm) && val != null && val !== "") {
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
    var container = element.querySelector("#sf-report-container");
    container.innerHTML = html.join("");

    // Notify Looker of full height for PDF rendering
    var table = container.querySelector("table");
    if (table && details && details.print) {
      this.trigger("printSize", { heightExpanded: table.offsetHeight + 40 });
    }

    done();
  }
});
