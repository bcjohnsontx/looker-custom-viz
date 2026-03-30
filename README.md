# Looker Custom Visualizations

Custom visualization plugins for Looker.

## Client Review Report

A grouped report table visualization that renders the Client Review Detail derived table matching the reconciliation report layout:

- **Appointment Summary** rows as highlighted group headers
- **Billing Code**, **Pharmacy Fill**, **B&B Inventory**, **Pharmacy Prepared** as detail rows
- **COGS Total** subtotal footers per appointment
- **Grand Total** final row
- Configurable colors, font size, compact mode
- Sticky column headers, PDF print support

### Installation

1. In Looker: **Admin > Platform > Visualizations > Add Visualization**
2. Set:
   - **ID:** `client_review_report`
   - **Label:** `Client Review Report`
   - **Main:** `https://<your-github-username>.github.io/looker-custom-viz/client_review_report.js`
