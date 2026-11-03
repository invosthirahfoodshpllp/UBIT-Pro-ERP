/**
 * UBIT PRO ERP - SEPARATED INVOICE DESIGNER & MULTI-DOCUMENT PRINT ENGINE
 * Dedicated modular architecture for razor-sharp A4, A5, and A6 invoice layouts,
 * 1:1 screen-to-print parity, and universal document styling across:
 * - Sales Invoice / Tax Invoice
 * - Sales Order
 * - Delivery Challan
 * - Credit Note & Debit Note
 * - Purchase Bill & Purchase Order
 * - Payment-In & Payment-Out
 */

// Inject dynamic paper sizing, tooltip fixes, and print rules
(function injectInvoiceEngineStyles() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('ubit-invoice-engine-styles');
  if (existing) return;

  const style = document.createElement('style');
  style.id = 'ubit-invoice-engine-styles';
  style.textContent = `
    /* Tooltip Fix: Always white text on dark tooltips */
    .recharts-default-tooltip,
    .recharts-tooltip-label,
    .recharts-default-tooltip .recharts-tooltip-label,
    .recharts-default-tooltip p {
      color: #ffffff !important;
      font-weight: 600 !important;
    }
    .recharts-tooltip-item-name,
    .recharts-tooltip-item-value {
      color: #38bdf8 !important;
    }

    /* Standard Paper Dimensions */
    .ubit-paper-a4 {
      width: 100% !important;
      max-width: 800px;
      font-size: 10.5px;
    }
    .ubit-paper-a4.landscape,
    .landscape .ubit-paper-a4 {
      max-width: 1050px;
    }

    .ubit-paper-a5 {
      width: 100% !important;
      max-width: 560px;
      font-size: 9px;
    }
    .ubit-paper-a5.landscape,
    .landscape .ubit-paper-a5 {
      max-width: 750px;
    }
    .ubit-paper-a5 table th,
    .ubit-paper-a5 table td {
      padding: 3px 4px !important;
      font-size: 8.5px !important;
    }

    .ubit-paper-a6 {
      width: 100% !important;
      max-width: 390px;
      font-size: 7.5px;
    }
    .ubit-paper-a6.landscape,
    .landscape .ubit-paper-a6 {
      max-width: 540px;
    }
    .ubit-paper-a6 table th,
    .ubit-paper-a6 table td {
      padding: 2px 3px !important;
      font-size: 7px !important;
    }

    /* Print media rules */
    @media print {
      @page {
        size: auto;
        margin: 6mm 4mm 6mm 4mm !important;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print, header, nav, aside, .modal-backdrop, .preview-toolbar {
        display: none !important;
      }
      .ubit-invoice-outer-box {
        border: 1.5px solid #000000 !important;
        box-shadow: none !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .print-page-block,
      .ubit-copy-container {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .ubit-subsequent-copy {
        page-break-before: always !important;
        break-before: page !important;
        margin-top: 0 !important;
        padding-top: 0 !important;
        border-top: none !important;
      }
    }
  `;
  document.head.appendChild(style);
})();

// Top Action Bar Helper
export function renderUbitTopActionBar(docNumber, docType, onSavePdf, onPrint, onClose, n) {
  return n.jsxs('div', {
    className: 'px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4 no-print text-white shrink-0 whitespace-nowrap select-none',
    children: [
      n.jsx('div', {
        className: 'font-mono text-sm font-bold text-sky-400 shrink-0',
        children: docNumber || '-'
      }),
      n.jsx('div', {
        className: 'font-extrabold text-sm uppercase tracking-wider text-white text-center flex-1 truncate px-2',
        children: docType || 'Document'
      }),
      n.jsxs('div', {
        className: 'flex items-center gap-2 shrink-0',
        children: [
          n.jsx('button', {
            type: 'button',
            onClick: onSavePdf,
            className: 'ubit-save-pdf-modal-btn px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer',
            children: 'Save PDF'
          }),
          n.jsx('button', {
            type: 'button',
            onClick: onPrint,
            className: 'px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer',
            children: 'Print'
          }),
          n.jsx('button', {
            type: 'button',
            onClick: onClose,
            className: 'p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1 cursor-pointer',
            children: n.jsx('span', { className: 'text-base font-bold', children: '✕' })
          })
        ]
      })
    ]
  });
}
if (typeof window !== 'undefined') {
  window.__ubitRenderTopActionBar = renderUbitTopActionBar;
}

function renderUbitDocTopBar(docTitle, copyLabel, n) {
  return n.jsxs("div", {
    className: "ubit-doc-top-bar grid grid-cols-3 items-end w-full mb-1.5 px-0.5 box-border",
    style: { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "flex-end", width: "100%", marginBottom: "6px" },
    children: [
      n.jsx("div", { className: "ubit-doc-top-bar-left", style: { minHeight: "1px" } }),
      n.jsx("div", {
        className: "ubit-doc-title-text font-black text-base uppercase text-slate-900 tracking-wide text-center",
        style: { fontWeight: "900", fontSize: "15px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#0f172a", textAlign: "center" },
        children: docTitle || "TAX INVOICE"
      }),
      n.jsx("div", {
        className: "ubit-print-copy-badge font-bold text-[10px] tracking-wider uppercase text-slate-600 text-right",
        style: { fontWeight: "700", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#475569", textAlign: "right" },
        children: copyLabel || "ORIGINAL FOR RECIPIENT"
      })
    ]
  });
}
window.__ubitRenderDocTopBar = renderUbitDocTopBar;

function renderUbitAckSlip(partyName, partyAddress, partyPhone, docNo, docDate, grandTotal, companyName, n, vr, isOrder, themeColor) {
  const isSO = !!isOrder;
  const clr = themeColor || "#10263c";
  const cleanAmt = typeof grandTotal === "number" ? grandTotal : (parseFloat(String(grandTotal || "0").replace(/[^0-9.-]+/g, "")) || 0);
  const amtStr = cleanAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return n.jsxs("div", {
    className: "ubit-acknowledgement-slip border-t-2 border-dashed border-slate-400 mt-4 pt-2.5 w-full text-slate-900",
    style: { borderTop: "2px dashed #94a3b8", marginTop: "14px", paddingTop: "8px", width: "100%", boxSizing: "border-box", background: "#ffffff", color: "#0f172a" },
    children: [
      n.jsx("div", { className: "text-center font-bold text-xs uppercase tracking-wider text-slate-900 mb-0.5", style: { textAlign: "center", fontWeight: "800", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#0f172a", marginBottom: "2px" }, children: "Acknowledgement" }),
      n.jsx("div", { className: "text-center font-black text-sm uppercase mb-2.5", style: { textAlign: "center", fontWeight: "900", fontSize: "14px", textTransform: "uppercase", color: clr, marginBottom: "8px" }, children: companyName || "UBIT DEMO ENTERPRISE" }),
      n.jsxs("div", {
        className: "grid grid-cols-3 gap-4 items-start text-left text-xs leading-normal",
        style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", fontSize: "11px", lineHeight: "1.35", textAlign: "left" },
        children: [
          n.jsxs("div", {
            className: "space-y-0.5",
            children: [
              n.jsx("div", { className: "font-bold text-xs mb-1", style: { fontWeight: "800", color: clr, marginBottom: "3px" }, children: isSO ? "Order To:" : "Invoice To:" }),
              n.jsx("div", { className: "font-bold text-xs text-slate-900", style: { fontWeight: "800", color: "#0f172a" }, children: partyName || "Customer" }),
              partyAddress && n.jsx("div", { className: "text-[11px] text-slate-600 leading-tight", style: { color: "#475569", fontSize: "10px" }, children: partyAddress }),
              partyPhone && n.jsxs("div", { className: "text-[10px] text-slate-500 font-mono mt-0.5", children: ["Ph: ", partyPhone] })
            ]
          }),
          n.jsxs("div", {
            className: "space-y-0.5",
            children: [
              n.jsx("div", { className: "font-bold text-xs mb-1", style: { fontWeight: "800", color: clr, marginBottom: "3px" }, children: isSO ? "Order Details:" : "Invoice Details:" }),
              n.jsxs("div", { className: "text-[11px] text-slate-700 font-medium", children: [(isSO ? "Order No. : " : "Invoice No. : "), n.jsx("strong", { className: "font-mono text-slate-900", children: docNo || "-" })] }),
              n.jsxs("div", { className: "text-[11px] text-slate-700 font-medium", children: [(isSO ? "Order date : " : "Invoice date : "), n.jsx("strong", { className: "font-mono text-slate-900", children: typeof vr === "function" ? vr(docDate) : docDate })] }),
              n.jsxs("div", { className: "text-[11px] text-slate-700 font-medium", children: [(isSO ? "Order Amount : " : "Invoice Amount : "), n.jsxs("strong", { className: "font-mono text-slate-900", children: ["₹ ", amtStr] })] })
            ]
          }),
          n.jsxs("div", {
            className: "text-center pt-2 flex flex-col justify-end items-center",
            style: { display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", textAlign: "center" },
            children: [
              n.jsx("div", { className: "h-7" }),
              n.jsx("div", { className: "border-b border-dashed border-slate-400 mb-1 w-full max-w-[170px]", style: { borderBottom: "1.5px dashed #94a3b8", width: "100%", maxWidth: "170px", marginBottom: "5px" } }),
              n.jsx("div", { className: "text-[10px] font-semibold text-slate-600 uppercase tracking-wider", style: { fontSize: "9.5px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "Receiver's Seal & Sign" })
            ]
          })
        ]
      })
    ]
  });
}
window.__ubitRenderAckSlip = renderUbitAckSlip;

function renderUbitHeaderBillDetailsTable(doc, vr, n, themeColor) {
  const d = doc || {};
  const isCreditOrDebit = Boolean(d.noteNo || d.creditNoteNo || d.debitNoteNo || d.noteType);
  const invoiceNo = d.invoiceNo || d.orderNo || d.billNo || d.challanNo || d.noteNo || d.creditNoteNo || d.debitNoteNo || "-";
  const docDate = typeof vr === "function" && d.date ? vr(d.date) : (d.date || "-");
  const dueDate = d.dueDate && d.dueDate !== d.date ? (typeof vr === "function" ? vr(d.dueDate) : d.dueDate) : "";
  const marketingPerson = isCreditOrDebit ? "" : (d.marketingStaff || d.marketingPerson || d.salesRep || d.salesman || "");
  const ewayBill = isCreditOrDebit ? "" : (d.ewayBillNo || d.ewayBill || d.ewayBillNumber || "");
  const einvoice = (d.orderNo || isCreditOrDebit) ? "" : (d.einvoiceNumber || d.irn || d.eInvoiceNo || "");

  const docNoLabel = d.orderNo ? "Order No" : (d.challanNo ? "Challan No" : (isCreditOrDebit ? (d.debitNoteNo ? "Debit Note No" : "Credit Note No") : "Bill No"));
  const docDateLabel = d.orderNo ? "Order Date" : (d.challanNo ? "Challan Date" : (isCreditOrDebit ? "Note Date" : "Bill Date"));

  const hasRow2 = Boolean(marketingPerson || dueDate);
  const hasRow3 = Boolean(ewayBill || einvoice);

  const makeCellContent = (label, val, isMono, isBreakAll) => n.jsxs("div", {
    className: "w-full",
    children: [
      n.jsx("div", {
        className: "text-[8.5px] font-bold text-slate-500 uppercase tracking-wider",
        style: { fontSize: "8.5px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", marginBottom: "1px" },
        children: label
      }),
      n.jsx("div", {
        className: "text-[10px] leading-tight font-bold text-slate-900" + (isMono ? " font-mono" : ""),
        style: { fontSize: "10px", fontWeight: "700", fontFamily: isMono ? "monospace" : "inherit", color: "#0f172a", wordBreak: isBreakAll ? "break-all" : "normal" },
        children: val
      })
    ]
  });

  return n.jsxs("table", {
    className: "ubit-header-details-table ubit-header-bill-meta-table border-collapse text-left text-[10px] w-full max-w-[260px] ml-auto border border-black font-sans shrink-0",
    style: { width: "100%", maxWidth: "260px", marginLeft: "auto", borderCollapse: "collapse", border: "1.5px solid #000000", fontSize: "10px", textAlign: "left", tableLayout: "fixed", boxSizing: "border-box" },
    children: [
      n.jsxs("tbody", {
        children: [
          // Row 1: Bill No & Bill Date
          n.jsxs("tr", {
            className: "border-b border-black",
            style: { borderBottom: (hasRow2 || hasRow3) ? "1px solid #000000" : "none" },
            children: [
              n.jsx("td", {
                className: "border-r border-black p-1.5 w-1/2 align-top bg-white",
                style: { borderRight: "1px solid #000000", borderBottom: (hasRow2 || hasRow3) ? "1px solid #000000" : "none", padding: "4px 6px", width: "50%", verticalAlign: "top", background: "#ffffff", boxSizing: "border-box" },
                children: makeCellContent(docNoLabel, invoiceNo, true, false)
              }),
              n.jsx("td", {
                className: "p-1.5 w-1/2 align-top bg-white",
                style: { borderBottom: (hasRow2 || hasRow3) ? "1px solid #000000" : "none", padding: "4px 6px", width: "50%", verticalAlign: "top", background: "#ffffff", boxSizing: "border-box" },
                children: makeCellContent(docDateLabel, docDate, true, false)
              })
            ]
          }),

          // Row 2: Marketing Person & Due Date
          hasRow2 && n.jsx("tr", {
            className: "border-b border-black",
            style: { borderBottom: hasRow3 ? "1px solid #000000" : "none" },
            children: (marketingPerson && dueDate) ? [
              n.jsx("td", {
                className: "border-r border-black p-1.5 w-1/2 align-top bg-white",
                style: { borderRight: "1px solid #000000", borderBottom: hasRow3 ? "1px solid #000000" : "none", padding: "4px 6px", width: "50%", verticalAlign: "top", background: "#ffffff", boxSizing: "border-box" },
                children: makeCellContent("Marketing Person", marketingPerson, false, false)
              }),
              n.jsx("td", {
                className: "p-1.5 w-1/2 align-top bg-white",
                style: { borderBottom: hasRow3 ? "1px solid #000000" : "none", padding: "4px 6px", width: "50%", verticalAlign: "top", background: "#ffffff", boxSizing: "border-box" },
                children: makeCellContent("Due Date", dueDate, true, false)
              })
            ] : (dueDate ? n.jsx("td", {
              colSpan: 2,
              className: "p-1.5 w-full align-top bg-white",
              style: { borderBottom: hasRow3 ? "1px solid #000000" : "none", padding: "4px 6px", width: "100%", verticalAlign: "top", background: "#ffffff", boxSizing: "border-box" },
              children: makeCellContent("Due Date", dueDate, true, false)
            }) : n.jsx("td", {
              colSpan: 2,
              className: "p-1.5 w-full align-top bg-white",
              style: { borderBottom: hasRow3 ? "1px solid #000000" : "none", padding: "4px 6px", width: "100%", verticalAlign: "top", background: "#ffffff", boxSizing: "border-box" },
              children: makeCellContent("Marketing Person", marketingPerson, false, false)
            }))
          }),

          // Row 3: E-Way Bill No & E-Invoice
          hasRow3 && n.jsx("tr", {
            children: (ewayBill && einvoice) ? [
              n.jsx("td", {
                className: "border-r border-black p-1.5 w-1/2 align-top bg-white",
                style: { borderRight: "1px solid #000000", padding: "4px 6px", width: "50%", verticalAlign: "top", background: "#ffffff", boxSizing: "border-box" },
                children: makeCellContent("E-Way Bill No", ewayBill, true, true)
              }),
              n.jsx("td", {
                className: "p-1.5 w-1/2 align-top bg-white",
                style: { padding: "4px 6px", width: "50%", verticalAlign: "top", background: "#ffffff", boxSizing: "border-box" },
                children: makeCellContent("E-Invoice", einvoice, true, true)
              })
            ] : (ewayBill ? n.jsx("td", {
              colSpan: 2,
              className: "p-1.5 w-full align-top bg-white",
              style: { padding: "4px 6px", width: "100%", verticalAlign: "top", background: "#ffffff", boxSizing: "border-box" },
              children: makeCellContent("E-Way Bill No", ewayBill, true, true)
            }) : n.jsx("td", {
              colSpan: 2,
              className: "p-1.5 w-full align-top bg-white",
              style: { padding: "4px 6px", width: "100%", verticalAlign: "top", background: "#ffffff", boxSizing: "border-box" },
              children: makeCellContent("E-Invoice", einvoice, true, true)
            }))
          })
        ]
      })
    ]
  });
}
window.__ubitRenderHeaderBillDetailsTable = renderUbitHeaderBillDetailsTable;

function renderUbitEInvoiceQR(einvoiceQrVal, n) {
  if (!einvoiceQrVal || typeof Mw === "undefined") return null;
  return n.jsxs("div", {
    className: "ubit-einvoice-qr-box ml-3 p-1 bg-white border border-slate-300 rounded text-center shrink-0 inline-flex flex-col items-center",
    style: { marginLeft: "12px", padding: "4px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px", textAlign: "center", display: "inline-flex", flexDirection: "column", alignItems: "center" },
    children: [
      n.jsx("span", {
        className: "text-[8.5px] font-extrabold uppercase tracking-wider text-slate-800 mb-0.5",
        style: { fontSize: "8.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.05em", color: "#1e293b", marginBottom: "2px" },
        children: "E-Invoice"
      }),
      n.jsx(Mw, { value: einvoiceQrVal, size: 50, level: "M" })
    ]
  });
}
window.__ubitRenderEInvoiceQR = renderUbitEInvoiceQR;

function renderUbitTerms(termsText, n) {
  const raw = termsText || "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.";
  const points = raw.split(/(?:^|\n|\.\s+)(?=\d+\.\s*)/g)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  const formatted = points.length > 0 ? points : [raw];

  return n.jsxs("div", {
    className: "p-3 bg-slate-50 rounded-xl border border-slate-200 h-full min-h-[105px] text-left",
    style: { padding: "10px 12px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0", minHeight: "100px", textAlign: "left" },
    children: [
      n.jsx("strong", {
        className: "text-slate-900 font-bold text-xs uppercase tracking-wider block mb-1.5",
        style: { color: "#0f172a", fontWeight: "800", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" },
        children: "Terms & Conditions:"
      }),
      n.jsx("div", {
        className: "space-y-1 text-slate-700 text-[9px] leading-relaxed",
        style: { fontSize: "9px", lineHeight: "1.45", color: "#334155" },
        children: formatted.map((pt, idx) => {
          const cleanPt = pt.startsWith((idx+1) + ".") ? pt : (pt.match(/^\d+\./) ? pt : (idx+1) + ". " + pt);
          return n.jsx("div", { style: { marginBottom: "2px" }, children: cleanPt }, idx);
        })
      })
    ]
  });
}
window.__ubitRenderTerms = renderUbitTerms;
function 
renderUbitUnifiedDesign(templateId, invoice, company, bankAccount, qrUrl, n, vr, isSaleDoc, isSaleOrderDoc, showAck) {
  const tpl = templateId || "gst_template_1";
  const inv = invoice || {};
  const comp = company || {};
  const toWords = window.__ubitToWords || (num => Number(num).toFixed(2) + " Rupees Only");
  const isLandscape = comp.orientation === "landscape" || comp.isLandscape === true || inv.orientation === "landscape";
  const paperSize = String(comp.paperSize || inv.paperSize || (comp.meta && comp.meta.paperSize) || (typeof window !== "undefined" && window.__ubitActivePaperSize) || "A4").toUpperCase();
  const isA6 = paperSize.includes("A6");
  const isA5 = paperSize.includes("A5") && !isA6;
  const isLetter = paperSize.includes("LETTER");
  const paperClass = isA6 ? "ubit-paper-a6" : (isA5 ? "ubit-paper-a5" : (isLetter ? "ubit-paper-letter" : "ubit-paper-a4"));
  const wrapperMaxWidth = isA6 ? (isLandscape ? "540px" : "390px") : (isA5 ? (isLandscape ? "750px" : "560px") : (isLandscape ? "1050px" : "800px"));
  const headerTableMaxWidth = isA6 ? "170px" : (isA5 ? "215px" : "260px");

  const isPurchaseDoc = Boolean(comp.isPurchaseDoc || inv.isPurchaseDoc || String(comp.customTitle || inv.docTitle || "").toUpperCase().includes("PURCHASE BILL") || inv.billNo || (inv.id && String(inv.id).startsWith("PUR")));
  const isPurchaseOrder = Boolean(inv.orderNo && isPurchaseDoc) || String(comp.customTitle || "").toUpperCase().includes("PURCHASE ORDER");
  const isDebitNote = Boolean(inv.noteNo && isPurchaseDoc) || String(comp.customTitle || "").toUpperCase().includes("DEBIT NOTE");
  const isDeliveryChallan = Boolean(comp.isDeliveryChallanDoc || inv.challanNo || String(comp.customTitle || "").toUpperCase().includes("CHALLAN"));
  const isSaleOrder = isSaleOrderDoc || Boolean(inv.orderNo && !isPurchaseDoc) || String(comp.customTitle || "").toUpperCase().includes("SALE ORDER");
  const isCreditNoteDoc = Boolean(inv.noteNo && !isPurchaseDoc) || String(comp.customTitle || "").toUpperCase().includes("CREDIT NOTE");

  const docTitle = comp.customTitle || (
    isPurchaseOrder ? "PURCHASE ORDER" :
    isDebitNote ? "DEBIT NOTE (PURCHASE RETURN)" :
    isPurchaseDoc ? "PURCHASE BILL" :
    isDeliveryChallan ? "DELIVERY CHALLAN" :
    isCreditNoteDoc ? "CREDIT NOTE (SALE RETURN)" :
    isSaleOrder ? "SALE ORDER" :
    "TAX INVOICE"
  );

  const invoiceNo = inv.invoiceNo || inv.orderNo || inv.noteNo || inv.billNo || inv.challanNo || "NT/26-27/4610";
  const invDate = typeof vr === "function" && inv.date ? vr(inv.date) : (inv.date || "27-10-2026");
  const dueDate = inv.dueDate && inv.dueDate !== inv.date ? (typeof vr === "function" ? vr(inv.dueDate) : inv.dueDate) : "";
  const marketingStaff = (isSaleOrder || !isCreditNoteDoc) ? (inv.marketingStaff || inv.marketingPerson || inv.salesman || inv.salesStaff || "") : "";
  const ewayBillNo = (isSaleOrder || !isCreditNoteDoc) ? (inv.ewayBillNo || inv.ewayBillNumber || "") : "";
  const einvoiceNo = (isSaleOrder || isCreditNoteDoc || isDeliveryChallan) ? "" : (inv.einvoiceNumber || inv.irn || "");
  const einvoiceQr = (isSaleOrder || isCreditNoteDoc || isDeliveryChallan) ? "" : (inv.signedQrCode || inv.einvoiceQr || "");
  const einvoiceVal = einvoiceQr || einvoiceNo;

  const partyName = inv.partyName || "Customer Name (Dummy Entry)";
  const partyAddress = inv.partyAddress || "123 Sample Street, Commercial Hub, Salem - 636001";
  const partyPhone = inv.partyPhone || "+91 98765 43210";
  const partyState = inv.partyState || "33-Tamil Nadu";
  const partyGstin = inv.partyGstin || inv.gstin || "33AAABC0000A1Z5";
  const partyPan = inv.partyPan || inv.pan || (partyGstin ? partyGstin.substring(2, 12) : "AABC0000A");
  const partyPlaceOfSupply = inv.placeOfSupply || partyState || "33 - Tamil Nadu";
  const shippingAddress = inv.shippingAddress || inv.shipToAddress || "";
  const paymentMode = inv.paymentMode || inv.mode || "Credit";

  const companyName = comp.name || "UBIT DEMO ENTERPRISE";
  const companyAddress = comp.address || "45-B, M.G. Road, Near Town Hall, Salem - 636001";
  const companyPhone = comp.phone || "9842155678";
  const companyEmail = comp.email || "demo@ubitproerp.com";
  const companyGstin = comp.gstin || "33AABCS1429B1Z1";
  const companyPan = comp.pan || (companyGstin ? companyGstin.substring(2, 12) : "AABCS1429B");
  const companyState = comp.state || "Tamil Nadu";

  const items = Array.isArray(inv.items) && inv.items.length > 0 ? inv.items : [
    { name: "Sample Item A (Dummy Product)", hsn: "1001", batch: "B-101", mrp: 500, qty: 10, price: 400, gstRate: 5, finalRate: 420, total: 4200 },
    { name: "Sample Item B (Dummy Product)", hsn: "1002", batch: "B-102", mrp: 1000, qty: 5, price: 800, gstRate: 18, finalRate: 944, total: 4720 }
  ];

  const hasHsnData = items.some(it => it.hsn && String(it.hsn).trim() !== "" && String(it.hsn).trim() !== "-");
  const hasBatchData = items.some(it => (it.batchNo || it.batch) && String(it.batchNo || it.batch).trim() !== "" && String(it.batchNo || it.batch).trim() !== "-");
  const hasMrpData = items.some(it => it.mrp && Number(it.mrp) > 0 && String(it.mrp).trim() !== "-");

  const cleanGrandTotal = typeof inv.grandTotal === "number" ? inv.grandTotal : (parseFloat(String(inv.grandTotal || "8920").replace(/[^0-9.-]+/g, "")) || 8920);
  const totalInWords = toWords(cleanGrandTotal);
  const balanceDueVal = inv.balanceDue !== undefined ? Number(inv.balanceDue) : (inv.partyBalance !== undefined ? Number(inv.partyBalance) : cleanGrandTotal);

  /* docTitle already declared above */
  const copyLabel = comp.activeCopyLabel !== undefined ? comp.activeCopyLabel : (comp.enablePrintCopies ? (
    comp.copyOriginal !== false ? "ORIGINAL FOR RECIPIENT" :
    comp.copyDuplicate ? "DUPLICATE FOR TRANSPORTER" : "TRIPLICATE FOR USER"
  ) : "ORIGINAL FOR RECIPIENT");

  const userBank = (bankAccount && (bankAccount.bankName || bankAccount.accountName)) ? bankAccount : (
    comp && Array.isArray(comp.bankAccounts) && (comp.bankAccounts.find(bk => bk.isDefault) || comp.bankAccounts[0])
  ) || null;

  const bankAccNo = userBank ? (userBank.accountNumber || userBank.accountNo || "-") : "50200012345678";
  const bankName = userBank ? (userBank.bankName || "-") : "HDFC Bank";
  const bankIfsc = userBank ? (userBank.ifscCode || userBank.ifsc || "-") : "HDFC0000123";
  const bankBranch = userBank ? (userBank.branch || userBank.branchName || "-") : "Town Hall Branch, Salem";
  const bankUpi = userBank ? (userBank.upiId || userBank.upiNumber || comp.upiId || "") : "ubitdemo@okaxis";

  const totalQty = items.reduce((acc, it) => acc + Number(it.qty || it.quantity || 1), 0);
  const subTotal = items.reduce((acc, it) => acc + (Number(it.qty || it.quantity || 1) * Number(it.price || it.rate || 0)), 0);
  const taxTotal = Math.max(0, cleanGrandTotal - subTotal);

  // Rate breakdown calculation
  const taxByRate = {};
  items.forEach(it => {
    const rate = Number(it.gstRate || it.gst || it.tax || 0);
    const q = Number(it.qty || it.quantity || 1);
    const p = Number(it.price || it.rate || 0);
    const taxable = q * p;
    const itTot = Number(it.total || it.amount || (taxable * (1 + rate / 100)));
    const taxAmt = Math.max(0, itTot - taxable);
    if (!taxByRate[rate]) {
      taxByRate[rate] = { hsn: it.hsn || "-", taxable: 0, cgst: 0, sgst: 0, totalTax: 0 };
    }
    taxByRate[rate].taxable += taxable;
    taxByRate[rate].totalTax += taxAmt;
    taxByRate[rate].cgst += taxAmt / 2;
    taxByRate[rate].sgst += taxAmt / 2;
  });

  const themeColor = comp.themeColor || "#10263c";
  const upiQrPayload = `upi://pay?pa=${bankUpi}&pn=${encodeURIComponent(companyName)}&am=${cleanGrandTotal}&cu=INR`;

  // Standard Acknowledgement Slip helper
  const renderAckSlip = (ackTheme) => {
    if (!showAck) return null;
    return n.jsxs("div", {
      className: "ubit-acknowledgement-slip mt-4 pt-3 text-slate-800 text-[10px]",
      style: { marginTop: "12px", paddingTop: "8px", borderTop: "2px dashed #94a3b8", width: "100%", boxSizing: "border-box" },
      children: [
        n.jsxs("div", {
          className: "text-center mb-2",
          style: { textAlign: "center", marginBottom: "6px" },
          children: [
            n.jsx("div", { style: { fontWeight: "900", fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#000000" }, children: "ACKNOWLEDGEMENT" }),
            n.jsx("div", { style: { fontWeight: "800", fontSize: "12px", textTransform: "uppercase", color: ackTheme || themeColor }, children: companyName })
          ]
        }),
        n.jsxs("div", {
          className: "grid grid-cols-3 gap-3 text-left pt-1 items-start",
          style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", textAlign: "left", alignItems: "start" },
          children: [
            n.jsxs("div", {
              className: "space-y-0.5",
              children: [
                n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", color: "#000000", marginBottom: "2px" }, children: "INVOICE DETAILS" }),
                n.jsxs("div", { children: ["Invoice No: ", n.jsx("strong", { children: invoiceNo })] }),
                n.jsxs("div", { children: ["Date: ", invDate] }),
                n.jsxs("div", { style: { fontWeight: "700" }, children: ["Invoice Amount: ₹ ", cleanGrandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })] })
              ]
            }),
            n.jsxs("div", {
              className: "space-y-0.5",
              children: [
                n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", color: "#000000", marginBottom: "2px" }, children: "RECEIVER DETAILS" }),
                n.jsx("div", { style: { fontWeight: "700" }, children: partyName }),
                partyAddress && n.jsx("div", { style: { fontSize: "9px", color: "#475569" }, children: partyAddress }),
                partyPhone && n.jsxs("div", { style: { fontSize: "9px", color: "#475569" }, children: ["Contact: ", partyPhone] })
              ]
            }),
            n.jsxs("div", {
              className: "text-right flex flex-col justify-between h-full pt-0.5",
              style: { textAlign: "right", display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" },
              children: [
                n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", color: "#000000" }, children: "SIGNATURE" }),
                n.jsx("div", { style: { marginTop: "24px", fontSize: "9px", color: "#475569" }, children: "Receiver's Signature / Seal" })
              ]
            })
          ]
        })
      ]
    });
  };

  // =========================================================================
  // DESIGN 2: AMBER / PEACH STATIONERY CLASSIC (Image 1)
  // =========================================================================
  if (tpl === "gst_template_2") {
    const peachBg = "#ffeedb";
    const warmBorder = "1px solid #c2410c";
    const warmText = "#431407";

    const taxSummaryParts = Object.keys(taxByRate).map(r => {
      const data = taxByRate[r];
      return `Sale @${r}% = ${data.taxable.toFixed(2)}, CGST = ${data.cgst.toFixed(2)}, SGST = ${data.sgst.toFixed(2)}`;
    }).join(" | ");

    return n.jsxs("div", {
      className: "printable-area p-4 sm:p-6 text-slate-800 printable-invoice-wrapper w-full leading-normal",
      style: { width: "100%", maxWidth: wrapperMaxWidth, margin: "0 auto", boxSizing: "border-box", background: "#ffffff" },
      children: [
        n.jsxs("div", {
          className: "ubit-invoice-outer-box ubit-doc-outer-box " + paperClass + "  p-4 rounded-none overflow-hidden w-full text-[10px]",
          style: { border: "1.5px solid #c2410c", background: peachBg, color: warmText, boxSizing: "border-box" },
          children: [
            // Top Bar: Page No | TAX INVOICE | Original Copy
            n.jsxs("div", {
              className: "flex justify-between items-center pb-2 mb-2 text-[10px]",
              style: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: warmBorder, paddingBottom: "4px", marginBottom: "6px" },
              children: [
                n.jsx("div", { style: { fontWeight: "700" }, children: "Page No. 1 of 1" }),
                n.jsx("div", { style: { fontWeight: "900", fontSize: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }, children: docTitle }),
                n.jsx("div", { style: { fontWeight: "700", fontSize: "10px", textTransform: "uppercase" }, children: copyLabel })
              ]
            }),

            // Top Section (3-Column): Company Details (Left) | E-Invoice QR (Center) | Bill Metadata Table (Right)
            n.jsxs("div", {
              style: { display: "grid", gridTemplateColumns: einvoiceVal ? "5fr 3fr 4fr" : "7fr 5fr", borderBottom: warmBorder, paddingBottom: "6px", marginBottom: "6px", textAlign: "left", alignItems: "stretch" },
              children: [
                // Company info
                n.jsxs("div", {
                  style: { borderRight: warmBorder, paddingRight: "8px" },
                  children: [
                    comp.logoUrl && n.jsx("img", { src: comp.logoUrl, alt: "Logo", style: { maxHeight: "36px", maxWidth: "110px", objectFit: "contain", marginBottom: "2px" } }),
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "14px", textTransform: "uppercase" }, children: companyName }),
                    n.jsx("div", { style: { fontSize: "9.5px", marginTop: "1px" }, children: companyAddress }),
                    comp.phone && n.jsxs("div", { style: { fontSize: "9.5px" }, children: ["Ph: ", companyPhone] }),
                    n.jsxs("div", { style: { fontSize: "9.5px", fontWeight: "700", marginTop: "1px" }, children: ["GSTIN - ", companyGstin, " | PAN - ", companyPan] })
                  ]
                }),
                // E-Invoice QR (Center)
                n.jsx("div", {
                  style: { borderRight: warmBorder, padding: "4px 8px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
                  children: renderUbitEInvoiceQR(einvoiceVal, n)
                }),
                // Metadata Table (Right)
                n.jsx("div", {
                  style: { paddingLeft: "8px" },
                  children: renderUbitHeaderBillDetailsTable(inv, vr, n, "#c2410c")
                })
              ]
            }),

            // Party Details: Bill To (Left) | Shipping Address (Middle) | Balance Due (Right Corner)
            n.jsxs("div", {
              style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: warmBorder, paddingBottom: "6px", marginBottom: "6px", textAlign: "left", gap: "10px" },
              children: [
                n.jsxs("div", {
                  style: { flex: "1 1 0%" },
                  children: [
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9a3412", marginBottom: "2px" }, children: isSaleOrderDoc ? "ORDER TO:" : "BILLED TO:" }),
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "12px" }, children: partyName }),
                    partyGstin && n.jsxs("div", { children: ["GSTIN: ", n.jsx("strong", { children: partyGstin })] }),
                    partyAddress && n.jsxs("div", { children: ["Address: ", partyAddress] }),
                    partyPhone && n.jsxs("div", { children: ["Phone: ", partyPhone] })
                  ]
                }),
                shippingAddress && n.jsxs("div", {
                  style: { flex: "1 1 0%", borderLeft: "1px dashed #c2410c", paddingLeft: "8px" },
                  children: [
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9a3412", marginBottom: "2px" }, children: "SHIPPED TO:" }),
                    n.jsx("div", { style: { fontSize: "10px" }, children: shippingAddress })
                  ]
                }),
                n.jsxs("div", {
                  style: { textAlign: "right", shrink: 0, minWidth: "110px", background: "#fed7aa", padding: "6px 8px", borderRadius: "4px", border: warmBorder },
                  children: [
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9a3412" }, children: "BALANCE DUE:" }),
                    n.jsxs("div", { style: { fontWeight: "900", fontSize: "13px", fontFamily: "monospace", color: "#9a3412", marginTop: "2px" }, children: ["₹ ", balanceDueVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })] })
                  ]
                })
              ]
            }),

            // Items Table with Warm Amber Header & Vertical Borders
            n.jsxs("table", {
              className: "w-full border-collapse text-left",
              style: { width: "100%", borderCollapse: "collapse", border: warmBorder, textAlign: "left", marginBottom: "6px" },
              children: [
                n.jsx("thead", {
                  children: n.jsxs("tr", {
                    style: { background: "#fed7aa", borderBottom: warmBorder, fontWeight: "700", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.03em" },
                    children: [
                      n.jsx("th", { style: { borderRight: warmBorder, padding: "4px 6px", width: "28px", textAlign: "center" }, children: "Sr." }),
                      n.jsx("th", { style: { borderRight: warmBorder, padding: "4px 6px" }, children: "Item Description" }),
                      hasHsnData && n.jsx("th", { style: { borderRight: warmBorder, padding: "4px 6px", width: "65px", textAlign: "center" }, children: "HSN/SAC" }),
                      hasBatchData && n.jsx("th", { style: { borderRight: warmBorder, padding: "4px 6px", width: "65px", textAlign: "center" }, children: "Batch No" }),
                      hasMrpData && n.jsx("th", { style: { borderRight: warmBorder, padding: "4px 6px", width: "65px", textAlign: "right" }, children: "MRP" }),
                      n.jsx("th", { style: { borderRight: warmBorder, padding: "4px 6px", width: "45px", textAlign: "right" }, children: "Qty" }),
                      n.jsx("th", { style: { borderRight: warmBorder, padding: "4px 6px", width: "70px", textAlign: "right" }, children: "Rate" }),
                      n.jsx("th", { style: { borderRight: warmBorder, padding: "4px 6px", width: "55px", textAlign: "right" }, children: "GST %" }),
                      n.jsx("th", { style: { padding: "4px 6px", width: "85px", textAlign: "right" }, children: "Amount (₹)" })
                    ]
                  })
                }),
                n.jsx("tbody", {
                  children: items.map((it, idx) => {
                    const q = Number(it.qty || it.quantity || 1);
                    const p = Number(it.price || it.rate || 0);
                    const r = Number(it.gstRate || it.gst || it.tax || 0);
                    const tot = Number(it.total || it.amount || (q * p * (1 + r / 100)));
                    return n.jsxs("tr", {
                      style: { borderBottom: warmBorder },
                      children: [
                        n.jsx("td", { style: { borderRight: warmBorder, padding: "4px 6px", textAlign: "center" }, children: idx + 1 }),
                        n.jsx("td", { style: { borderRight: warmBorder, padding: "4px 6px", fontWeight: "600" }, children: it.name || it.itemName }),
                        hasHsnData && n.jsx("td", { style: { borderRight: warmBorder, padding: "4px 6px", textAlign: "center" }, children: it.hsn || "-" }),
                        hasBatchData && n.jsx("td", { style: { borderRight: warmBorder, padding: "4px 6px", textAlign: "center" }, children: it.batchNo || it.batch || "-" }),
                        hasMrpData && n.jsx("td", { style: { borderRight: warmBorder, padding: "4px 6px", textAlign: "right" }, children: Number(it.mrp || 0).toFixed(2) }),
                        n.jsx("td", { style: { borderRight: warmBorder, padding: "4px 6px", textAlign: "right" }, children: q }),
                        n.jsx("td", { style: { borderRight: warmBorder, padding: "4px 6px", textAlign: "right" }, children: p.toFixed(2) }),
                        n.jsx("td", { style: { borderRight: warmBorder, padding: "4px 6px", textAlign: "right" }, children: r + "%" }),
                        n.jsx("td", { style: { padding: "4px 6px", textAlign: "right", fontWeight: "700" }, children: tot.toFixed(2) })
                      ]
                    }, idx);
                  })
                }),
                n.jsx("tfoot", {
                  children: n.jsxs("tr", {
                    style: { background: "#fed7aa", borderTop: warmBorder, fontWeight: "800" },
                    children: [
                      n.jsx("td", { colSpan: 2 + (hasHsnData ? 1 : 0) + (hasBatchData ? 1 : 0) + (hasMrpData ? 1 : 0), style: { borderRight: warmBorder, padding: "4px 6px", textAlign: "right" }, children: "Total:" }),
                      n.jsx("td", { style: { borderRight: warmBorder, padding: "4px 6px", textAlign: "right" }, children: totalQty }),
                      n.jsx("td", { colSpan: 2, style: { borderRight: warmBorder, padding: "4px 6px", textAlign: "right" }, children: "Tax: " + taxTotal.toFixed(2) }),
                      n.jsx("td", { style: { padding: "4px 6px", textAlign: "right" }, children: cleanGrandTotal.toFixed(2) })
                    ]
                  })
                })
              ]
            }),

            // Amount in words + Tax summary bar
            n.jsxs("div", {
              className: "py-1 border-b border-orange-900/40 text-left font-semibold",
              style: { borderBottom: warmBorder, paddingBottom: "4px", marginBottom: "6px", textAlign: "left" },
              children: [
                n.jsxs("div", { children: ["Amount in Words: ", n.jsx("strong", { children: totalInWords })] }),
                taxSummaryParts && n.jsx("div", { style: { fontSize: "9px", opacity: 0.85, marginTop: "2px" }, children: taxSummaryParts })
              ]
            }),

            // 3 Bottom Boxes: Terms & Conditions (Left) | Bank Details & QR (Center) | Signatory (Right)
            n.jsxs("div", {
              className: "grid grid-cols-3 gap-2 text-left items-stretch",
              style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", textAlign: "left", alignItems: "stretch" },
              children: [
                // Box 1: Terms point by point
                n.jsxs("div", {
                  style: { border: warmBorder, padding: "6px", background: "#fff7ed", height: "100%", boxSizing: "border-box" },
                  children: [
                    renderUbitTerms(comp.termsAndConditions || comp.customTerms || "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.", n)
                  ]
                }),
                // Box 2: Bank details + UPI QR
                n.jsxs("div", {
                  style: { border: warmBorder, padding: "6px", background: "#fff7ed", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between" },
                  children: [
                    n.jsxs("div", {
                      children: [
                        n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9a3412", marginBottom: "2px" }, children: "BANK DETAILS:" }),
                        n.jsxs("div", { children: ["Bank: ", bankName] }),
                        n.jsxs("div", { children: ["A/c: ", bankAccNo] }),
                        n.jsxs("div", { children: ["IFSC: ", bankIfsc] }),
                        n.jsxs("div", { children: ["Branch: ", bankBranch] })
                      ]
                    }),
                    typeof Mw !== "undefined" && bankUpi && n.jsxs("div", {
                      style: { display: "flex", alignItems: "center", gap: "6px", marginTop: "4px", paddingTop: "4px", borderTop: "1px dashed #c2410c" },
                      children: [
                        n.jsx(Mw, { value: upiQrPayload, size: 40, level: "M" }),
                        n.jsx("div", { style: { fontSize: "8px", fontWeight: "700" }, children: "Scan to Pay via UPI" })
                      ]
                    })
                  ]
                }),
                // Box 3: Signatory
                n.jsxs("div", {
                  style: { border: warmBorder, padding: "6px", background: "#fff7ed", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "right" },
                  children: [
                    n.jsxs("div", {
                      children: [
                        n.jsxs("div", { style: { fontSize: "9px" }, children: ["For ", n.jsx("strong", { children: companyName })] }),
                        n.jsx("div", { style: { fontSize: "8.5px", color: "#78350f", marginTop: "1px" }, children: "(Authorised Signatory)" })
                      ]
                    }),
                    n.jsx("div", {
                      style: { marginTop: "24px" },
                      children: comp.signatureUrl ? n.jsx("img", { src: comp.signatureUrl, alt: "Signature", style: { maxHeight: "36px", maxWidth: "90px", objectFit: "contain", marginLeft: "auto" } }) : n.jsx("div", { style: { borderBottom: warmBorder, width: "100px", marginLeft: "auto", marginBottom: "4px" } })
                    })
                  ]
                })
              ]
            })
          ]
        }),
        renderAckSlip("#c2410c")
      ]
    });
  }

  // =========================================================================
  // DESIGN 3: VIBRANT RED ACCENT WITH HSN BREAKDOWN & BALANCE STRIP (Image 2)
  // =========================================================================
  if (tpl === "gst_template_3") {
    const redAccent = "#dc2626";
    const greyBorder = "1px solid #cbd5e1";

    return n.jsxs("div", {
      className: "printable-area p-4 sm:p-6 text-slate-800 printable-invoice-wrapper w-full leading-normal",
      style: { width: "100%", maxWidth: wrapperMaxWidth, margin: "0 auto", boxSizing: "border-box", background: "#ffffff" },
      children: [
        renderUbitDocTopBar(docTitle, copyLabel, n, tpl),
        n.jsxs("div", {
          className: "ubit-invoice-outer-box ubit-doc-outer-box " + paperClass + "  bg-white overflow-hidden w-full text-[10px]",
          style: { border: greyBorder, color: "#000000", boxSizing: "border-box" },
          children: [
            // Top Section (3-Column): Company Left | E-Invoice QR Center | Document Meta Right
            n.jsxs("div", {
              className: "grid grid-cols-12 border-b border-slate-300",
              style: { display: "grid", gridTemplateColumns: einvoiceVal ? "5fr 3fr 4fr" : "7fr 5fr", borderBottom: greyBorder, alignItems: "stretch" },
              children: [
                n.jsxs("div", {
                  className: "p-3 text-left space-y-1",
                  style: { padding: "10px 12px", textAlign: "left", borderRight: greyBorder },
                  children: [
                    comp.logoUrl && n.jsx("img", { src: comp.logoUrl, alt: "Logo", style: { maxHeight: "38px", maxWidth: "120px", objectFit: "contain", marginBottom: "4px" } }),
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "14px", color: redAccent, textTransform: "uppercase" }, children: companyName }),
                    n.jsx("div", { style: { fontSize: "10px", color: "#475569" }, children: companyAddress }),
                    n.jsxs("div", { style: { fontSize: "10px" }, children: ["Phone: ", comp.phone || "-"] }),
                    n.jsxs("div", { style: { fontSize: "10px", fontWeight: "700" }, children: ["GSTIN: ", companyGstin] }),
                    n.jsxs("div", { style: { fontSize: "10px" }, children: ["PAN Number: ", companyPan] })
                  ]
                }),
                n.jsx("div", {
                  style: { borderRight: greyBorder, padding: "6px 8px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
                  children: renderUbitEInvoiceQR(einvoiceVal, n)
                }),
                n.jsxs("div", {
                  className: "p-2 border-slate-300 text-left bg-slate-50/50",
                  style: { padding: "0", textAlign: "left" },
                  children: [
                    n.jsxs("div", {
                      className: "flex justify-between items-center p-2 border-b border-slate-200",
                      style: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: greyBorder, padding: "4px 8px", background: "#fef2f2" },
                      children: [
                        n.jsx("div", { style: { fontWeight: "900", fontSize: "12px", color: redAccent, textTransform: "uppercase" }, children: docTitle }),
                        n.jsx("div", { style: { fontSize: "9px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }, children: copyLabel })
                      ]
                    }),
                    renderUbitHeaderBillDetailsTable(inv, vr, n, redAccent)
                  ]
                })
              ]
            }),

            // BILL TO & SHIP TO & BALANCE DUE (3-Section Box)
            n.jsxs("div", {
              className: "border-b border-slate-300 text-left text-[10px]",
              style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: greyBorder, padding: "8px 12px", textAlign: "left", gap: "10px" },
              children: [
                n.jsxs("div", {
                  className: "space-y-0.5",
                  style: { flex: "1 1 0%" },
                  children: [
                    n.jsx("div", { style: { fontWeight: "800", color: "#64748b", textTransform: "uppercase", fontSize: "9px", letterSpacing: "0.05em" }, children: isSaleOrderDoc ? "ORDER TO:" : "BILLED TO:" }),
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "12px" }, children: partyName }),
                    partyAddress && n.jsx("div", { style: { color: "#475569" }, children: partyAddress }),
                    partyPhone && n.jsxs("div", { children: ["Phone: ", partyPhone] }),
                    n.jsxs("div", { children: ["GSTIN: ", n.jsx("strong", { children: partyGstin })] }),
                    n.jsxs("div", { children: ["Place of Supply: ", partyPlaceOfSupply] })
                  ]
                }),
                shippingAddress && n.jsxs("div", {
                  className: "space-y-0.5",
                  style: { flex: "1 1 0%", borderLeft: "1px dashed #cbd5e1", paddingLeft: "10px" },
                  children: [
                    n.jsx("div", { style: { fontWeight: "800", color: "#64748b", textTransform: "uppercase", fontSize: "9px", letterSpacing: "0.05em" }, children: "SHIPPED TO:" }),
                    n.jsx("div", { style: { color: "#475569" }, children: shippingAddress })
                  ]
                }),
                n.jsxs("div", {
                  style: { textAlign: "right", shrink: 0, minWidth: "110px", background: "#fef2f2", padding: "6px 10px", borderRadius: "4px", border: "1px solid #fca5a5" },
                  children: [
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", color: redAccent, textTransform: "uppercase", letterSpacing: "0.05em" }, children: "BALANCE DUE:" }),
                    n.jsxs("div", { style: { fontWeight: "900", fontSize: "14px", fontFamily: "monospace", color: redAccent, marginTop: "2px" }, children: ["₹ ", balanceDueVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })] })
                  ]
                })
              ]
            }),

            // 4-Pill Summary Strip
            n.jsxs("div", {
              className: "grid grid-cols-4 border-b border-slate-300 text-center font-bold text-[9.5px]",
              style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderBottom: greyBorder, background: "#f8fafc" },
              children: [
                n.jsxs("div", { style: { padding: "6px 4px", borderRight: greyBorder }, children: [n.jsx("span", { style: { color: "#64748b", fontWeight: "600", display: "block", fontSize: "8.5px" }, children: "Total Amount" }), n.jsxs("span", { style: { fontFamily: "monospace", color: "#0f172a" }, children: ["₹ ", cleanGrandTotal.toFixed(2)] })] }),
                n.jsxs("div", { style: { padding: "6px 4px", borderRight: greyBorder }, children: [n.jsx("span", { style: { color: "#64748b", fontWeight: "600", display: "block", fontSize: "8.5px" }, children: "Received" }), n.jsxs("span", { style: { fontFamily: "monospace", color: "#16a34a" }, children: ["₹ ", (cleanGrandTotal - balanceDueVal).toFixed(2)] })] }),
                n.jsxs("div", { style: { padding: "6px 4px", borderRight: greyBorder }, children: [n.jsx("span", { style: { color: "#64748b", fontWeight: "600", display: "block", fontSize: "8.5px" }, children: "Balance Due" }), n.jsxs("span", { style: { fontFamily: "monospace", color: redAccent }, children: ["₹ ", balanceDueVal.toFixed(2)] })] }),
                n.jsxs("div", { style: { padding: "6px 4px" }, children: [n.jsx("span", { style: { color: "#64748b", fontWeight: "600", display: "block", fontSize: "8.5px" }, children: "Total Qty" }), n.jsxs("span", { style: { fontFamily: "monospace", color: "#0f172a" }, children: [totalQty, " Items"] })] })
              ]
            }),

            // Items Table with Solid Red Header
            n.jsxs("table", {
              className: "w-full border-collapse text-left",
              style: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
              children: [
                n.jsx("thead", {
                  children: n.jsxs("tr", {
                    style: { background: redAccent, color: "#ffffff", fontWeight: "700", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.03em" },
                    children: [
                      n.jsx("th", { style: { borderRight: "1px solid rgba(255,255,255,0.3)", padding: "5px 6px", width: "32px", textAlign: "center" }, children: "S. No." }),
                      n.jsx("th", { style: { borderRight: "1px solid rgba(255,255,255,0.3)", padding: "5px 6px" }, children: "Item" }),
                      hasHsnData && n.jsx("th", { style: { borderRight: "1px solid rgba(255,255,255,0.3)", padding: "5px 6px", width: "70px", textAlign: "center" }, children: "HSN" }),
                      hasBatchData && n.jsx("th", { style: { borderRight: "1px solid rgba(255,255,255,0.3)", padding: "5px 6px", width: "70px", textAlign: "center" }, children: "Batch" }),
                      hasMrpData && n.jsx("th", { style: { borderRight: "1px solid rgba(255,255,255,0.3)", padding: "5px 6px", width: "65px", textAlign: "right" }, children: "MRP" }),
                      n.jsx("th", { style: { borderRight: "1px solid rgba(255,255,255,0.3)", padding: "5px 6px", width: "60px", textAlign: "right" }, children: "Quantity" }),
                      n.jsx("th", { style: { borderRight: "1px solid rgba(255,255,255,0.3)", padding: "5px 6px", width: "75px", textAlign: "right" }, children: "Rate" }),
                      n.jsx("th", { style: { borderRight: "1px solid rgba(255,255,255,0.3)", padding: "5px 6px", width: "60px", textAlign: "right" }, children: "Tax %" }),
                      n.jsx("th", { style: { padding: "5px 6px", width: "90px", textAlign: "right" }, children: "Total Amount" })
                    ]
                  })
                }),
                n.jsx("tbody", {
                  children: items.map((it, idx) => {
                    const q = Number(it.qty || it.quantity || 1);
                    const p = Number(it.price || it.rate || 0);
                    const r = Number(it.gstRate || it.gst || it.tax || 0);
                    const tot = Number(it.total || it.amount || (q * p * (1 + r / 100)));
                    return n.jsxs("tr", {
                      style: { borderBottom: greyBorder },
                      children: [
                        n.jsx("td", { style: { borderRight: greyBorder, padding: "5px 6px", textAlign: "center" }, children: idx + 1 }),
                        n.jsx("td", { style: { borderRight: greyBorder, padding: "5px 6px", fontWeight: "600" }, children: it.name || it.itemName }),
                        hasHsnData && n.jsx("td", { style: { borderRight: greyBorder, padding: "5px 6px", textAlign: "center" }, children: it.hsn || "-" }),
                        hasBatchData && n.jsx("td", { style: { borderRight: greyBorder, padding: "5px 6px", textAlign: "center" }, children: it.batchNo || it.batch || "-" }),
                        hasMrpData && n.jsx("td", { style: { borderRight: greyBorder, padding: "5px 6px", textAlign: "right" }, children: Number(it.mrp || 0).toFixed(2) }),
                        n.jsx("td", { style: { borderRight: greyBorder, padding: "5px 6px", textAlign: "right" }, children: q }),
                        n.jsx("td", { style: { borderRight: greyBorder, padding: "5px 6px", textAlign: "right" }, children: p.toFixed(2) }),
                        n.jsx("td", { style: { borderRight: greyBorder, padding: "5px 6px", textAlign: "right" }, children: r + "%" }),
                        n.jsx("td", { style: { padding: "5px 6px", textAlign: "right", fontWeight: "700" }, children: tot.toFixed(2) })
                      ]
                    }, idx);
                  })
                }),
                n.jsx("tfoot", {
                  children: n.jsxs("tr", {
                    style: { background: "#f8fafc", borderTop: "2px solid #000000", fontWeight: "800" },
                    children: [
                      n.jsx("td", { colSpan: 2 + (hasHsnData ? 1 : 0) + (hasBatchData ? 1 : 0) + (hasMrpData ? 1 : 0), style: { borderRight: greyBorder, padding: "5px 6px", textAlign: "right" }, children: "Total:" }),
                      n.jsx("td", { style: { borderRight: greyBorder, padding: "5px 6px", textAlign: "right" }, children: totalQty }),
                      n.jsx("td", { colSpan: 2, style: { borderRight: greyBorder, padding: "5px 6px", textAlign: "right" }, children: "Tax: ₹ " + taxTotal.toFixed(2) }),
                      n.jsx("td", { style: { padding: "5px 6px", textAlign: "right", color: redAccent, fontSize: "11px" }, children: "₹ " + cleanGrandTotal.toFixed(2) })
                    ]
                  })
                })
              ]
            }),

            // Amount in words
            n.jsxs("div", {
              className: "p-2 border-b border-slate-300 text-left font-semibold bg-slate-50",
              style: { borderBottom: greyBorder, padding: "6px 12px", textAlign: "left", background: "#f8fafc" },
              children: [
                n.jsxs("div", { children: ["Amount In Words: ", n.jsx("strong", { children: totalInWords })] })
              ]
            }),

            // Detailed GST Tax Breakdown Table
            n.jsxs("div", {
              className: "p-2 border-b border-slate-300 text-left",
              style: { borderBottom: greyBorder, padding: "6px 12px", textAlign: "left" },
              children: [
                n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", color: "#475569", marginBottom: "4px" }, children: "GST Tax Breakdown" }),
                n.jsxs("table", {
                  className: "w-full border-collapse text-[9px]",
                  style: { width: "100%", borderCollapse: "collapse", border: greyBorder },
                  children: [
                    n.jsx("thead", {
                      children: n.jsxs("tr", {
                        style: { background: "#f1f5f9", borderBottom: greyBorder, fontWeight: "700" },
                        children: [
                          n.jsx("th", { style: { borderRight: greyBorder, padding: "3px 4px", textAlign: "center" }, children: "HSN/SAC" }),
                          n.jsx("th", { style: { borderRight: greyBorder, padding: "3px 4px", textAlign: "right" }, children: "Taxable Value" }),
                          n.jsx("th", { style: { borderRight: greyBorder, padding: "3px 4px", textAlign: "right" }, children: "CGST" }),
                          n.jsx("th", { style: { borderRight: greyBorder, padding: "3px 4px", textAlign: "right" }, children: "SGST" }),
                          n.jsx("th", { style: { padding: "3px 4px", textAlign: "right" }, children: "Total Tax" })
                        ]
                      })
                    }),
                    n.jsx("tbody", {
                      children: Object.keys(taxByRate).map(r => {
                        const d = taxByRate[r];
                        return n.jsxs("tr", {
                          style: { borderBottom: greyBorder },
                          children: [
                            n.jsx("td", { style: { borderRight: greyBorder, padding: "3px 4px", textAlign: "center" }, children: d.hsn || "-" }),
                            n.jsx("td", { style: { borderRight: greyBorder, padding: "3px 4px", textAlign: "right" }, children: d.taxable.toFixed(2) }),
                            n.jsx("td", { style: { borderRight: greyBorder, padding: "3px 4px", textAlign: "right" }, children: d.cgst.toFixed(2) }),
                            n.jsx("td", { style: { borderRight: greyBorder, padding: "3px 4px", textAlign: "right" }, children: d.sgst.toFixed(2) }),
                            n.jsx("td", { style: { padding: "3px 4px", textAlign: "right" }, children: d.totalTax.toFixed(2) })
                          ]
                        }, r);
                      })
                    })
                  ]
                })
              ]
            }),

            // Footer 3-Columns: Terms (Left) | Bank & UPI QR (Center) | Signatory (Right)
            n.jsxs("div", {
              className: "grid grid-cols-3 p-3 text-left gap-3 items-stretch",
              style: { display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "10px", padding: "10px 12px", textAlign: "left", alignItems: "stretch" },
              children: [
                n.jsx("div", {
                  children: renderUbitTerms(comp.termsAndConditions || comp.customTerms || "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.", n)
                }),
                n.jsxs("div", {
                  className: "space-y-0.5",
                  style: { borderLeft: greyBorder, borderRight: greyBorder, padding: "0 8px" },
                  children: [
                    n.jsx("div", { style: { fontWeight: "800", color: redAccent, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }, children: "BANK DETAILS:" }),
                    n.jsxs("div", { children: ["Bank: ", n.jsx("strong", { children: bankName })] }),
                    n.jsxs("div", { children: ["A/C: ", bankAccNo] }),
                    n.jsxs("div", { children: ["IFSC: ", bankIfsc] }),
                    n.jsxs("div", { children: ["Branch: ", bankBranch] }),
                    typeof Mw !== "undefined" && bankUpi && n.jsxs("div", {
                      style: { display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" },
                      children: [
                        n.jsx(Mw, { value: upiQrPayload, size: 36, level: "M" }),
                        n.jsx("div", { style: { fontSize: "8px", fontWeight: "700" }, children: "Scan & Pay" })
                      ]
                    })
                  ]
                }),
                n.jsxs("div", {
                  className: "text-right flex flex-col justify-between",
                  style: { textAlign: "right", display: "flex", flexDirection: "column", justifyContent: "space-between" },
                  children: [
                    n.jsxs("div", {
                      children: [
                        n.jsxs("div", { style: { fontSize: "9px" }, children: ["For ", n.jsx("strong", { children: companyName })] }),
                        n.jsx("div", { style: { fontSize: "8.5px", color: "#64748b" }, children: "(Authorized Signatory)" })
                      ]
                    }),
                    n.jsx("div", {
                      style: { marginTop: "24px" },
                      children: comp.signatureUrl ? n.jsx("img", { src: comp.signatureUrl, alt: "Signature", style: { maxHeight: "36px", maxWidth: "90px", objectFit: "contain", marginLeft: "auto" } }) : n.jsx("div", { style: { borderBottom: greyBorder, width: "100px", marginLeft: "auto", marginBottom: "4px" } })
                    })
                  ]
                })
              ]
            })
          ]
        }),
        renderAckSlip(redAccent)
      ]
    });
  }

  // =========================================================================
  // DESIGN 4: EXECUTIVE DOUBLE-BORDER WITH CHAMPAGNE BANDS & SERIF (Image 3)
  // =========================================================================
  if (tpl === "gst_template_4") {
    const peachBar = "#fde2c7";
    const serifBorder = "1px solid #000000";

    return n.jsxs("div", {
      className: "printable-area p-4 sm:p-6 text-slate-900 printable-invoice-wrapper w-full leading-normal font-serif",
      style: { width: "100%", maxWidth: wrapperMaxWidth, margin: "0 auto", boxSizing: "border-box", background: "#ffffff", fontFamily: "Georgia, 'Times New Roman', serif" },
      children: [
        n.jsxs("div", {
          className: "ubit-invoice-outer-box ubit-doc-outer-box " + paperClass + "  bg-white overflow-hidden w-full text-[10px]",
          style: { border: "3px double #000000", boxSizing: "border-box", padding: "8px" },
          children: [
            // Centered Header & Band
            n.jsxs("div", {
              className: "text-center pb-2",
              style: { textAlign: "center", paddingBottom: "6px" },
              children: [
                n.jsx("div", { style: { fontWeight: "800", fontSize: "14px", textTransform: "uppercase" }, children: companyName }),
                n.jsx("div", { style: { fontSize: "10px", marginTop: "2px" }, children: companyAddress }),
                n.jsxs("div", { style: { fontSize: "10px", fontWeight: "700", marginTop: "2px" }, children: ["GSTIN : ", companyGstin, " | Contact : ", companyPhone] }),
                einvoiceVal ? renderUbitEInvoiceQR(einvoiceVal, n) : null
              ]
            }),

            // Horizontal Title Banner
            n.jsxs("div", {
              className: "flex justify-center items-center px-4 py-1.5 font-bold uppercase text-[12px] my-1 relative",
              style: { display: "flex", justifyContent: "center", alignItems: "center", position: "relative", background: peachBar, borderTop: serifBorder, borderBottom: serifBorder, padding: "4px 12px", margin: "4px 0", fontWeight: "900" },
              children: [
                n.jsx("div", { style: { fontSize: "16px", fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }, children: docTitle }),
                copyLabel && n.jsx("div", { style: { position: "absolute", right: "12px", fontSize: "10px" }, children: copyLabel })
              ]
            }),

            // 2-Column Metadata Grid: Metadata Left vs Bill To & Balance Due Right
            n.jsxs("div", {
              className: "grid grid-cols-2 border border-black text-left text-[10px] my-1",
              style: { display: "grid", gridTemplateColumns: "1fr 1fr", border: serifBorder, textAlign: "left", margin: "4px 0" },
              children: [
                // Metadata Table Left
                n.jsxs("div", {
                  style: { borderRight: serifBorder, padding: "6px 8px" },
                  children: [
                    n.jsxs("div", { className: "flex justify-between border-b border-black pb-1 mb-1", style: { display: "flex", justifyContent: "space-between", borderBottom: serifBorder, paddingBottom: "3px", marginBottom: "3px" }, children: [n.jsx("span", { children: "Invoice No :" }), n.jsx("strong", { children: invoiceNo })] }),
                    n.jsxs("div", { className: "flex justify-between border-b border-black pb-1 mb-1", style: { display: "flex", justifyContent: "space-between", borderBottom: serifBorder, paddingBottom: "3px", marginBottom: "3px" }, children: [n.jsx("span", { children: "Invoice Date :" }), n.jsx("strong", { children: invDate })] }),
                    dueDate && n.jsxs("div", { className: "flex justify-between border-b border-black pb-1 mb-1", style: { display: "flex", justifyContent: "space-between", borderBottom: serifBorder, paddingBottom: "3px", marginBottom: "3px" }, children: [n.jsx("span", { children: "Due Date :" }), n.jsx("strong", { children: dueDate })] }),
                    marketingStaff && n.jsxs("div", { className: "flex justify-between border-b border-black pb-1 mb-1", style: { display: "flex", justifyContent: "space-between", borderBottom: serifBorder, paddingBottom: "3px", marginBottom: "3px" }, children: [n.jsx("span", { children: "Marketing Staff :" }), n.jsx("strong", { children: marketingStaff })] }),
                    ewayBillNo && n.jsxs("div", { className: "flex justify-between border-b border-black pb-1 mb-1", style: { display: "flex", justifyContent: "space-between", borderBottom: serifBorder, paddingBottom: "3px", marginBottom: "3px" }, children: [n.jsx("span", { children: "E-Way Bill No :" }), n.jsx("strong", { children: ewayBillNo })] }),
                    n.jsxs("div", { className: "flex justify-between", style: { display: "flex", justifyContent: "space-between" }, children: [n.jsx("span", { children: "State / Place of Supply :" }), n.jsx("strong", { children: companyState })] })
                  ]
                }),
                // Bill To & Balance Due Right
                n.jsxs("div", {
                  style: { padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between" },
                  children: [
                    n.jsxs("div", {
                      children: [
                        n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }, children: isSaleOrderDoc ? "ORDER TO:" : "BILLED TO:" }),
                        n.jsx("div", { style: { fontWeight: "800", fontSize: "12px" }, children: partyName }),
                        partyAddress && n.jsx("div", { children: partyAddress }),
                        partyGstin && n.jsxs("div", { children: ["GSTIN: ", n.jsx("strong", { children: partyGstin })] }),
                        partyPhone && n.jsxs("div", { children: ["Ph: ", partyPhone] }),
                        shippingAddress && n.jsxs("div", { style: { marginTop: "3px", paddingTop: "2px", borderTop: "1px dashed #cbd5e1" }, children: ["Ship To: ", shippingAddress] })
                      ]
                    }),
                    n.jsxs("div", {
                      style: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: serifBorder, paddingTop: "4px", marginTop: "4px", background: peachBar, padding: "3px 6px" },
                      children: [
                        n.jsx("span", { style: { fontWeight: "800", textTransform: "uppercase", fontSize: "9px", letterSpacing: "0.05em" }, children: "BALANCE DUE:" }),
                        n.jsxs("strong", { style: { fontSize: "12px", fontFamily: "monospace" }, children: ["₹ ", balanceDueVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })] })
                      ]
                    })
                  ]
                })
              ]
            }),

            // Items Table with Peach Header
            n.jsxs("table", {
              className: "w-full border-collapse text-left",
              style: { width: "100%", borderCollapse: "collapse", border: serifBorder, textAlign: "left", margin: "4px 0" },
              children: [
                n.jsx("thead", {
                  children: n.jsxs("tr", {
                    style: { background: peachBar, borderBottom: serifBorder, fontWeight: "700", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.03em" },
                    children: [
                      n.jsx("th", { style: { borderRight: serifBorder, padding: "4px", width: "32px", textAlign: "center" }, children: "S.No" }),
                      n.jsx("th", { style: { borderRight: serifBorder, padding: "4px" }, children: "Item Description" }),
                      hasHsnData && n.jsx("th", { style: { borderRight: serifBorder, padding: "4px", width: "65px", textAlign: "center" }, children: "HSN/SAC" }),
                      hasBatchData && n.jsx("th", { style: { borderRight: serifBorder, padding: "4px", width: "65px", textAlign: "center" }, children: "Batch No" }),
                      hasMrpData && n.jsx("th", { style: { borderRight: serifBorder, padding: "4px", width: "65px", textAlign: "right" }, children: "MRP" }),
                      n.jsx("th", { style: { borderRight: serifBorder, padding: "4px", width: "45px", textAlign: "right" }, children: "Qty" }),
                      n.jsx("th", { style: { borderRight: serifBorder, padding: "4px", width: "70px", textAlign: "right" }, children: "Rate" }),
                      n.jsx("th", { style: { borderRight: serifBorder, padding: "4px", width: "55px", textAlign: "right" }, children: "GST %" }),
                      n.jsx("th", { style: { padding: "4px", width: "85px", textAlign: "right" }, children: "Amount" })
                    ]
                  })
                }),
                n.jsx("tbody", {
                  children: items.map((it, idx) => {
                    const q = Number(it.qty || it.quantity || 1);
                    const p = Number(it.price || it.rate || 0);
                    const r = Number(it.gstRate || it.gst || it.tax || 0);
                    const tot = Number(it.total || it.amount || (q * p * (1 + r / 100)));
                    return n.jsxs("tr", {
                      style: { borderBottom: serifBorder },
                      children: [
                        n.jsx("td", { style: { borderRight: serifBorder, padding: "4px", textAlign: "center" }, children: idx + 1 }),
                        n.jsx("td", { style: { borderRight: serifBorder, padding: "4px", fontWeight: "600" }, children: it.name || it.itemName }),
                        hasHsnData && n.jsx("td", { style: { borderRight: serifBorder, padding: "4px", textAlign: "center" }, children: it.hsn || "-" }),
                        hasBatchData && n.jsx("td", { style: { borderRight: serifBorder, padding: "4px", textAlign: "center" }, children: it.batchNo || it.batch || "-" }),
                        hasMrpData && n.jsx("td", { style: { borderRight: serifBorder, padding: "4px", textAlign: "right" }, children: Number(it.mrp || 0).toFixed(2) }),
                        n.jsx("td", { style: { borderRight: serifBorder, padding: "4px", textAlign: "right" }, children: q }),
                        n.jsx("td", { style: { borderRight: serifBorder, padding: "4px", textAlign: "right" }, children: p.toFixed(2) }),
                        n.jsx("td", { style: { borderRight: serifBorder, padding: "4px", textAlign: "right" }, children: r + "%" }),
                        n.jsx("td", { style: { padding: "4px", textAlign: "right", fontWeight: "700" }, children: tot.toFixed(2) })
                      ]
                    }, idx);
                  })
                }),
                n.jsx("tfoot", {
                  children: n.jsxs("tr", {
                    style: { background: peachBar, borderTop: serifBorder, fontWeight: "800" },
                    children: [
                      n.jsx("td", { colSpan: 2 + (hasHsnData ? 1 : 0) + (hasBatchData ? 1 : 0) + (hasMrpData ? 1 : 0), style: { borderRight: serifBorder, padding: "4px", textAlign: "right" }, children: "Total:" }),
                      n.jsx("td", { style: { borderRight: serifBorder, padding: "4px", textAlign: "right" }, children: totalQty }),
                      n.jsx("td", { colSpan: 2, style: { borderRight: serifBorder, padding: "4px", textAlign: "right" }, children: "Tax: " + taxTotal.toFixed(2) }),
                      n.jsx("td", { style: { padding: "4px", textAlign: "right" }, children: cleanGrandTotal.toFixed(2) })
                    ]
                  })
                })
              ]
            }),

            // Amount in Words
            n.jsxs("div", {
              className: "p-1.5 border border-black text-left font-semibold my-1",
              style: { border: serifBorder, padding: "4px 8px", textAlign: "left", margin: "4px 0" },
              children: [
                n.jsxs("div", { children: ["Amount in words : ", n.jsx("strong", { children: totalInWords })] })
              ]
            }),

            // Bank details, Terms & Certified Statement
            n.jsxs("div", {
              className: "grid grid-cols-2 border border-black text-left text-[9.5px] my-1 items-stretch",
              style: { display: "grid", gridTemplateColumns: "1.2fr 1fr", border: serifBorder, textAlign: "left", margin: "4px 0", alignItems: "stretch" },
              children: [
                n.jsxs("div", {
                  style: { borderRight: serifBorder, padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between" },
                  children: [
                    n.jsxs("div", {
                      children: [
                        n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }, children: "BANK DETAILS:" }),
                        n.jsxs("div", { children: ["Bank Name : ", bankName] }),
                        n.jsxs("div", { children: ["Account No : ", bankAccNo] }),
                        n.jsxs("div", { children: ["IFSC Code : ", bankIfsc] }),
                        n.jsxs("div", { children: ["Branch : ", bankBranch] })
                      ]
                    }),
                    n.jsx("div", {
                      style: { marginTop: "6px", paddingTop: "4px", borderTop: "1px dashed #000000" },
                      children: renderUbitTerms(comp.termsAndConditions || comp.customTerms || "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.", n)
                    })
                  ]
                }),
                n.jsxs("div", {
                  style: { padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "right" },
                  children: [
                    n.jsxs("div", {
                      children: [
                        n.jsxs("div", { style: { fontSize: "9px" }, children: ["Certified that the particulars given above are true and correct for ", n.jsx("strong", { children: companyName })] }),
                        typeof Mw !== "undefined" && bankUpi && n.jsxs("div", {
                          style: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", marginTop: "4px" },
                          children: [
                            n.jsx(Mw, { value: upiQrPayload, size: 40, level: "M" }),
                            n.jsx("div", { style: { fontSize: "8px", fontWeight: "700" }, children: "UPI QR" })
                          ]
                        })
                      ]
                    }),
                    n.jsxs("div", {
                      style: { marginTop: "20px" },
                      children: [
                        comp.signatureUrl ? n.jsx("img", { src: comp.signatureUrl, alt: "Signature", style: { maxHeight: "36px", maxWidth: "90px", objectFit: "contain", marginLeft: "auto" } }) : n.jsx("div", { style: { borderBottom: serifBorder, width: "110px", marginLeft: "auto", marginBottom: "4px" } }),
                        n.jsx("div", { style: { fontWeight: "700", fontSize: "9px" }, children: "Authorised Signatory" })
                      ]
                    })
                  ]
                })
              ]
            }),

            // Bottom Computer Generated Note
            n.jsx("div", {
              className: "text-center py-1 text-[9px] uppercase tracking-wider font-semibold",
              style: { textAlign: "center", padding: "3px 0", background: peachBar, border: serifBorder, margin: "4px 0 0 0" },
              children: "Computer Generated Invoice - No Signature Required If Digitally Transmitted"
            })
          ]
        }),
        renderAckSlip("#000000")
      ]
    });
  }

  // =========================================================================
  // DESIGN 5: INDUSTRIAL TEAL BANNER, CUSTOMER META & UPI QR (Image 4)
  // (All Transport details completely removed)
  // =========================================================================
  if (tpl === "gst_template_5") {
    const tealBanner = "#0891b2";
    const darkBorder = "1px solid #000000";

    return n.jsxs("div", {
      className: "printable-area p-4 sm:p-6 text-slate-800 printable-invoice-wrapper w-full leading-normal",
      style: { width: "100%", maxWidth: wrapperMaxWidth, margin: "0 auto", boxSizing: "border-box", background: "#ffffff" },
      children: [
        n.jsxs("div", {
          className: "ubit-invoice-outer-box ubit-doc-outer-box " + paperClass + "  bg-white overflow-hidden w-full text-[10px]",
          style: { border: "1.5px solid #000000", color: "#000000", boxSizing: "border-box" },
          children: [
            // Company Industrial Header
            n.jsxs("div", {
              className: "p-3 pb-2 text-left",
              style: { padding: "8px 12px 4px 12px", textAlign: "left" },
              children: [
                n.jsx("div", { style: { fontWeight: "800", fontSize: "14px", color: "#0f172a", textTransform: "uppercase" }, children: companyName }),
                n.jsx("div", {
                  className: "text-white font-bold text-[10px] px-3 py-1 my-1.5 rounded-sm inline-block w-full text-center",
                  style: { background: tealBanner, color: "#ffffff", padding: "3px 10px", margin: "4px 0", fontWeight: "700", textAlign: "center", borderRadius: "2px" },
                  children: comp.customTitle || "TAX INVOICE"
                }),
                n.jsxs("div", {
                  className: "flex justify-between items-start text-[9.5px] text-slate-600 pt-1",
                  style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingTop: "2px" },
                  children: [
                    n.jsxs("div", { children: [n.jsx("div", { children: companyAddress }), n.jsxs("div", { children: ["State: ", companyState] })] }),
                    n.jsxs("div", { className: "text-right", style: { textAlign: "right" }, children: [n.jsxs("div", { children: ["Tel : ", companyPhone] }), n.jsxs("div", { children: ["Email : ", companyEmail] })] })
                  ]
                })
              ]
            }),

            // Document Title Strip: PAN | TAX INVOICE | ORIGINAL FOR RECIPIENT
            n.jsxs("div", {
              className: "flex justify-between items-center px-3 py-1 border-y border-black font-bold text-[11px] bg-slate-50",
              style: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: darkBorder, borderBottom: darkBorder, padding: "3px 10px", background: "#f8fafc" },
              children: [
                n.jsxs("div", { children: ["PAN : ", companyPan] }),
                n.jsx("div", { style: { fontWeight: "900", fontSize: "13px", textTransform: "uppercase" }, children: docTitle }),
                n.jsx("div", { style: { fontSize: "9px", color: "#475569" }, children: copyLabel })
              ]
            }),

            // Top Meta Section: Customer Detail (Left) | E-Invoice QR (Center) | Bill Metadata (Right)
            // (Strictly NO Transport Details)
            n.jsxs("div", {
              className: "grid grid-cols-12 border-b border-black text-left text-[10px]",
              style: { display: "grid", gridTemplateColumns: einvoiceVal ? "5fr 3fr 4fr" : "7fr 5fr", borderBottom: darkBorder, textAlign: "left", alignItems: "stretch" },
              children: [
                // Customer Details Left
                n.jsxs("div", {
                  className: "p-2.5 border-r border-black space-y-1",
                  style: { padding: "6px 10px", borderRight: darkBorder },
                  children: [
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }, children: isSaleOrderDoc ? "ORDER TO:" : "BILLED TO:" }),
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "12px" }, children: partyName }),
                    partyAddress && n.jsxs("div", { children: ["Address : ", partyAddress] }),
                    partyPhone && n.jsxs("div", { children: ["Phone : ", partyPhone] }),
                    n.jsxs("div", { children: ["GSTIN : ", n.jsx("strong", { children: partyGstin })] }),
                    n.jsxs("div", { children: ["Place of Supply : ", partyPlaceOfSupply] }),
                    shippingAddress && n.jsxs("div", { style: { marginTop: "2px", paddingTop: "2px", borderTop: "1px dashed #cbd5e1" }, children: ["Ship To: ", shippingAddress] })
                  ]
                }),
                // E-Invoice QR Center
                n.jsx("div", {
                  style: { borderRight: darkBorder, padding: "6px 8px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
                  children: renderUbitEInvoiceQR(einvoiceVal, n)
                }),
                // Bill Metadata Table Right + Balance Due
                n.jsxs("div", {
                  style: { padding: "0", display: "flex", flexDirection: "column", justifyContent: "space-between" },
                  children: [
                    renderUbitHeaderBillDetailsTable(inv, vr, n, tealBanner),
                    n.jsxs("div", {
                      style: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: darkBorder, padding: "4px 8px", background: "#f0fdfa" },
                      children: [
                        n.jsx("span", { style: { fontWeight: "800", textTransform: "uppercase", fontSize: "9px", letterSpacing: "0.05em", color: tealBanner }, children: "BALANCE DUE:" }),
                        n.jsxs("strong", { style: { fontSize: "12px", fontFamily: "monospace", color: "#0f766e" }, children: ["₹ ", balanceDueVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })] })
                      ]
                    })
                  ]
                })
              ]
            }),

            // Items Table
            n.jsxs("table", {
              className: "w-full border-collapse text-left",
              style: { width: "100%", borderCollapse: "collapse", borderBottom: darkBorder, textAlign: "left" },
              children: [
                n.jsx("thead", {
                  children: n.jsxs("tr", {
                    style: { background: "#f8fafc", borderBottom: darkBorder, fontWeight: "700", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.03em" },
                    children: [
                      n.jsx("th", { style: { borderRight: darkBorder, padding: "4px", width: "32px", textAlign: "center" }, children: "Sr. No." }),
                      n.jsx("th", { style: { borderRight: darkBorder, padding: "4px" }, children: "Name of Product / Service" }),
                      hasHsnData && n.jsx("th", { style: { borderRight: darkBorder, padding: "4px", width: "65px", textAlign: "center" }, children: "HSN / SAC" }),
                      hasBatchData && n.jsx("th", { style: { borderRight: darkBorder, padding: "4px", width: "65px", textAlign: "center" }, children: "Batch No" }),
                      hasMrpData && n.jsx("th", { style: { borderRight: darkBorder, padding: "4px", width: "65px", textAlign: "right" }, children: "MRP" }),
                      n.jsx("th", { style: { borderRight: darkBorder, padding: "4px", width: "50px", textAlign: "center" }, children: "Qty" }),
                      n.jsx("th", { style: { borderRight: darkBorder, padding: "4px", width: "65px", textAlign: "right" }, children: "Rate" }),
                      n.jsx("th", { style: { borderRight: darkBorder, padding: "4px", width: "75px", textAlign: "right" }, children: "Taxable Value" }),
                      n.jsx("th", { style: { borderRight: darkBorder, padding: "4px", width: "65px", textAlign: "right" }, children: "GST Tax" }),
                      n.jsx("th", { style: { padding: "4px", width: "80px", textAlign: "right" }, children: "Total" })
                    ]
                  })
                }),
                n.jsx("tbody", {
                  children: items.map((it, idx) => {
                    const q = Number(it.qty || it.quantity || 1);
                    const p = Number(it.price || it.rate || 0);
                    const r = Number(it.gstRate || it.gst || it.tax || 0);
                    const taxable = q * p;
                    const itTot = Number(it.total || it.amount || (taxable * (1 + r / 100)));
                    const taxAmt = Math.max(0, itTot - taxable);
                    return n.jsxs("tr", {
                      style: { borderBottom: darkBorder },
                      children: [
                        n.jsx("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "center" }, children: idx + 1 }),
                        n.jsx("td", { style: { borderRight: darkBorder, padding: "4px", fontWeight: "600" }, children: it.name || it.itemName }),
                        hasHsnData && n.jsx("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "center" }, children: it.hsn || "-" }),
                        hasBatchData && n.jsx("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "center" }, children: it.batchNo || it.batch || "-" }),
                        hasMrpData && n.jsx("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "right" }, children: Number(it.mrp || 0).toFixed(2) }),
                        n.jsxs("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "center" }, children: [q, " NOS"] }),
                        n.jsx("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "right" }, children: p.toFixed(2) }),
                        n.jsx("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "right" }, children: taxable.toFixed(2) }),
                        n.jsxs("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "right" }, children: [taxAmt.toFixed(2), " (", r, "%)"] }),
                        n.jsx("td", { style: { padding: "4px", textAlign: "right", fontWeight: "700" }, children: itTot.toFixed(2) })
                      ]
                    }, idx);
                  })
                }),
                n.jsx("tfoot", {
                  children: n.jsxs("tr", {
                    style: { background: "#f8fafc", borderTop: "2px solid #000000", fontWeight: "800" },
                    children: [
                      n.jsx("td", { colSpan: 2 + (hasHsnData ? 1 : 0) + (hasBatchData ? 1 : 0) + (hasMrpData ? 1 : 0), style: { borderRight: darkBorder, padding: "4px", textAlign: "left" }, children: "Total" }),
                      n.jsxs("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "center" }, children: [totalQty, " NOS"] }),
                      n.jsx("td", { style: { borderRight: darkBorder, padding: "4px" } }),
                      n.jsx("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "right" }, children: subTotal.toFixed(2) }),
                      n.jsx("td", { style: { borderRight: darkBorder, padding: "4px", textAlign: "right" }, children: taxTotal.toFixed(2) }),
                      n.jsx("td", { style: { padding: "4px", textAlign: "right" }, children: cleanGrandTotal.toFixed(2) })
                    ]
                  })
                })
              ]
            }),

            // Summary Grid: Words Left vs Calculation Table Right
            n.jsxs("div", {
              className: "grid grid-cols-12 border-b border-black text-left",
              style: { display: "grid", gridTemplateColumns: "7fr 5fr", borderBottom: darkBorder, textAlign: "left" },
              children: [
                n.jsxs("div", {
                  className: "p-2 space-y-1 border-r border-black flex flex-col justify-center",
                  style: { padding: "6px 10px", borderRight: darkBorder },
                  children: [
                    n.jsx("div", { style: { textDecoration: "underline", fontWeight: "700" }, children: "Total in words" }),
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "11px" }, children: totalInWords })
                  ]
                }),
                n.jsxs("div", {
                  className: "p-2 font-mono text-[9.5px]",
                  style: { padding: "4px 8px" },
                  children: [
                    n.jsxs("div", { className: "flex justify-between py-0.5", children: [n.jsx("span", { children: "Taxable Amount" }), n.jsx("strong", { children: subTotal.toFixed(2) })] }),
                    n.jsxs("div", { className: "flex justify-between py-0.5", children: [n.jsx("span", { children: "Total Tax" }), n.jsx("strong", { children: taxTotal.toFixed(2) })] }),
                    n.jsxs("div", { className: "flex justify-between py-0.5 border-t border-black font-bold text-[10px]", style: { borderTop: darkBorder, paddingTop: "2px" }, children: [n.jsx("span", { children: "Total Amount After Tax" }), n.jsxs("strong", { children: ["₹ ", cleanGrandTotal.toFixed(2)] })] })
                  ]
                })
              ]
            }),

            // Footer: Bank Details & UPI QR (Left) vs Signatory (Right)
            n.jsxs("div", {
              className: "grid grid-cols-12 border-b border-black text-left items-stretch",
              style: { display: "grid", gridTemplateColumns: "7fr 5fr", borderBottom: darkBorder, textAlign: "left", alignItems: "stretch" },
              children: [
                n.jsxs("div", {
                  className: "p-2 border-r border-black space-y-1 text-[9.5px]",
                  style: { padding: "6px 10px", borderRight: darkBorder },
                  children: [
                    n.jsx("div", { className: "text-center font-bold border-b pb-0.5 mb-1", style: { textAlign: "center", borderBottom: "1px dashed #cbd5e1", fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", paddingBottom: "2px" }, children: "BANK DETAILS:" }),
                    n.jsxs("div", {
                      style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
                      children: [
                        n.jsxs("div", {
                          children: [
                            n.jsxs("div", { children: ["Name : ", bankName] }),
                            n.jsxs("div", { children: ["Branch : ", bankBranch] }),
                            n.jsxs("div", { children: ["Acc. Number : ", bankAccNo] }),
                            n.jsxs("div", { children: ["IFSC : ", bankIfsc] })
                          ]
                        }),
                        typeof Mw !== "undefined" && bankUpi && n.jsxs("div", {
                          style: { textAlign: "center", shrink: 0, padding: "2px" },
                          children: [
                            n.jsx(Mw, { value: upiQrPayload, size: 48, level: "M" }),
                            n.jsx("div", { style: { fontSize: "7.5px", fontWeight: "700" }, children: "Pay using UPI" })
                          ]
                        })
                      ]
                    }),
                    n.jsx("div", {
                      style: { borderTop: "1px dashed #cbd5e1", paddingTop: "4px", marginTop: "4px" },
                      children: renderUbitTerms(comp.termsAndConditions || comp.customTerms || "1. Goods once sold will not be taken back.\n2. Payment due within credit terms.", n)
                    }),
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", paddingTop: "4px" }, children: "Customer Signature" })
                  ]
                }),
                n.jsxs("div", {
                  className: "p-2 flex flex-col justify-between text-right text-[9.5px]",
                  style: { padding: "6px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "right" },
                  children: [
                    n.jsxs("div", {
                      children: [
                        n.jsx("div", { style: { fontSize: "8.5px", color: "#64748b" }, children: "(E & O.E.)" }),
                        n.jsx("div", { style: { fontSize: "8.5px", marginTop: "4px" }, children: "Certified that the particulars given above are true and correct." }),
                        n.jsxs("div", { style: { fontWeight: "800", marginTop: "6px" }, children: ["For ", companyName] })
                      ]
                    }),
                    n.jsxs("div", {
                      style: { marginTop: "20px" },
                      children: [
                        comp.signatureUrl ? n.jsx("img", { src: comp.signatureUrl, alt: "Signature", style: { maxHeight: "36px", maxWidth: "90px", objectFit: "contain", marginLeft: "auto" } }) : null,
                        n.jsx("div", { style: { fontSize: "8px", fontStyle: "italic", color: "#64748b" }, children: "This is a computer generated invoice no signature required." }),
                        n.jsx("div", { style: { fontWeight: "800", marginTop: "4px" }, children: "Authorised Signatory" })
                      ]
                    })
                  ]
                })
              ]
            }),

            // Industrial Footer Strip
            n.jsx("div", {
              className: "text-center py-1 font-semibold text-[9.5px] bg-slate-50",
              style: { textAlign: "center", padding: "3px 0", background: "#f8fafc" },
              children: "Thank you for shopping with us!"
            })
          ]
        }),
        renderAckSlip(tealBanner)
      ]
    });
  }

  // =========================================================================
  // DESIGN 6: MODERN ROYAL PURPLE MINIMALIST CARD (Image 5)
  // =========================================================================
  if (tpl === "gst_template_6") {
    const purple = "#5844a4";
    const lightPurple = "#f5f3ff";
    const purpleBorder = "1px solid #ddd6fe";

    return n.jsxs("div", {
      className: "printable-area p-4 sm:p-6 text-slate-800 printable-invoice-wrapper w-full leading-normal",
      style: { width: "100%", maxWidth: wrapperMaxWidth, margin: "0 auto", boxSizing: "border-box", background: "#ffffff" },
      children: [
        n.jsxs("div", {
          className: "ubit-invoice-outer-box ubit-doc-outer-box " + paperClass + "  bg-white overflow-hidden w-full text-[10px]",
          style: { border: "1.5px solid #5844a4", color: "#000000", boxSizing: "border-box" },
          children: [
            // Header: Solid Purple Pill Badge Left vs Copy Badge Right
            n.jsxs("div", {
              className: "p-3 pb-2 text-left",
              style: { padding: "10px 14px 6px 14px", textAlign: "left" },
              children: [
                n.jsxs("div", {
                  style: { display: "flex", justifyContent: "center", alignItems: "center", position: "relative", marginBottom: "8px" },
                  children: [
                    n.jsx("div", {
                      className: "inline-block px-3 py-1 bg-purple-700 text-white font-black text-xs uppercase tracking-wider rounded-md",
                      style: { background: purple, color: "#ffffff", padding: "4px 12px", fontWeight: "900", fontSize: "16px", textTransform: "uppercase", letterSpacing: "0.05em", borderRadius: "6px" },
                      children: docTitle
                    }),
                    copyLabel && n.jsx("div", { style: { position: "absolute", right: "0px", fontWeight: "700", fontSize: "9.5px", color: "#6b7280", textTransform: "uppercase" }, children: copyLabel })
                  ]
                }),
                // 3-Column Top Section: Company Left | E-Invoice QR Center | Metadata Right
                n.jsxs("div", {
                  style: { display: "grid", gridTemplateColumns: einvoiceVal ? "5fr 3fr 4fr" : "7fr 5fr", gap: "10px", alignItems: "stretch", paddingTop: "4px" },
                  children: [
                    n.jsxs("div", {
                      children: [
                        comp.logoUrl && n.jsx("img", { src: comp.logoUrl, alt: "Logo", style: { maxHeight: "36px", maxWidth: "110px", objectFit: "contain", marginBottom: "2px" } }),
                        n.jsx("div", { style: { fontWeight: "800", fontSize: "14px", color: purple, textTransform: "uppercase" }, children: companyName }),
                        comp.phone && n.jsxs("div", { style: { color: "#4b5563" }, children: ["Phone: ", companyPhone] }),
                        comp.email && n.jsxs("div", { style: { color: "#4b5563" }, children: ["Email: ", companyEmail] }),
                        comp.gstin && n.jsxs("div", { style: { color: "#4b5563", fontFamily: "monospace", fontWeight: "700" }, children: ["GSTIN: ", companyGstin] })
                      ]
                    }),
                    n.jsx("div", {
                      style: { textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
                      children: renderUbitEInvoiceQR(einvoiceVal, n)
                    }),
                    n.jsx("div", {
                      children: renderUbitHeaderBillDetailsTable(inv, vr, n, purple)
                    })
                  ]
                })
              ]
            }),

            // Horizontal Purple Divider
            n.jsx("div", { style: { height: "2px", background: purple, margin: "4px 0" } }),

            // Party Details: Bill To (Left) | Shipping Address (Middle) | Balance Due (Right Corner)
            n.jsxs("div", {
              className: "p-3 pt-2 text-left",
              style: { padding: "6px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", textAlign: "left" },
              children: [
                n.jsxs("div", {
                  style: { flex: "1 1 0%" },
                  children: [
                    n.jsx("div", { style: { color: purple, fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em" }, children: isSaleOrderDoc ? "ORDER TO:" : "BILLED TO:" }),
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "12px" }, children: partyName }),
                    partyAddress && n.jsx("div", { style: { color: "#4b5563" }, children: partyAddress }),
                    partyPhone && n.jsxs("div", { style: { color: "#4b5563" }, children: ["Phone: ", partyPhone] }),
                    partyGstin && n.jsxs("div", { style: { color: "#4b5563" }, children: ["GSTIN: ", partyGstin] })
                  ]
                }),
                shippingAddress && n.jsxs("div", {
                  style: { flex: "1 1 0%", borderLeft: "1px dashed #ddd6fe", paddingLeft: "10px" },
                  children: [
                    n.jsx("div", { style: { color: purple, fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "SHIPPED TO:" }),
                    n.jsx("div", { style: { color: "#4b5563" }, children: shippingAddress })
                  ]
                }),
                n.jsxs("div", {
                  style: { textAlign: "right", shrink: 0, minWidth: "120px", background: lightPurple, padding: "6px 10px", borderRadius: "6px", border: purpleBorder },
                  children: [
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", color: purple, textTransform: "uppercase", letterSpacing: "0.05em" }, children: "BALANCE DUE:" }),
                    n.jsxs("div", { style: { fontWeight: "900", fontSize: "14px", fontFamily: "monospace", color: purple, marginTop: "2px" }, children: ["₹ ", balanceDueVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })] })
                  ]
                })
              ]
            }),

            // Items Table with Solid Purple Header
            n.jsxs("table", {
              className: "w-full border-collapse text-left",
              style: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
              children: [
                n.jsx("thead", {
                  children: n.jsxs("tr", {
                    style: { background: lightPurple, borderTop: purpleBorder, borderBottom: purpleBorder, color: "#1f2937", fontWeight: "700", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.03em" },
                    children: [
                      n.jsx("th", { style: { borderRight: purpleBorder, padding: "5px 6px", width: "28px", textAlign: "center" }, children: "#" }),
                      n.jsx("th", { style: { borderRight: purpleBorder, padding: "5px 6px" }, children: "Item name" }),
                      hasHsnData && n.jsx("th", { style: { borderRight: purpleBorder, padding: "5px 6px", width: "65px", textAlign: "center" }, children: "HSN/SAC" }),
                      hasBatchData && n.jsx("th", { style: { borderRight: purpleBorder, padding: "5px 6px", width: "65px", textAlign: "center" }, children: "Batch No" }),
                      hasMrpData && n.jsx("th", { style: { borderRight: purpleBorder, padding: "5px 6px", width: "65px", textAlign: "right" }, children: "MRP" }),
                      n.jsx("th", { style: { borderRight: purpleBorder, padding: "5px 6px", width: "50px", textAlign: "center" }, children: "Quantity" }),
                      n.jsx("th", { style: { borderRight: purpleBorder, padding: "5px 6px", width: "40px", textAlign: "center" }, children: "Unit" }),
                      n.jsx("th", { style: { borderRight: purpleBorder, padding: "5px 6px", width: "65px", textAlign: "right" }, children: "Price/Unit" }),
                      n.jsx("th", { style: { borderRight: purpleBorder, padding: "5px 6px", width: "55px", textAlign: "right" }, children: "GST" }),
                      n.jsx("th", { style: { padding: "5px 6px", width: "80px", textAlign: "right" }, children: "Amount" })
                    ]
                  })
                }),
                n.jsx("tbody", {
                  children: items.map((it, idx) => {
                    const q = Number(it.qty || it.quantity || 1);
                    const p = Number(it.price || it.rate || 0);
                    const r = Number(it.gstRate || it.gst || it.tax || 0);
                    const taxable = q * p;
                    const itTot = Number(it.total || it.amount || (taxable * (1 + r / 100)));
                    const taxAmt = Math.max(0, itTot - taxable);
                    return n.jsxs("tr", {
                      style: { borderBottom: purpleBorder },
                      children: [
                        n.jsx("td", { style: { borderRight: purpleBorder, padding: "5px 6px", textAlign: "center" }, children: idx + 1 }),
                        n.jsx("td", { style: { borderRight: purpleBorder, padding: "5px 6px", fontWeight: "600" }, children: it.name || it.itemName }),
                        hasHsnData && n.jsx("td", { style: { borderRight: purpleBorder, padding: "5px 6px", textAlign: "center" }, children: it.hsn || "-" }),
                        hasBatchData && n.jsx("td", { style: { borderRight: purpleBorder, padding: "5px 6px", textAlign: "center" }, children: it.batchNo || it.batch || "-" }),
                        hasMrpData && n.jsx("td", { style: { borderRight: purpleBorder, padding: "5px 6px", textAlign: "right" }, children: Number(it.mrp || 0).toFixed(2) }),
                        n.jsx("td", { style: { borderRight: purpleBorder, padding: "5px 6px", textAlign: "center", fontWeight: "700" }, children: q }),
                        n.jsx("td", { style: { borderRight: purpleBorder, padding: "5px 6px", textAlign: "center" }, children: "Pcs" }),
                        n.jsxs("td", { style: { borderRight: purpleBorder, padding: "5px 6px", textAlign: "right" }, children: ["₹ ", p.toFixed(2)] }),
                        n.jsxs("td", { style: { borderRight: purpleBorder, padding: "5px 6px", textAlign: "right" }, children: ["₹ ", taxAmt.toFixed(1), " (", r, "%)"] }),
                        n.jsxs("td", { style: { padding: "5px 6px", textAlign: "right", fontWeight: "700" }, children: ["₹ ", itTot.toFixed(2)] })
                      ]
                    }, idx);
                  })
                }),
                // Total bar in purple
                n.jsx("tfoot", {
                  children: n.jsxs("tr", {
                    style: { background: purple, color: "#ffffff", fontWeight: "800" },
                    children: [
                      n.jsx("td", { colSpan: 2 + (hasHsnData ? 1 : 0) + (hasBatchData ? 1 : 0) + (hasMrpData ? 1 : 0), style: { padding: "5px 6px" }, children: "Total" }),
                      n.jsx("td", { style: { padding: "5px 6px", textAlign: "center" }, children: totalQty }),
                      n.jsx("td", { style: { padding: "5px 6px" } }),
                      n.jsx("td", { style: { padding: "5px 6px" } }),
                      n.jsxs("td", { style: { padding: "5px 6px", textAlign: "right" }, children: ["₹ ", taxTotal.toFixed(1)] }),
                      n.jsxs("td", { style: { padding: "5px 6px", textAlign: "right" }, children: ["₹ ", cleanGrandTotal.toFixed(2)] })
                    ]
                  })
                })
              ]
            }),

            // Split Lower Section: Words & Terms Left vs Calculation Sidebar Right
            n.jsxs("div", {
              className: "grid grid-cols-12 text-left",
              style: { display: "grid", gridTemplateColumns: "7fr 5fr", textAlign: "left", alignItems: "stretch" },
              children: [
                n.jsxs("div", {
                  className: "p-3 space-y-3",
                  style: { padding: "10px 14px", display: "flex", flexDirection: "column", justifyContent: "space-between" },
                  children: [
                    n.jsxs("div", {
                      children: [
                        n.jsx("div", { style: { color: purple, fontWeight: "700", fontSize: "9px" }, children: "Invoice Amount In Words" }),
                        n.jsx("div", { style: { fontWeight: "800", fontSize: "11px", marginTop: "2px" }, children: totalInWords }),
                        n.jsxs("div", {
                          style: { marginTop: "10px" },
                          children: [
                            renderUbitTerms(comp.termsAndConditions || comp.customTerms || "1. Goods once sold will not be taken back.\n2. Payment due within credit terms.", n)
                          ]
                        })
                      ]
                    }),
                    n.jsxs("div", {
                      style: { marginTop: "16px" },
                      children: [
                        n.jsxs("div", { style: { fontSize: "9px" }, children: ["For : ", n.jsx("strong", { children: companyName })] }),
                        n.jsx("div", {
                          style: { marginTop: "20px" },
                          children: comp.signatureUrl ? n.jsx("img", { src: comp.signatureUrl, alt: "Signature", style: { maxHeight: "36px", maxWidth: "90px", objectFit: "contain" } }) : n.jsx("div", { style: { borderBottom: "1px solid #000000", width: "110px", marginBottom: "4px" } })
                        }),
                        n.jsx("div", { style: { fontWeight: "700", fontSize: "9px" }, children: "Authorized Signatory" })
                      ]
                    })
                  ]
                }),
                // Calculation Sidebar Right
                n.jsxs("div", {
                  style: { borderLeft: purpleBorder, background: "#faf5ff" },
                  children: [
                    n.jsxs("div", { style: { padding: "6px 12px", borderBottom: purpleBorder, display: "flex", justifyContent: "space-between" }, children: [n.jsx("span", { children: "Sub Total" }), n.jsxs("strong", { children: ["₹ ", subTotal.toFixed(2)] })] }),
                    n.jsxs("div", { style: { padding: "6px 12px", borderBottom: purpleBorder, display: "flex", justifyContent: "space-between" }, children: [n.jsx("span", { children: "Discount" }), n.jsx("strong", { children: "₹ 0.0" })] }),
                    n.jsxs("div", { style: { padding: "6px 12px", borderBottom: purpleBorder, display: "flex", justifyContent: "space-between" }, children: [n.jsx("span", { children: "SGST" }), n.jsxs("strong", { children: ["₹ ", (taxTotal / 2).toFixed(2)] })] }),
                    n.jsxs("div", { style: { padding: "6px 12px", borderBottom: purpleBorder, display: "flex", justifyContent: "space-between" }, children: [n.jsx("span", { children: "CGST" }), n.jsxs("strong", { children: ["₹ ", (taxTotal / 2).toFixed(2)] })] }),
                    n.jsxs("div", { style: { padding: "6px 12px", borderBottom: purpleBorder, display: "flex", justifyContent: "space-between" }, children: [n.jsx("span", { children: "Round off" }), n.jsx("strong", { children: "₹ 0.0" })] }),
                    n.jsxs("div", { style: { padding: "8px 12px", background: purple, color: "#ffffff", fontWeight: "900", fontSize: "11px", display: "flex", justifyContent: "space-between" }, children: [n.jsx("span", { children: "Total" }), n.jsxs("span", { children: ["₹ ", cleanGrandTotal.toFixed(2)] })] }),
                    n.jsxs("div", { style: { padding: "6px 12px", borderBottom: purpleBorder, display: "flex", justifyContent: "space-between" }, children: [n.jsx("span", { children: "Received" }), n.jsxs("strong", { children: ["₹ ", (cleanGrandTotal - balanceDueVal).toFixed(2)] })] }),
                    n.jsxs("div", { style: { padding: "6px 12px", display: "flex", justifyContent: "space-between", color: purple, fontWeight: "800" }, children: [n.jsx("span", { children: "Balance" }), n.jsxs("span", { children: ["₹ ", balanceDueVal.toFixed(2)] })] })
                  ]
                })
              ]
            }),

            // Footer Bank Details & QR
            n.jsxs("div", {
              className: "p-2.5 border-t border-purple-200 bg-purple-50/50 flex justify-between items-center text-[9px]",
              style: { borderTop: purpleBorder, background: lightPurple, padding: "6px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" },
              children: [
                n.jsxs("div", {
                  children: [
                    n.jsx("div", { style: { fontWeight: "800", fontSize: "9px", color: purple, textTransform: "uppercase", letterSpacing: "0.05em" }, children: "BANK DETAILS:" }),
                    n.jsxs("div", { children: [bankName, " | A/C: ", bankAccNo, " | IFSC: ", bankIfsc, " | Branch: ", bankBranch] })
                  ]
                }),
                typeof Mw !== "undefined" && bankUpi && n.jsxs("div", {
                  style: { display: "flex", alignItems: "center", gap: "6px" },
                  children: [
                    n.jsx(Mw, { value: upiQrPayload, size: 36, level: "M" }),
                    n.jsx("div", { style: { fontSize: "8px", fontWeight: "700", color: purple }, children: "Scan & Pay" })
                  ]
                })
              ]
            })
          ]
        }),
        renderAckSlip(purple)
      ]
    });
  }

  // =========================================================================
  // DEFAULT: DESIGN 1 (Basic & Default GST Invoice)
  // =========================================================================
  return n.jsxs("div", {
    className: "printable-area p-4 sm:p-6 text-slate-800 bg-white printable-invoice-wrapper w-full leading-normal",
    style: { width: "100%", maxWidth: "800px", margin: "0 auto", boxSizing: "border-box" },
    children: [
      renderUbitDocTopBar(docTitle, copyLabel, n, tpl),
      n.jsxs("div", {
        className: "ubit-invoice-outer-box ubit-doc-outer-box " + paperClass + "  bg-white overflow-hidden w-full text-[10.5px]",
        style: {
          border: "1.5px solid #000000",
          boxSizing: "border-box",
          background: "#ffffff",
          borderRadius: "0px",
          width: "100%",
          fontSize: "10.5px",
          color: "#000000"
        },
        children: [
          // 3-Column Top Header: User company details (LEFT) | E-Invoice QR (CENTER) | Table details (RIGHT)
          n.jsxs("div", {
            className: "grid grid-cols-12 border-b border-black items-stretch",
            style: { display: "grid", gridTemplateColumns: einvoiceVal ? "5fr 3fr 4fr" : "7fr 5fr", borderBottom: "1px solid #000000", minHeight: "100px" },
            children: [
              // Left: Company details
              n.jsxs("div", {
                className: "p-2.5 text-left border-r border-black flex flex-col justify-center",
                style: { borderRight: "1px solid #000000", padding: "8px 10px", textAlign: "left" },
                children: [
                  comp.logoUrl && n.jsx("img", { src: comp.logoUrl, alt: "Logo", style: { maxHeight: "40px", maxWidth: "120px", objectFit: "contain", marginBottom: "4px" } }),
                  n.jsx("div", { style: { fontWeight: "800", fontSize: "14px", textTransform: "uppercase", color: "#000000" }, children: companyName }),
                  comp.address && n.jsx("div", { style: { fontSize: "10px", color: "#334155", marginTop: "2px", lineHeight: "1.25" }, children: companyAddress }),
                  comp.phone && n.jsxs("div", { style: { fontSize: "10px", color: "#334155" }, children: ["Phone no.: ", companyPhone] }),
                  comp.email && n.jsxs("div", { style: { fontSize: "10px", color: "#334155" }, children: ["Email: ", companyEmail] }),
                  comp.gstin && n.jsxs("div", { style: { fontSize: "10px", fontFamily: "monospace", fontWeight: "700", color: "#0f172a" }, children: ["GSTIN: ", companyGstin] }),
                  comp.state && n.jsxs("div", { style: { fontSize: "10px", color: "#334155" }, children: ["State: ", companyState] })
                ]
              }),
              // Center: E-Invoice QR (only if einvoice data exists)
              einvoiceVal ? n.jsx("div", {
                className: "p-2 text-center border-r border-black flex flex-col items-center justify-center",
                style: { borderRight: "1px solid #000000", padding: "6px 8px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
                children: renderUbitEInvoiceQR(einvoiceVal, n)
              }) : null,
              // Right: Table details
              n.jsx("div", {
                className: "p-0",
                style: { padding: "0" },
                children: renderUbitHeaderBillDetailsTable(inv, vr, n, themeColor)
              })
            ]
          }),

          // Party Details: Billed To (Left) | Shipped To (Middle) | Balance Due (Right Corner)
          n.jsxs("div", {
            className: "border-b border-black text-left",
            style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #000000", padding: "8px 10px", background: "#ffffff", gap: "10px" },
            children: [
              n.jsxs("div", {
                style: { flex: "1 1 0%", textAlign: "left" },
                children: [
                  n.jsx("div", { style: { fontSize: "9px", color: "#475569", fontWeight: "700", textTransform: "uppercase" }, children: isSaleOrderDoc ? "Order To:" : "Billed to:" }),
                  n.jsx("div", { style: { fontWeight: "800", fontSize: "12px", color: "#000000" }, children: partyName }),
                  partyAddress && n.jsx("div", { style: { fontSize: "10px", color: "#334155" }, children: partyAddress }),
                  partyPhone && n.jsxs("div", { style: { fontSize: "10px", color: "#334155" }, children: ["Contact: ", partyPhone] }),
                  partyGstin && n.jsxs("div", { style: { fontSize: "10px", color: "#334155", fontFamily: "monospace" }, children: ["GSTIN: ", partyGstin] }),
                  partyState && n.jsxs("div", { style: { fontSize: "10px", color: "#334155" }, children: ["State: ", partyState] })
                ]
              }),
              shippingAddress && n.jsxs("div", {
                style: { flex: "1 1 0%", textAlign: "left", borderLeft: "1px dashed #cbd5e1", paddingLeft: "10px" },
                children: [
                  n.jsx("div", { style: { fontSize: "9px", color: "#64748b", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "SHIPPED TO:" }),
                  n.jsx("div", { style: { fontSize: "10px", color: "#334155", marginTop: "2px" }, children: shippingAddress })
                ]
              }),
              n.jsxs("div", {
                style: { textAlign: "right", shrink: 0, minWidth: "120px" },
                children: [
                  n.jsx("div", { style: { fontSize: "9px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }, children: "BALANCE DUE:" }),
                  n.jsxs("div", { style: { fontSize: "14px", fontWeight: "900", fontFamily: "monospace", color: "#dc2626", marginTop: "2px" }, children: ["₹ ", balanceDueVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })] })
                ]
              })
            ]
          }),

          // Table Heading & Item Details
          n.jsxs("table", {
            className: "w-full border-collapse text-left",
            style: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
            children: [
              n.jsx("thead", {
                children: n.jsxs("tr", {
                  className: "border-b border-black font-bold",
                  style: { borderBottom: "1px solid #000000", background: themeColor, color: "#ffffff", fontWeight: "700", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.03em" },
                  children: [
                    n.jsx("th", { className: "border-r border-black p-1 text-center w-7", style: { borderRight: "1px solid #000000", padding: "4px 6px", width: "28px", textAlign: "center" }, children: "#" }),
                    n.jsx("th", { className: "border-r border-black p-1", style: { borderRight: "1px solid #000000", padding: "4px 6px" }, children: "Item name" }),
                    hasHsnData && n.jsx("th", { className: "border-r border-black p-1 text-center w-16", style: { borderRight: "1px solid #000000", padding: "4px 6px", width: "64px", textAlign: "center" }, children: "HSN/SAC" }),
                    hasBatchData && n.jsx("th", { className: "border-r border-black p-1 text-center w-16", style: { borderRight: "1px solid #000000", padding: "4px 6px", width: "64px", textAlign: "center" }, children: "Batch No" }),
                    hasMrpData && n.jsx("th", { className: "border-r border-black p-1 text-right w-16", style: { borderRight: "1px solid #000000", padding: "4px 6px", width: "64px", textAlign: "right" }, children: "MRP" }),
                    n.jsx("th", { className: "border-r border-black p-1 text-right w-14", style: { borderRight: "1px solid #000000", padding: "4px 6px", width: "56px", textAlign: "right" }, children: "Qty" }),
                    n.jsx("th", { className: "border-r border-black p-1 text-right w-20", style: { borderRight: "1px solid #000000", padding: "4px 6px", width: "80px", textAlign: "right" }, children: "Price/Unit" }),
                    n.jsx("th", { className: "border-r border-black p-1 text-right w-20", style: { borderRight: "1px solid #000000", padding: "4px 6px", width: "80px", textAlign: "right" }, children: "GST" }),
                    n.jsx("th", { className: "border-r border-black p-1 text-right w-20", style: { borderRight: "1px solid #000000", padding: "4px 6px", width: "80px", textAlign: "right" }, children: "Final Rate" }),
                    n.jsx("th", { className: "p-1 text-right w-24", style: { padding: "4px 6px", width: "96px", textAlign: "right" }, children: "Amount" })
                  ]
                })
              }),
              n.jsx("tbody", {
                children: items.map((it, idx) => {
                  const qty = Number(it.qty || it.quantity || 1);
                  const price = Number(it.price || it.rate || 0);
                  const gst = Number(it.gstRate || it.gst || it.tax || 0);
                  const finalRate = Number(it.finalRate || it.finalPrice || (price * (1 + gst / 100)));
                  const amount = Number(it.total || it.amount || (qty * finalRate));
                  return n.jsxs("tr", {
                    className: "border-b border-black",
                    style: { borderBottom: "1px solid #000000" },
                    children: [
                      n.jsx("td", { className: "border-r border-black p-1 text-center font-mono", style: { borderRight: "1px solid #000000", padding: "4px 6px", textAlign: "center" }, children: idx + 1 }),
                      n.jsx("td", { className: "border-r border-black p-1 font-semibold", style: { borderRight: "1px solid #000000", padding: "4px 6px", fontWeight: "600" }, children: it.name || it.itemName || "Item" }),
                      hasHsnData && n.jsx("td", { className: "border-r border-black p-1 text-center font-mono", style: { borderRight: "1px solid #000000", padding: "4px 6px", textAlign: "center" }, children: it.hsn || "-" }),
                      hasBatchData && n.jsx("td", { className: "border-r border-black p-1 text-center font-mono", style: { borderRight: "1px solid #000000", padding: "4px 6px", textAlign: "center" }, children: it.batchNo || it.batch || "-" }),
                      hasMrpData && n.jsxs("td", { className: "border-r border-black p-1 text-right font-mono", style: { borderRight: "1px solid #000000", padding: "4px 6px", textAlign: "right" }, children: ["₹ ", Number(it.mrp || 0).toFixed(2)] }),
                      n.jsx("td", { className: "border-r border-black p-1 text-right font-mono font-bold", style: { borderRight: "1px solid #000000", padding: "4px 6px", textAlign: "right", fontWeight: "700" }, children: qty }),
                      n.jsxs("td", { className: "border-r border-black p-1 text-right font-mono", style: { borderRight: "1px solid #000000", padding: "4px 6px", textAlign: "right" }, children: ["₹ ", price.toFixed(2)] }),
                      n.jsxs("td", { className: "border-r border-black p-1 text-right font-mono", style: { borderRight: "1px solid #000000", padding: "4px 6px", textAlign: "right" }, children: ["₹ ", ((price * gst) / 100).toFixed(2), " (", gst, "%)"] }),
                      n.jsxs("td", { className: "border-r border-black p-1 text-right font-mono", style: { borderRight: "1px solid #000000", padding: "4px 6px", textAlign: "right" }, children: ["₹ ", finalRate.toFixed(2)] }),
                      n.jsxs("td", { className: "p-1 text-right font-mono font-bold", style: { padding: "4px 6px", textAlign: "right", fontWeight: "700" }, children: ["₹ ", amount.toFixed(2)] })
                    ]
                  }, idx);
                })
              })
            ]
          }),

          // TOTAL Bar
          n.jsxs("div", {
            className: "flex justify-between items-center px-4 py-1.5 border-b border-black font-extrabold text-[11px] bg-slate-50",
            style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 10px", borderBottom: "1px solid #000000", fontWeight: "800", background: "#f8fafc" },
            children: [
              n.jsx("span", { children: "TOTAL" }),
              n.jsxs("span", { className: "font-mono", children: ["₹ ", cleanGrandTotal.toFixed(2)] })
            ]
          }),

          // Amount in Words
          n.jsxs("div", {
            className: "p-2 border-b border-black text-left",
            style: { padding: "6px 10px", borderBottom: "1px solid #000000", textAlign: "left" },
            children: [
              n.jsx("div", { className: "text-[8.5px] text-slate-500 uppercase font-semibold", style: { fontSize: "8.5px", color: "#64748b", textTransform: "uppercase", fontWeight: "600" }, children: "Invoice Amount in Words" }),
              n.jsx("div", { className: "text-[10.5px] font-bold text-slate-900", style: { fontSize: "10.5px", fontWeight: "700", color: "#0f172a" }, children: totalInWords })
            ]
          }),

          // Bank Details & Payment Mode (Left) | Authorized Signatory (Right)
          n.jsxs("div", {
            className: "grid grid-cols-12 border-b border-black items-stretch",
            style: { display: "grid", gridTemplateColumns: "7fr 5fr", borderBottom: "1px solid #000000", alignItems: "stretch" },
            children: [
              // Left: Bank details & UPI QR
              n.jsxs("div", {
                className: "p-2.5 border-r border-black text-left space-y-0.5",
                style: { borderRight: "1px solid #000000", padding: "6px 10px", textAlign: "left" },
                children: [
                  n.jsxs("div", {
                    style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
                    children: [
                      n.jsxs("div", {
                        className: "space-y-0.5",
                        children: [
                          n.jsx("div", { className: "font-bold text-[9px] uppercase tracking-wider text-slate-700", style: { fontWeight: "800", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#334155" }, children: "BANK DETAILS:" }),
                          n.jsxs("div", { className: "text-[9.5px]", style: { fontSize: "9.5px" }, children: ["Bank Name: ", n.jsx("strong", { children: bankName })] }),
                          n.jsxs("div", { className: "text-[9.5px] font-mono", style: { fontSize: "9.5px", fontFamily: "monospace" }, children: ["A/c No: ", n.jsx("strong", { children: bankAccNo })] }),
                          n.jsxs("div", { className: "text-[9.5px] font-mono", style: { fontSize: "9.5px", fontFamily: "monospace" }, children: ["IFSC: ", n.jsx("strong", { children: bankIfsc })] }),
                          n.jsxs("div", { className: "text-[9.5px]", style: { fontSize: "9.5px" }, children: ["Branch: ", bankBranch] }),
                          bankUpi && n.jsxs("div", { className: "text-[9.5px] font-mono", style: { fontSize: "9.5px", fontFamily: "monospace" }, children: ["UPI: ", bankUpi] })
                        ]
                      }),
                      typeof Mw !== "undefined" && bankUpi && n.jsxs("div", {
                        style: { textAlign: "center", shrink: 0, paddingLeft: "8px" },
                        children: [
                          n.jsx(Mw, { value: upiQrPayload, size: 48, level: "M" }),
                          n.jsx("div", { style: { fontSize: "7.5px", fontWeight: "700", color: "#334155" }, children: "Scan to Pay" })
                        ]
                      })
                    ]
                  })
                ]
              }),
              // Right: Payment Mode & Authorized Signatory
              n.jsxs("div", {
                className: "p-2.5 flex flex-col justify-between text-right",
                style: { padding: "6px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "right" },
                children: [
                  n.jsxs("div", {
                    children: [
                      n.jsx("div", { className: "text-[8.5px] text-slate-400 uppercase", style: { fontSize: "9px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8" }, children: "PAYMENT MODE:" }),
                      n.jsx("div", { className: "text-[10px] font-bold text-slate-800", style: { fontSize: "10px", fontWeight: "700", color: "#1e293b" }, children: paymentMode })
                    ]
                  }),
                  n.jsxs("div", {
                    style: { marginTop: "16px" },
                    children: [
                      comp.signatureUrl ? n.jsx("img", { src: comp.signatureUrl, alt: "Signature", style: { maxHeight: "36px", maxWidth: "90px", objectFit: "contain", marginLeft: "auto", marginBottom: "4px" } }) : null,
                      n.jsxs("div", { className: "text-[9.5px] font-bold text-slate-800", style: { fontSize: "9.5px", fontWeight: "700", color: "#1e293b" }, children: ["For ", companyName] }),
                      n.jsx("div", { className: "text-[8.5px] text-slate-500 mt-1", style: { fontSize: "8.5px", color: "#64748b", marginTop: "2px" }, children: "Authorized Signatory" })
                    ]
                  })
                ]
              })
            ]
          }),

          // Terms and Conditions
          n.jsx("div", {
            className: "p-2 text-left",
            style: { padding: "6px 10px", textAlign: "left" },
            children: renderUbitTerms(comp.termsAndConditions || comp.customTerms || "1. Goods once sold will not be taken back without invoice\n2. Payment due within 15 days of bill date\n3. Interest @ 18% p.a. applicable on delayed settlements\n4. Subject to Salem jurisdiction.", n)
          })
        ]
      }),
      renderAckSlip(themeColor)
    ]
  });
}
window.__ubitRenderInvoiceDesign = renderUbitUnifiedDesign;

// Universal exports on window for seamless interoperability
if (typeof window !== 'undefined') {
  window.__ubitRenderUnifiedDesign = renderUbitUnifiedDesign;
  window.__ubitRenderInvoiceDocument = renderUbitUnifiedDesign;
  window.renderUbitUnifiedDesign = renderUbitUnifiedDesign;
}

export {
  renderUbitUnifiedDesign,
  renderUbitUnifiedDesign as renderInvoiceDocument,
  renderUbitDocTopBar,
  renderUbitHeaderBillDetailsTable,
  renderUbitEInvoiceQR,
  renderUbitTerms,
  renderUbitAckSlip
};
